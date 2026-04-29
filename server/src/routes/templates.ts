import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { isAdmin } from '../middleware/permission';
import { resolveActivityDates, DependencyInput, PredecessorData } from '../utils/dependencyScheduler';
import { offsetWorkdays } from '../utils/workday';
import { updateProjectProgress } from '../utils/projectProgress';
import { logger } from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

// ======================== 模板 CRUD ========================

/**
 * GET /api/templates
 * 获取所有项目模板列表
 */
router.get('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = await prisma.projectTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { activities: true } },
      },
    });
    res.json(templates);
  } catch (error) {
    logger.error({ err: error }, '获取模板列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/templates/:id
 * 获取单个模板（含活动树）
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await prisma.projectTemplate.findUnique({
      where: { id: req.params.id },
      include: {
        activities: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!template) {
      res.status(404).json({ error: '模板不存在' });
      return;
    }
    res.json(template);
  } catch (error) {
    logger.error({ err: error }, '获取模板详情错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/templates
 * 创建模板
 */
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: '仅管理员可创建模板' });
      return;
    }

    const { name, description, activities } = req.body;
    if (!name) {
      res.status(400).json({ error: '模板名称不能为空' });
      return;
    }

    const template = await prisma.projectTemplate.create({
      data: {
        name,
        description,
        activities: activities?.length
          ? {
              create: activities.map((a: any, idx: number) => ({
                id: a.id, // 允许前端指定 id 以维持依赖引用
                name: a.name,
                type: a.type || 'TASK',
                phase: a.phase || null,
                planDuration: a.planDuration || null,
                dependencies: a.dependencies || null,
                notes: a.notes || null,
                sortOrder: a.sortOrder ?? idx,
              })),
            }
          : undefined,
      },
      include: {
        activities: { orderBy: { sortOrder: 'asc' } },
      },
    });

    res.status(201).json(template);
  } catch (error) {
    logger.error({ err: error }, '创建模板错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/templates/:id
 * 更新模板（整体替换活动列表）
 */
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: '仅管理员可更新模板' });
      return;
    }

    const { id } = req.params;
    const { name, description, activities } = req.body;

    const existing = await prisma.projectTemplate.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: '模板不存在' });
      return;
    }

    // 事务：更新模板 + 删除旧活动 + 创建新活动
    const template = await prisma.$transaction(async (tx) => {
      // 更新模板基本信息
      await tx.projectTemplate.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
        },
      });

      // 如果提供了活动列表，整体替换
      if (activities !== undefined) {
        await tx.templateActivity.deleteMany({ where: { templateId: id } });
        if (activities.length > 0) {
          await tx.templateActivity.createMany({
            data: activities.map((a: any, idx: number) => ({
              id: a.id,
              templateId: id,
              name: a.name,
              type: a.type || 'TASK',
              phase: a.phase || null,
              planDuration: a.planDuration || null,
              dependencies: a.dependencies || null,
              notes: a.notes || null,
              sortOrder: a.sortOrder ?? idx,
            })),
          });
        }
      }

      return tx.projectTemplate.findUnique({
        where: { id },
        include: { activities: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    res.json(template);
  } catch (error) {
    logger.error({ err: error }, '更新模板错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/templates/:id
 * 删除模板
 */
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: '仅管理员可删除模板' });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.projectTemplate.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: '模板不存在' });
      return;
    }

    await prisma.projectTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '删除模板错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ======================== 模板实例化 ========================

/**
 * POST /api/templates/:id/instantiate
 * 将模板实例化到指定项目，根据项目开始日期推算所有任务日期
 * Body: { projectId, startDate }
 */
router.post('/:id/instantiate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { projectId, startDate } = req.body;

    if (!projectId || !startDate) {
      res.status(400).json({ error: '项目ID和开始日期不能为空' });
      return;
    }

    // 获取模板及活动
    const template = await prisma.projectTemplate.findUnique({
      where: { id },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) {
      res.status(404).json({ error: '模板不存在' });
      return;
    }

    // 检查项目存在
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const templateActivities = template.activities;
    if (templateActivities.length === 0) {
      res.json({ success: true, count: 0 });
      return;
    }

    // 建立 templateId -> 新 uuid 的映射
    const idMap = new Map<string, string>();
    for (const ta of templateActivities) {
      idMap.set(ta.id, crypto.randomUUID());
    }

    const projectStartDate = new Date(startDate);

    // 拓扑排序：先处理没有依赖的活动，再处理有依赖的
    // 同时计算每个活动的 planStartDate / planEndDate
    const resolvedDates = new Map<string, { planStartDate: Date; planEndDate: Date; planDuration: number }>();

    // 多轮解析（处理依赖链）
    const pending = new Set(templateActivities.map((ta) => ta.id));
    let maxIterations = templateActivities.length + 1;

    while (pending.size > 0 && maxIterations-- > 0) {
      for (const ta of templateActivities) {
        if (!pending.has(ta.id)) continue;

        const deps = (ta.dependencies as DependencyInput[] | null) || [];
        const allDepsResolved = deps.every((d) => resolvedDates.has(d.id));

        if (deps.length > 0 && !allDepsResolved) continue;

        // 构建前置任务数据
        const predecessors: PredecessorData[] = deps.map((d) => {
          const resolved = resolvedDates.get(d.id)!;
          return {
            planStartDate: resolved.planStartDate,
            planEndDate: resolved.planEndDate,
          };
        });

        const duration = ta.planDuration || 1;

        if (deps.length === 0) {
          // 无依赖：从项目开始日期算起
          const pStart = offsetWorkdays(projectStartDate, 0); // 确保是工作日
          const pEnd = offsetWorkdays(pStart, duration - 1);
          resolvedDates.set(ta.id, { planStartDate: pStart, planEndDate: pEnd, planDuration: duration });
        } else {
          // 有依赖：通过调度器计算
          const result = resolveActivityDates(deps, predecessors, duration);
          const pStart = result.planStartDate || offsetWorkdays(projectStartDate, 0);
          const pEnd = result.planEndDate || offsetWorkdays(pStart, duration - 1);
          resolvedDates.set(ta.id, {
            planStartDate: pStart,
            planEndDate: pEnd,
            planDuration: result.planDuration || duration,
          });
        }

        pending.delete(ta.id);
      }
    }

    // 创建真实活动
    const createdActivities = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const ta of templateActivities) {
        const newId = idMap.get(ta.id)!;
        const dates = resolvedDates.get(ta.id);
        const deps = (ta.dependencies as DependencyInput[] | null) || [];

        // 将依赖中的 templateActivityId 替换为新的 activityId
        const mappedDeps = deps.map((d) => ({
          ...d,
          id: idMap.get(d.id) || d.id,
        }));

        const activity = await tx.activity.create({
          data: {
            id: newId,
            projectId,
            name: ta.name,
            type: ta.type,
            phase: ta.phase,
            planStartDate: dates?.planStartDate || null,
            planEndDate: dates?.planEndDate || null,
            planDuration: dates?.planDuration || ta.planDuration || null,
            dependencies: mappedDeps.length > 0 ? mappedDeps : null,
            notes: ta.notes,
            sortOrder: ta.sortOrder,
          },
        });
        results.push(activity);
      }
      return results;
    });

    // 更新项目进度
    await updateProjectProgress(projectId);

    res.status(201).json({
      success: true,
      count: createdActivities.length,
      activities: createdActivities,
    });
  } catch (error) {
    logger.error({ err: error }, '模板实例化错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
