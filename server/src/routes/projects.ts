import express, { Request, Response } from 'express';
import { PrismaClient, ProjectStatus } from '@prisma/client';
import { authenticate, invalidateUserCache } from '../middleware/auth';
import { requirePermission, isAdmin, canManageProject, canDeleteProject, sanitizePagination } from '../middleware/permission';
import { VALID_PROJECT_STATUSES, VALID_PRIORITIES, isValidProjectStatus, isValidPriority, isValidDateRange, isValidProgress } from '../utils/validation';
import { auditLog, diffFields } from '../utils/auditLog';

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
      where.OR = [
        ...(where.OR || []),
        { productLine: { in: lines } },
        { productLine: null },
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
      statsWhere.OR = [
        ...(statsWhere.OR || []),
        { productLine: { in: lines } },
        { productLine: null },
      ];
    }

    // 获取统计数据
    const [all, inProgress, completed, onHold] = await Promise.all([
      prisma.project.count({ where: statsWhere }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.IN_PROGRESS } }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.COMPLETED } }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.ON_HOLD } }),
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
          weeklyReports: {
            select: { progressStatus: true },
            orderBy: { weekEnd: 'desc' },
            take: 1,
          },
          activities: {
            where: { phase: { not: null } },
            select: { phase: true, status: true },
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

    // Determine current phase per project
    const PHASE_ORDER = ['EVT', 'DVT', 'PVT', 'MP'];
    function getCurrentPhase(activities: { phase: string | null; status: string }[]): string | null {
      const withPhase = activities.filter((a) => a.phase);
      if (withPhase.length === 0) return null;
      // Prefer the most advanced phase that has IN_PROGRESS activities
      for (let i = PHASE_ORDER.length - 1; i >= 0; i--) {
        if (withPhase.some((a) => a.phase === PHASE_ORDER[i] && a.status === 'IN_PROGRESS')) {
          return PHASE_ORDER[i];
        }
      }
      // Fallback: earliest phase with NOT_STARTED or DELAYED activities
      for (const p of PHASE_ORDER) {
        if (withPhase.some((a) => a.phase === p && (a.status === 'NOT_STARTED' || a.status === 'DELAYED'))) {
          return p;
        }
      }
      // All completed: return the most advanced phase
      for (let i = PHASE_ORDER.length - 1; i >= 0; i--) {
        if (withPhase.some((a) => a.phase === PHASE_ORDER[i])) {
          return PHASE_ORDER[i];
        }
      }
      return null;
    }

    const data = projects.map(({ weeklyReports, activities, ...rest }) => ({
      ...rest,
      latestProgressStatus: weeklyReports[0]?.progressStatus ?? null,
      currentPhase: getCurrentPhase(activities),
    }));

    res.json({
      data,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      stats: {
        all,
        inProgress,
        completed,
        onHold,
      },
    });
  } catch (error) {
    console.error('获取项目列表错误:', error);
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
    console.error('获取项目详情错误:', error);
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

      auditLog({ req, action: 'CREATE', resourceType: 'project', resourceId: project.id, resourceName: project.name });

      res.status(201).json(project);
    } catch (error) {
      console.error('创建项目错误:', error);
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

      const changes = diffFields(
        existingProject as unknown as Record<string, unknown>,
        updateData,
        ['name', 'status', 'priority', 'managerId', 'startDate', 'endDate', 'productLine'],
      );

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

      auditLog({ req, action: 'UPDATE', resourceType: 'project', resourceId: id, resourceName: existingProject.name, changes });

      res.json(project);
    } catch (error) {
      console.error('更新项目错误:', error);
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

      auditLog({ req, action: 'DELETE', resourceType: 'project', resourceId: id, resourceName: existingProject.name });

      res.json({ success: true });
    } catch (error) {
      console.error('删除项目错误:', error);
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
    console.error('获取协作者列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/projects/:id/members
 * 添加协作者（仅项目经理或管理员）
 */
router.post(
  '/:id/members',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ error: '用户ID不能为空' });
        return;
      }

      // 检查项目是否存在
      const project = await prisma.project.findUnique({
        where: { id },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      // 只有项目经理或管理员可以添加协作者
      if (!isAdmin(req) && project.managerId !== req.user!.id) {
        res.status(403).json({ error: '只有项目经理或管理员可以添加协作者' });
        return;
      }

      // 不能添加项目经理为协作者
      if (userId === project.managerId) {
        res.status(400).json({ error: '项目经理无需添加为协作者' });
        return;
      }

      // 检查用户是否存在
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(400).json({ error: '用户不存在' });
        return;
      }

      // 检查是否已经是协作者
      const existing = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
      });

      if (existing) {
        res.status(400).json({ error: '该用户已经是协作者' });
        return;
      }

      const member = await prisma.projectMember.create({
        data: { projectId: id, userId },
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

      // 清除该用户的认证缓存（collaboratingProjectIds 已变更）
      invalidateUserCache(userId);

      res.status(201).json(member);
    } catch (error) {
      console.error('添加协作者错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/projects/:id/members/:userId
 * 移除协作者（仅项目经理或管理员）
 */
router.delete(
  '/:id/members/:userId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, userId } = req.params;

      // 检查项目是否存在
      const project = await prisma.project.findUnique({
        where: { id },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      // 只有项目经理或管理员可以移除协作者
      if (!isAdmin(req) && project.managerId !== req.user!.id) {
        res.status(403).json({ error: '只有项目经理或管理员可以移除协作者' });
        return;
      }

      // 检查是否是协作者
      const existing = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
      });

      if (!existing) {
        res.status(404).json({ error: '该用户不是协作者' });
        return;
      }

      await prisma.projectMember.delete({
        where: { projectId_userId: { projectId: id, userId } },
      });

      // 清除该用户的认证缓存（collaboratingProjectIds 已变更）
      invalidateUserCache(userId);

      res.json({ success: true });
    } catch (error) {
      console.error('移除协作者错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
