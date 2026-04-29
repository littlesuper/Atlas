import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { logger } from '../utils/logger';
import { autoAssignByRole, findActiveActivitiesByExecutor } from '../utils/roleMembershipResolver';
import { auditLog } from '../utils/auditLog';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authenticate, requirePermission('role', 'read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleId, userId, includeInactive } = req.query;

    const where: any = {};
    if (roleId) where.roleId = roleId as string;
    if (userId) where.userId = userId as string;
    if (includeInactive !== 'true') where.isActive = true;

    const data = await prisma.roleMember.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, realName: true, canLogin: true } },
      },
    });

    res.json({ data });
  } catch (error) {
    logger.error({ err: error }, '获取角色成员列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/', authenticate, requirePermission('role', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleId, userId, sortOrder } = req.body;

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) { res.status(400).json({ error: '角色不存在' }); return; }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) { res.status(400).json({ error: '用户不存在' }); return; }

    const existing = await prisma.roleMember.findUnique({
      where: { roleId_userId: { roleId, userId } },
    });

    if (existing) {
      if (!existing.isActive) {
        const restored = await prisma.roleMember.update({
          where: { id: existing.id },
          data: { isActive: true, sortOrder: sortOrder ?? existing.sortOrder },
          include: {
            role: { select: { id: true, name: true } },
            user: { select: { id: true, realName: true, canLogin: true } },
          },
        });
        auditLog({ req, action: 'UPDATE', resourceType: 'roleMember', resourceId: restored.id, resourceName: `${restored.role.name} - ${restored.user.realName}` });
        res.status(201).json(restored);
        return;
      }
      res.status(409).json({ error: '该用户已是该角色的成员' });
      return;
    }

    const member = await prisma.roleMember.create({
      data: {
        roleId,
        userId,
        sortOrder: sortOrder ?? 0,
        createdBy: (req as any).user?.id,
      },
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, realName: true, canLogin: true } },
      },
    });

    auditLog({ req, action: 'CREATE', resourceType: 'roleMember', resourceId: member.id, resourceName: `${member.role.name} - ${member.user.realName}` });

    res.status(201).json(member);
  } catch (error) {
    logger.error({ err: error }, '添加角色成员错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.patch('/:id', authenticate, requirePermission('role', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { sortOrder, isActive } = req.body;

    const existing = await prisma.roleMember.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: '角色成员不存在' }); return; }

    const data: any = {};
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.roleMember.update({
      where: { id },
      data,
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, realName: true, canLogin: true } },
      },
    });

    auditLog({ req, action: 'UPDATE', resourceType: 'roleMember', resourceId: updated.id, resourceName: `${updated.role.name} - ${updated.user.realName}` });

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, '修改角色成员错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.delete('/:id', authenticate, requirePermission('role', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const cascadeMode = (req.query.cascadeMode as string) || 'keep';
    const cascadeActivityIds = req.query.cascadeActivityIds
      ? (Array.isArray(req.query.cascadeActivityIds) ? req.query.cascadeActivityIds : [req.query.cascadeActivityIds]) as string[]
      : [];

    const existing = await prisma.roleMember.findUnique({
      where: { id },
      include: { role: { select: { name: true } }, user: { select: { realName: true } } },
    });
    if (!existing) { res.status(404).json({ error: '角色成员不存在' }); return; }

    await prisma.roleMember.update({
      where: { id },
      data: { isActive: false },
    });

    auditLog({ req, action: 'DELETE', resourceType: 'roleMember', resourceId: existing.id, resourceName: `${existing.role.name} - ${existing.user.realName}` });

    let cascadedActivityCount = 0;
    const remainingEmptyActivities: Array<{ id: string; name: string }> = [];

    if (cascadeMode === 'removeAll' || cascadeMode === 'selective') {
      const activeActivities = await findActiveActivitiesByExecutor(existing.userId);

      const targetActivities = cascadeMode === 'selective'
        ? activeActivities.filter(a => cascadeActivityIds.includes(a.activityId))
        : activeActivities;

      const targetIds = targetActivities.map(a => a.activityId);

      if (targetIds.length > 0) {
        await prisma.activityExecutor.deleteMany({
          where: {
            userId: existing.userId,
            activityId: { in: targetIds },
          },
        });
        cascadedActivityCount = targetIds.length;

        for (const actId of targetIds) {
          const remaining = await prisma.activityExecutor.count({
            where: { activityId: actId },
          });
          if (remaining === 0) {
            const act = await prisma.activity.findUnique({
              where: { id: actId },
              select: { id: true, name: true },
            });
            if (act) remainingEmptyActivities.push({ id: act.id, name: act.name });
          }
        }
      }
    }

    res.json({
      deleted: { id: existing.id },
      cascadedActivityCount,
      remainingEmptyActivities,
    });
  } catch (error) {
    logger.error({ err: error }, '删除角色成员错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/batch-set', authenticate, requirePermission('role', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleId, members } = req.body;

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) { res.status(400).json({ error: '角色不存在' }); return; }

    const incomingUserIds = new Set(members.map((m: any) => m.userId));
    const userIdToSortOrder = new Map(members.map((m: any) => [m.userId, m.sortOrder ?? 0]));

    const current = await prisma.roleMember.findMany({
      where: { roleId },
    });

    const toSoftDelete = current.filter(m => !incomingUserIds.has(m.userId) && m.isActive);
    const toCreate: any[] = [];
    const toUpdate: any[] = [];

    for (const m of members) {
      const existing = current.find(c => c.userId === m.userId);
      if (existing) {
        toUpdate.push({ id: existing.id, sortOrder: m.sortOrder ?? 0 });
      } else {
        toCreate.push({ userId: m.userId, sortOrder: m.sortOrder ?? 0 });
      }
    }

    await prisma.$transaction(async (tx: any) => {
      for (const m of toSoftDelete) {
        await tx.roleMember.update({ where: { id: m.id }, data: { isActive: false } });
      }
      for (const u of toUpdate) {
        await tx.roleMember.update({
          where: { id: u.id },
          data: { isActive: true, sortOrder: u.sortOrder },
        });
      }
      for (const c of toCreate) {
        await tx.roleMember.create({
          data: {
            roleId,
            userId: c.userId,
            sortOrder: c.sortOrder,
            createdBy: (req as any).user?.id,
          },
        });
      }
    });

    const result = await prisma.roleMember.findMany({
      where: { roleId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, realName: true, canLogin: true } },
      },
    });

    auditLog({ req, action: 'UPDATE', resourceType: 'roleMember', resourceId: role.id, resourceName: `批量设置 ${role.name} 成员 (${toCreate.length}新增, ${toSoftDelete.length}移除, ${toUpdate.length}更新)` });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, '批量设置角色成员错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/preview/:roleId', authenticate, requirePermission('role', 'read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleId } = req.params;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });

    if (!role) { res.status(404).json({ error: '角色不存在' }); return; }

    const members = await prisma.roleMember.findMany({
      where: { roleId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, realName: true, canLogin: true } },
      },
    });

    res.json({
      roleId,
      role: { name: role.name },
      members: members.map(m => ({
        userId: m.user.id,
        realName: m.user.realName,
        sortOrder: m.sortOrder,
        canLogin: m.user.canLogin,
      })),
      isEmpty: members.length === 0,
    });
  } catch (error) {
    logger.error({ err: error }, '预览角色成员错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
