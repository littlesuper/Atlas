import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient, ProjectStatus } from '@prisma/client';
import { authenticate, invalidateUserCache } from '../middleware/auth';
import { requirePermission, isAdmin, canManageProject, canDeleteProject, sanitizePagination } from '../middleware/permission';
import { VALID_PROJECT_STATUSES, VALID_PRIORITIES, isValidProjectStatus, isValidPriority, isValidDateRange, isValidProgress } from '../utils/validation';
import { logger } from '../utils/logger';
import { recordBusinessEvent } from '../utils/metrics';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/projects
 * 获取项目列表（支持分页、状态筛选、关键词搜索、产品线筛选）
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      pageSize = '20',
      status,
      keyword,
      productLine,
    } = req.query;

    const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    // 构建筛选条件
    const where: any = {};

    // 状态筛选
    if (status) {
      where.status = status as ProjectStatus;
    }

    // 关键词搜索（名称或描述）
    if (keyword) {
      where.OR = [
        { name: { contains: keyword as string } },
        { description: { contains: keyword as string } },
      ];
    }

    // 产品线筛选（支持逗号分隔多值，同时包含productLine为null的项目）
    if (productLine) {
      const lines = (productLine as string).split(',').map(l => l.trim());
      where.AND = [
        ...(where.AND || []),
        { OR: [{ productLine: { in: lines } }, { productLine: null }] },
      ];
    }

    // 统计条件（不受status和分页影响，仅受productLine和keyword影响）
    const statsWhere: any = {};
    if (keyword) {
      statsWhere.OR = [
        { name: { contains: keyword as string } },
        { description: { contains: keyword as string } },
      ];
    }
    if (productLine) {
      const lines = (productLine as string).split(',').map(l => l.trim());
      statsWhere.AND = [
        ...(statsWhere.AND || []),
        { OR: [{ productLine: { in: lines } }, { productLine: null }] },
      ];
    }

    // 获取统计数据
    const [all, inProgress, completed, onHold, archived] = await Promise.all([
      prisma.project.count({ where: statsWhere }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.IN_PROGRESS } }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.COMPLETED } }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.ON_HOLD } }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.ARCHIVED } }),
    ]);

    // 获取项目列表
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: pageSizeNum,
        orderBy: {
          startDate: 'asc', // 按开始时间升序（从远到近）
        },
        include: {
          manager: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  realName: true,
                  username: true,
                },
              },
            },
          },
          _count: {
            select: {
              activities: true,
              products: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.json({
      data: projects,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      stats: {
        all,
        inProgress,
        completed,
        onHold,
        archived,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '获取项目列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/projects/archives/:archiveId
 * 获取某次归档的完整快照（必须在 /:id 之前注册）
 */
router.get('/archives/:archiveId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { archiveId } = req.params;
    const archive = await prisma.projectArchive.findUnique({
      where: { id: archiveId },
    });
    if (!archive) {
      res.status(404).json({ error: '归档记录不存在' });
      return;
    }
    res.json(archive);
  } catch (error) {
    logger.error({ err: error }, '获取归档快照错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/projects/:id
 * 获取单个项目
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        manager: {
          select: {
            id: true,
            realName: true,
            username: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                realName: true,
                username: true,
              },
            },
          },
        },
        _count: {
          select: {
            activities: true,
            products: true,
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    res.json(project);
  } catch (error) {
    logger.error({ err: error }, '获取项目详情错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/projects
 * 创建项目
 * 权限：project:create
 */
router.post(
  '/',
  authenticate,
  requirePermission('project', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        name,
        description,
        productLine,
        status,
        priority,
        startDate,
        endDate,
        managerId,
      } = req.body;

      // 验证必填字段
      if (!name || !productLine || !status || !priority || !managerId) {
        res.status(400).json({ error: '缺少必填字段' });
        return;
      }

      // 验证状态枚举值
      if (!isValidProjectStatus(status)) {
        res.status(400).json({ error: `无效的状态值，允许的值为: ${VALID_PROJECT_STATUSES.join(', ')}` });
        return;
      }

      // 验证优先级枚举值
      if (!isValidPriority(priority)) {
        res.status(400).json({ error: `无效的优先级值，允许的值为: ${VALID_PRIORITIES.join(', ')}` });
        return;
      }

      // 验证日期范围
      if (startDate && endDate && !isValidDateRange(startDate, endDate)) {
        res.status(400).json({ error: '结束日期不能早于开始日期' });
        return;
      }

      // 验证管理员是否存在
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });

      if (!manager) {
        res.status(400).json({ error: '项目经理不存在' });
        return;
      }

      // 创建项目
      const project = await prisma.project.create({
        data: {
          name,
          description,
          productLine,
          status,
          priority,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          managerId,
        },
        include: {
          manager: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
          _count: {
            select: {
              activities: true,
              products: true,
            },
          },
        },
      });

      recordBusinessEvent('project_create', 'success');
      res.status(201).json(project);
    } catch (error) {
      recordBusinessEvent('project_create', 'error');
      logger.error({ err: error }, '创建项目错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/projects/:id
 * 更新项目
 * 权限：project:update
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        productLine,
        status,
        priority,
        startDate,
        endDate,
        managerId,
        progress,
      } = req.body;

      // 检查项目是否存在
      const existingProject = await prisma.project.findUnique({
        where: { id },
      });

      if (!existingProject) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      // 归档项目不能通过普通更新接口修改
      if (existingProject.status === ProjectStatus.ARCHIVED) {
        res.status(403).json({ error: '归档项目不可编辑，请先取消归档' });
        return;
      }

      // 项目归属检查：管理员、项目经理或协作者可以修改
      if (!canManageProject(req, existingProject.managerId, id)) {
        res.status(403).json({ error: '只能修改自己负责的项目' });
        return;
      }

      // 验证进度范围
      if (progress !== undefined && !isValidProgress(progress)) {
        res.status(400).json({ error: '进度值必须在 0 到 100 之间' });
        return;
      }

      // 验证状态枚举值
      if (status !== undefined && !isValidProjectStatus(status)) {
        res.status(400).json({ error: `无效的状态值，允许的值为: ${VALID_PROJECT_STATUSES.join(', ')}` });
        return;
      }

      // 不允许通过普通更新接口设置为 ARCHIVED（必须走 /archive 端点）
      if (status === 'ARCHIVED') {
        res.status(400).json({ error: '请使用归档功能来归档项目' });
        return;
      }

      // 验证优先级枚举值
      if (priority !== undefined && !isValidPriority(priority)) {
        res.status(400).json({ error: `无效的优先级值，允许的值为: ${VALID_PRIORITIES.join(', ')}` });
        return;
      }

      // 验证日期范围
      if (startDate !== undefined && endDate !== undefined && startDate && endDate && !isValidDateRange(startDate, endDate)) {
        res.status(400).json({ error: '结束日期不能早于开始日期' });
        return;
      }

      // 如果更新managerId，验证管理员是否存在
      if (managerId) {
        const manager = await prisma.user.findUnique({
          where: { id: managerId },
        });

        if (!manager) {
          res.status(400).json({ error: '项目经理不存在' });
          return;
        }
      }

      // 更新项目
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (productLine !== undefined) updateData.productLine = productLine;
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
      if (managerId !== undefined) updateData.managerId = managerId;
      if (progress !== undefined) updateData.progress = progress;

      const project = await prisma.project.update({
        where: { id },
        data: updateData,
        include: {
          manager: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
          _count: {
            select: {
              activities: true,
              products: true,
            },
          },
        },
      });

      res.json(project);
    } catch (error) {
      logger.error({ err: error }, '更新项目错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/projects/:id
 * 删除项目
 * 权限：project:delete
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('project', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // 检查项目是否存在
      const existingProject = await prisma.project.findUnique({
        where: { id },
      });

      if (!existingProject) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      // 项目归属检查：仅管理员或项目经理可以删除（协作者不能删除）
      if (!canDeleteProject(req, existingProject.managerId)) {
        res.status(403).json({ error: '只有项目经理或管理员可以删除项目' });
        return;
      }

      // 删除项目（级联删除相关数据）
      await prisma.project.delete({
        where: { id },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, '删除项目错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

// ==================== 项目协作者管理 ====================

/**
 * GET /api/projects/:id/members
 * 获取项目协作者列表
 */
router.get('/:id/members', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: {
        user: {
          select: {
            id: true,
            realName: true,
            username: true,
          },
        },
      },
    });

    res.json(members);
  } catch (error) {
    logger.error({ err: error }, '获取协作者列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

const PROJECT_MEMBER_ROLES = [
  'PROJECT_MANAGER',
  'COLLABORATOR',
  'HW_PRODUCT',
  'SW_PRODUCT',
  'HW_DEV',
  'SW_DEV',
  'HW_QA',
  'SW_QA',
  'STRUCTURE',
  'QUALITY',
  'DESIGNER',
  'PROCUREMENT',
  'LEGAL',
  'SUPPLY_CHAIN',
  'OTHER',
] as const;

/**
 * POST /api/projects/:id/members
 * 添加协作者（仅项目经理或管理员）
 */
router.post(
  '/:id/members',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { userId, role = 'COLLABORATOR' } = req.body;

      if (!userId) {
        res.status(400).json({ error: '用户ID不能为空' });
        return;
      }

      if (!PROJECT_MEMBER_ROLES.includes(role)) {
        res.status(400).json({ error: '角色值非法' });
        return;
      }

      const project = await prisma.project.findUnique({
        where: { id },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!isAdmin(req) && project.managerId !== req.user!.id) {
        res.status(403).json({ error: '只有项目经理或管理员可以添加协作者' });
        return;
      }

      if (userId === project.managerId && role === 'PROJECT_MANAGER') {
        res.status(400).json({ error: '项目经理已是该项目负责人' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(400).json({ error: '用户不存在' });
        return;
      }

      const existing = await prisma.projectMember.findUnique({
        where: { projectId_userId_role: { projectId: id, userId, role } },
      });

      if (existing) {
        res.status(400).json({ error: '该用户已在此角色下' });
        return;
      }

      const member = await prisma.projectMember.create({
        data: { projectId: id, userId, role },
        include: {
          user: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
        },
      });

      invalidateUserCache(userId);

      res.status(201).json(member);
    } catch (error) {
      logger.error({ err: error }, '添加协作者错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/projects/:id/members
 * 批量替换项目成员（按角色分组），用于全屏编辑页一次性提交
 * Body: { members: [{ userId, role }, ...] }
 */
router.put(
  '/:id/members',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { members } = req.body as { members?: Array<{ userId: string; role: string }> };

      if (!Array.isArray(members)) {
        res.status(400).json({ error: 'members 必须是数组' });
        return;
      }

      for (const m of members) {
        if (!m.userId || !PROJECT_MEMBER_ROLES.includes(m.role as typeof PROJECT_MEMBER_ROLES[number])) {
          res.status(400).json({ error: '成员或角色值非法' });
          return;
        }
      }

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!isAdmin(req) && project.managerId !== req.user!.id) {
        res.status(403).json({ error: '只有项目经理或管理员可以编辑项目成员' });
        return;
      }

      // 去重（同一 userId+role 只保留一条）
      const seen = new Set<string>();
      const dedup = members.filter((m) => {
        const k = `${m.userId}::${m.role}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const oldMembers = await prisma.projectMember.findMany({ where: { projectId: id } });
      const oldUserIds = new Set(oldMembers.map((m) => m.userId));

      await prisma.$transaction([
        prisma.projectMember.deleteMany({ where: { projectId: id } }),
        ...(dedup.length > 0
          ? [
              prisma.projectMember.createMany({
                data: dedup.map((m) => ({ projectId: id, userId: m.userId, role: m.role })),
              }),
            ]
          : []),
      ]);

      const affectedUserIds = new Set<string>([...oldUserIds, ...dedup.map((m) => m.userId)]);
      affectedUserIds.forEach((uid) => invalidateUserCache(uid));

      const result = await prisma.projectMember.findMany({
        where: { projectId: id },
        include: {
          user: { select: { id: true, realName: true, username: true } },
        },
      });

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, '批量替换项目成员错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/projects/:id/members/:userId
 * 移除协作者（仅项目经理或管理员）
 * Query: role 可选，未传则移除该用户在项目下的所有角色
 */
router.delete(
  '/:id/members/:userId',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, userId } = req.params;
      const role = typeof req.query.role === 'string' ? req.query.role : undefined;

      const project = await prisma.project.findUnique({
        where: { id },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!isAdmin(req) && project.managerId !== req.user!.id) {
        res.status(403).json({ error: '只有项目经理或管理员可以移除协作者' });
        return;
      }

      if (role) {
        if (!PROJECT_MEMBER_ROLES.includes(role as typeof PROJECT_MEMBER_ROLES[number])) {
          res.status(400).json({ error: '角色值非法' });
          return;
        }
        const existing = await prisma.projectMember.findUnique({
          where: { projectId_userId_role: { projectId: id, userId, role } },
        });
        if (!existing) {
          res.status(404).json({ error: '该用户不在此角色下' });
          return;
        }
        await prisma.projectMember.delete({
          where: { projectId_userId_role: { projectId: id, userId, role } },
        });
      } else {
        const result = await prisma.projectMember.deleteMany({
          where: { projectId: id, userId },
        });
        if (result.count === 0) {
          res.status(404).json({ error: '该用户不是协作者' });
          return;
        }
      }

      invalidateUserCache(userId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, '移除协作者错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

// ==================== 项目归档 ====================

/**
 * POST /api/projects/:id/archive
 * 归档项目：保存完整快照并设置状态为 ARCHIVED
 */
router.post(
  '/:id/archive',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { remark } = req.body;

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          manager: { select: { id: true, realName: true, username: true } },
          members: { include: { user: { select: { id: true, realName: true, username: true } } } },
        },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (project.status === ProjectStatus.ARCHIVED) {
        res.status(400).json({ error: '项目已处于归档状态' });
        return;
      }

      if (!canManageProject(req, project.managerId, id)) {
        res.status(403).json({ error: '只有项目经理或管理员可以归档项目' });
        return;
      }

      // 查询项目全量数据
      const [activities, products, weeklyReports, riskAssessments, activityComments] = await Promise.all([
        prisma.activity.findMany({
          where: { projectId: id },
          include: {
            executors: {
              include: { user: { select: { id: true, realName: true } } },
            },
          },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.product.findMany({ where: { projectId: id } }),
        prisma.weeklyReport.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
        prisma.riskAssessment.findMany({ where: { projectId: id }, orderBy: { assessedAt: 'desc' } }),
        prisma.activityComment.findMany({
          where: { activity: { projectId: id } },
          include: { user: { select: { id: true, realName: true, username: true } } },
        }),
      ]);

      // 组装快照
      const snapshot = {
        project: {
          name: project.name,
          description: project.description,
          productLine: project.productLine,
          status: project.status, // 归档前的状态
          priority: project.priority,
          startDate: project.startDate,
          endDate: project.endDate,
          progress: project.progress,
          managerId: project.managerId,
          managerName: project.manager?.realName || project.manager?.username,
          members: project.members.map((m: any) => ({
            userId: m.user.id,
            realName: m.user.realName,
            role: 'member',
          })),
        },
        activities,
        products,
        weeklyReports,
        riskAssessments,
        activityComments,
      };

      // 创建归档记录并更新项目状态
      const archive = await prisma.$transaction(async (tx) => {
        const arc = await tx.projectArchive.create({
          data: {
            projectId: id,
            snapshot: snapshot as any,
            archivedBy: req.user!.id,
            remark: remark || null,
          },
        });
        await tx.project.update({
          where: { id },
          data: { status: ProjectStatus.ARCHIVED },
        });
        return arc;
      });

      res.json(archive);
    } catch (error) {
      logger.error({ err: error }, '归档项目错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * POST /api/projects/:id/unarchive
 * 取消归档：恢复项目为归档前的状态
 */
router.post(
  '/:id/unarchive',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const project = await prisma.project.findUnique({ where: { id } });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (project.status !== ProjectStatus.ARCHIVED) {
        res.status(400).json({ error: '项目未处于归档状态' });
        return;
      }

      if (!canManageProject(req, project.managerId, id)) {
        res.status(403).json({ error: '只有项目经理或管理员可以取消归档' });
        return;
      }

      // 从最近的归档记录恢复原状态
      const latestArchive = await prisma.projectArchive.findFirst({
        where: { projectId: id },
        orderBy: { archivedAt: 'desc' },
      });

      const previousStatus = (latestArchive?.snapshot as any)?.project?.status || 'COMPLETED';
      const restoredStatus = (['IN_PROGRESS', 'COMPLETED', 'ON_HOLD'].includes(previousStatus))
        ? previousStatus as ProjectStatus
        : ProjectStatus.COMPLETED;

      const updated = await prisma.project.update({
        where: { id },
        data: { status: restoredStatus },
        include: {
          manager: { select: { id: true, realName: true, username: true } },
          _count: { select: { activities: true, products: true } },
        },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, '取消归档错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * POST /api/projects/:id/snapshot
 * 创建项目快照（不改变项目状态，仅保存当前数据的快照）
 */
router.post(
  '/:id/snapshot',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { remark } = req.body;

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          manager: { select: { id: true, realName: true, username: true } },
          members: { include: { user: { select: { id: true, realName: true, username: true } } } },
        },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!canManageProject(req, project.managerId, id)) {
        res.status(403).json({ error: '只有项目经理或管理员可以创建快照' });
        return;
      }

      // 查询项目全量数据
      const [activities, products, weeklyReports, riskAssessments, activityComments] = await Promise.all([
        prisma.activity.findMany({
          where: { projectId: id },
          include: {
            executors: {
              include: { user: { select: { id: true, realName: true } } },
            },
          },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.product.findMany({ where: { projectId: id } }),
        prisma.weeklyReport.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
        prisma.riskAssessment.findMany({ where: { projectId: id }, orderBy: { assessedAt: 'desc' } }),
        prisma.activityComment.findMany({
          where: { activity: { projectId: id } },
          include: { user: { select: { id: true, realName: true, username: true } } },
        }),
      ]);

      const snapshot = {
        project: {
          name: project.name,
          description: project.description,
          productLine: project.productLine,
          status: project.status,
          priority: project.priority,
          startDate: project.startDate,
          endDate: project.endDate,
          progress: project.progress,
          managerId: project.managerId,
          managerName: project.manager?.realName || project.manager?.username,
          members: project.members.map((m: any) => ({
            userId: m.user.id,
            realName: m.user.realName,
            role: 'member',
          })),
        },
        activities,
        products,
        weeklyReports,
        riskAssessments,
        activityComments,
      };

      const archive = await prisma.projectArchive.create({
        data: {
          projectId: id,
          snapshot: snapshot as any,
          archivedBy: req.user!.id,
          remark: remark || null,
        },
      });

      res.json(archive);
    } catch (error) {
      logger.error({ err: error }, '创建项目快照错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/projects/:id/archives
 * 获取快照/归档历史列表（不含 snapshot，含创建人信息）
 */
router.get('/:id/archives', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const archives = await prisma.projectArchive.findMany({
      where: { projectId: id },
      select: {
        id: true,
        archivedBy: true,
        archivedAt: true,
        remark: true,
      },
      orderBy: { archivedAt: 'desc' },
    });

    // 查询创建人信息
    const userIds = [...new Set(archives.map(a => a.archivedBy))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, realName: true, username: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const result = archives.map(a => ({
      ...a,
      creator: userMap.get(a.archivedBy) || null,
    }));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, '获取归档历史错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * rejectIfArchived 中间件工厂
 * 从请求中提取 projectId 并检查项目是否已归档
 */
export function rejectIfArchived(getProjectId: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = getProjectId(req);
      if (!projectId) {
        next();
        return;
      }
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { status: true },
      });
      if (project?.status === ProjectStatus.ARCHIVED) {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export default router;
