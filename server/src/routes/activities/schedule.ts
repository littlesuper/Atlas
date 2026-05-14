import express, { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission, canManageProject } from '../../middleware/permission';
import { updateProjectProgress } from '../../utils/projectProgress';
import { auditLog } from '../../utils/auditLog';
import { callAi } from '../../utils/aiClient';
import { calculateCriticalPath } from '../../utils/criticalPath';
import { logger } from '../../utils/logger';
import {
  prisma,
  type Prisma,
  dependenciesFromJson,
} from './shared';
import { DependencyInput, PredecessorData, resolveActivityDates } from '../../utils/dependencyScheduler';

const router = express.Router();

router.get('/project/:projectId/critical-path', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const activities = await prisma.activity.findMany({
      where: { projectId },
      select: { id: true, planStartDate: true, planEndDate: true, planDuration: true, dependencies: true },
    });

    const criticalActivityIds = calculateCriticalPath(activities);
    res.json({ criticalActivityIds });
  } catch (error) {
    logger.error({ err: error }, '计算关键路径错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/project/:projectId/ai-schedule', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, productLine: true },
    });
    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const currentActivities = await prisma.activity.findMany({
      where: { projectId },
      select: { id: true, name: true, type: true, phase: true, planDuration: true, status: true },
      orderBy: { sortOrder: 'asc' },
    });

    const historicalProjects = await prisma.project.findMany({
      where: {
        status: 'COMPLETED',
        ...(project.productLine ? { productLine: project.productLine } : {}),
        id: { not: projectId },
      },
      select: { id: true, name: true },
      take: 10,
    });

    let historicalActivities: Array<{ name: string; type: string; phase: string | null; planDuration: number | null; duration: number | null }> = [];
    if (historicalProjects.length > 0) {
      historicalActivities = await prisma.activity.findMany({
        where: {
          projectId: { in: historicalProjects.map((p) => p.id) },
          status: 'COMPLETED',
          duration: { not: null },
        },
        select: { name: true, type: true, phase: true, planDuration: true, duration: true },
      });
    }

    const currentData = currentActivities.map((a) => ({
      name: a.name,
      type: a.type,
      phase: a.phase,
      currentPlanDuration: a.planDuration,
      status: a.status,
    }));

    const historyData = historicalActivities.map((a) => ({
      name: a.name,
      type: a.type,
      phase: a.phase,
      planDuration: a.planDuration,
      actualDuration: a.duration,
    }));

    const aiResult = await callAi({
      feature: 'schedule',
      projectId,
      systemPrompt: `你是一个硬件项目管理专家。请根据项目当前的活动列表和历史项目的实际工期数据，为每个活动建议合理的工期（工作日），并识别可能的风险。
返回 JSON 格式：
{
  "suggestions": [
    { "name": "活动名称", "suggestedDuration": 数字, "reason": "建议原因" }
  ],
  "risks": [
    { "activity": "活动名称", "risk": "风险描述", "severity": "HIGH/MEDIUM/LOW" }
  ],
  "summary": "总结建议"
}`,
      userPrompt: `项目：${project.name}（产品线：${project.productLine || '未指定'}）

当前活动列表：
${JSON.stringify(currentData, null, 2)}

历史项目实际工期数据（${historicalActivities.length} 条记录）：
${JSON.stringify(historyData, null, 2)}`,
    });

    if (aiResult?.content) {
      let jsonStr = aiResult.content;
      const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) jsonStr = fenced[1];
      try {
        const parsed = JSON.parse(jsonStr.trim());
        res.json(parsed);
        return;
      } catch { /* fall through to rule-based */ }
    }

    const suggestions = currentActivities.map((a) => {
      const similar = historicalActivities.filter((h) =>
        h.name === a.name || (h.phase === a.phase && h.type === a.type)
      );
      if (similar.length > 0) {
        const avgDuration = Math.round(
          similar.reduce((sum: number, h) => sum + (h.duration || 0), 0) / similar.length
        );
        return {
          name: a.name,
          suggestedDuration: avgDuration,
          reason: `基于 ${similar.length} 个历史同类活动平均实际工期`,
        };
      }
      return null;
    }).filter(Boolean);

    const risks = currentActivities
      .filter((a) => a.status === 'IN_PROGRESS' && !a.planDuration)
      .map((a) => ({
        activity: a.name,
        risk: '未设定计划工期，无法评估进度偏差',
        severity: 'MEDIUM',
      }));

    res.json({
      suggestions,
      risks,
      summary: historicalActivities.length > 0
        ? `基于 ${historicalProjects.length} 个历史项目的 ${historicalActivities.length} 条活动数据生成建议`
        : '暂无历史数据，建议手动设定工期后积累数据',
    });
  } catch (error) {
    logger.error({ err: error }, 'AI 排计划建议错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/project/:projectId/reschedule', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { baseDate } = req.body;
    const { offsetWorkdays: owFn } = await import('../../utils/workday');

    const base = baseDate ? new Date(baseDate) : new Date();

    const allActivities = await prisma.activity.findMany({
      where: { projectId },
      select: {
        id: true, name: true, status: true, dependencies: true,
        planStartDate: true, planEndDate: true, planDuration: true,
        startDate: true, endDate: true, duration: true,
      },
    });

    const _completed = allActivities.filter((a) => a.status === 'COMPLETED' || a.status === 'CANCELLED');
    const incomplete = allActivities.filter((a) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED');

    if (incomplete.length === 0) {
      res.json({ success: true, updatedCount: 0 });
      return;
    }

    const actMap = new Map(allActivities.map((a) => [a.id, { ...a }]));

    const pending = new Set(incomplete.map((a) => a.id));
    let maxIter = incomplete.length + 1;
    const updatedIds: string[] = [];

    while (pending.size > 0 && maxIter-- > 0) {
      for (const a of incomplete) {
        if (!pending.has(a.id)) continue;

        const deps = (a.dependencies as DependencyInput[] | null) || [];
        const allDepsReady = deps.every((d) => !pending.has(d.id));
        if (!allDepsReady) continue;

        const entry = actMap.get(a.id)!;
        const duration = a.planDuration || 1;

        if (deps.length === 0) {
          const pStart = owFn(base, 0);
          const pEnd = owFn(pStart, duration - 1);
          entry.planStartDate = pStart;
          entry.planEndDate = pEnd;
          entry.planDuration = duration;
        } else {
          const predecessors: PredecessorData[] = deps.map((d) => {
            const pred = actMap.get(d.id);
            return {
              id: d.id,
              planStartDate: pred?.planStartDate || pred?.endDate || null,
              planEndDate: pred?.planEndDate || pred?.endDate || null,
              planDuration: pred?.planDuration || null,
            };
          });
          const resolved = resolveActivityDates(deps, predecessors, duration);
          if (resolved.planStartDate) entry.planStartDate = resolved.planStartDate;
          if (resolved.planEndDate) entry.planEndDate = resolved.planEndDate;
          if (resolved.planDuration !== undefined) entry.planDuration = resolved.planDuration;
        }

        updatedIds.push(a.id);
        pending.delete(a.id);
      }
    }

    await prisma.$transaction(
      updatedIds.map((id) => {
        const entry = actMap.get(id)!;
        return prisma.activity.update({
          where: { id },
          data: {
            planStartDate: entry.planStartDate,
            planEndDate: entry.planEndDate,
            planDuration: entry.planDuration,
          },
        });
      })
    );

    res.json({ success: true, updatedCount: updatedIds.length });
  } catch (error) {
    logger.error({ err: error }, '一键重排错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/project/:projectId/what-if', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { activityId, delayDays } = req.body;

    if (!activityId || delayDays === undefined || delayDays === 0) {
      res.status(400).json({ error: '活动ID和偏移天数不能为空，且天数不能为0' });
      return;
    }

    const allActivities = await prisma.activity.findMany({
      where: { projectId },
      select: {
        id: true, name: true, dependencies: true,
        planStartDate: true, planEndDate: true, planDuration: true,
      },
    });

    const actMap = new Map(allActivities.map((a) => [a.id, { ...a }]));
    const target = actMap.get(activityId);
    if (!target) {
      res.status(404).json({ error: '活动不存在' });
      return;
    }

    const { offsetWorkdays: owFn } = await import('../../utils/workday');
    if (target.planStartDate) {
      target.planStartDate = owFn(target.planStartDate, delayDays);
    }
    if (target.planEndDate) {
      target.planEndDate = owFn(target.planEndDate, delayDays);
    }

    const reverseDeps = new Map<string, string[]>();
    for (const a of allActivities) {
      if (!a.dependencies || !Array.isArray(a.dependencies)) continue;
      for (const dep of dependenciesFromJson(a.dependencies)) {
        const list = reverseDeps.get(dep.id);
        if (list) list.push(a.id);
        else reverseDeps.set(dep.id, [a.id]);
      }
    }

    const affected: Array<{
      id: string; name: string;
      originalStart: string | null; originalEnd: string | null;
      newStart: string | null; newEnd: string | null;
    }> = [{
      id: target.id,
      name: target.name,
      originalStart: allActivities.find((a) => a.id === activityId)!.planStartDate?.toISOString() || null,
      originalEnd: allActivities.find((a) => a.id === activityId)!.planEndDate?.toISOString() || null,
      newStart: target.planStartDate?.toISOString() || null,
      newEnd: target.planEndDate?.toISOString() || null,
    }];

    const visited = new Set<string>();
    const queue = [activityId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const dependentIds = reverseDeps.get(currentId) || [];
      for (const depId of dependentIds) {
        const depAct = actMap.get(depId);
        if (!depAct || !depAct.dependencies) continue;

        const deps = depAct.dependencies as unknown as DependencyInput[];
        const predecessors: PredecessorData[] = deps.map((d) => {
          const pred = actMap.get(d.id);
          return {
            id: d.id,
            planStartDate: pred?.planStartDate || null,
            planEndDate: pred?.planEndDate || null,
            planDuration: pred?.planDuration || null,
          };
        });

        const resolved = resolveActivityDates(deps, predecessors, depAct.planDuration);
        const originalAct = allActivities.find((a) => a.id === depId)!;

        const startChanged = resolved.planStartDate &&
          (!depAct.planStartDate || resolved.planStartDate.getTime() !== depAct.planStartDate.getTime());
        const endChanged = resolved.planEndDate &&
          (!depAct.planEndDate || resolved.planEndDate.getTime() !== depAct.planEndDate.getTime());

        if (startChanged || endChanged) {
          if (resolved.planStartDate) depAct.planStartDate = resolved.planStartDate;
          if (resolved.planEndDate) depAct.planEndDate = resolved.planEndDate;
          if (resolved.planDuration !== undefined) depAct.planDuration = resolved.planDuration;

          affected.push({
            id: depAct.id,
            name: depAct.name,
            originalStart: originalAct.planStartDate?.toISOString() || null,
            originalEnd: originalAct.planEndDate?.toISOString() || null,
            newStart: depAct.planStartDate?.toISOString() || null,
            newEnd: depAct.planEndDate?.toISOString() || null,
          });

          queue.push(depId);
        }
      }
    }

    let maxOriginalEnd: Date | null = null;
    let maxNewEnd: Date | null = null;
    for (const a of actMap.values()) {
      if (a.planEndDate) {
        if (!maxNewEnd || a.planEndDate > maxNewEnd) maxNewEnd = a.planEndDate;
      }
    }
    for (const a of allActivities) {
      if (a.planEndDate) {
        if (!maxOriginalEnd || a.planEndDate > maxOriginalEnd) maxOriginalEnd = a.planEndDate;
      }
    }

    res.json({
      affectedCount: affected.length,
      affected,
      projectEndDateBefore: maxOriginalEnd?.toISOString() || null,
      projectEndDateAfter: maxNewEnd?.toISOString() || null,
    });
  } catch (error) {
    logger.error({ err: error }, 'What-if 模拟错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/project/:projectId/what-if/apply', authenticate, requirePermission('activity', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { affected, archiveLabel: _archiveLabel } = req.body;

    if (!Array.isArray(affected) || affected.length === 0) {
      res.status(400).json({ error: '受影响活动列表不能为空' });
      return;
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { res.status(404).json({ error: '项目不存在' }); return; }
    if (!canManageProject(req, project.managerId, projectId)) {
      res.status(403).json({ error: '无权操作' }); return;
    }

    const { calculateWorkdays: calcWd } = await import('../../utils/workday');
    let updatedCount = 0;
    for (const item of affected) {
      const { id, newStart, newEnd } = item;
      if (!id) continue;

      const updateData: Prisma.ActivityUncheckedUpdateInput = {};
      if (newStart) updateData.planStartDate = new Date(newStart);
      if (newEnd) updateData.planEndDate = new Date(newEnd);
      if (newStart && newEnd) {
        updateData.planDuration = calcWd(new Date(newStart), new Date(newEnd));
      }

      await prisma.activity.update({ where: { id }, data: updateData });
      updatedCount++;
    }

    await updateProjectProgress(projectId);

    await auditLog({
      action: 'UPDATE',
      resourceType: 'ACTIVITY',
      resourceId: projectId,
      resourceName: `What-If 模拟应用 (${updatedCount} 个活动)`,
      req,
    });

    res.json({ success: true, updatedCount });
  } catch (error) {
    logger.error({ err: error }, '应用 What-If 模拟结果错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export { router as scheduleRouter };
