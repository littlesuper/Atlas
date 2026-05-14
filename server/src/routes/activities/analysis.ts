import express, { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { type Prisma, prisma, executorUsers, queryString } from './shared';

const router = express.Router();

router.get('/workload', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    const where: Prisma.ActivityWhereInput = {};
    const projectIdFilter = queryString(projectId);
    if (projectIdFilter) where.projectId = projectIdFilter;

    const activities = await prisma.activity.findMany({
      where,
      include: {
        executors: { include: { user: { select: { id: true, realName: true, username: true } } } },
        project: { select: { id: true, name: true } },
      },
    });

    const now = new Date();

    const userMap = new Map<string, {
      userId: string; realName: string; username: string | null;
      totalActivities: number; inProgress: number; notStarted: number; overdue: number; totalDuration: number;
    }>();

    const overdueIssues: Array<{
      type: 'overdue'; activityId: string; activityName: string;
      projectId: string; projectName: string; assigneeNames: string[];
      planStartDate: string | null; planEndDate: string | null; overdueDays: number;
    }> = [];
    const overdueSet = new Set<string>();

    const unassignedIssues: Array<{
      type: 'unassigned'; activityId: string; activityName: string;
      projectId: string; projectName: string; assigneeNames: string[];
      planStartDate: string | null; planEndDate: string | null;
    }> = [];

    for (const a of activities) {
      const isActive = a.status !== 'COMPLETED' && a.status !== 'CANCELLED';
      const isOverdue = isActive && a.planEndDate && a.planEndDate < now;

      const effectiveUsers = executorUsers(a);

      for (const u of effectiveUsers) {
        let entry = userMap.get(u.id);
        if (!entry) {
          entry = { userId: u.id, realName: u.realName, username: u.username ?? null, totalActivities: 0, inProgress: 0, notStarted: 0, overdue: 0, totalDuration: 0 };
          userMap.set(u.id, entry);
        }
        if (!entry) continue;
        entry.totalActivities++;
        if (a.status === 'IN_PROGRESS') entry.inProgress++;
        if (a.status === 'NOT_STARTED') entry.notStarted++;
        if (isOverdue) entry.overdue++;
        entry.totalDuration += a.planDuration || 0;
      }

      if (isOverdue && !overdueSet.has(a.id)) {
        overdueSet.add(a.id);
        const diffMs = now.getTime() - new Date(a.planEndDate!).getTime();
        const overdueDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        overdueIssues.push({
          type: 'overdue',
          activityId: a.id,
          activityName: a.name,
          projectId: a.project.id,
          projectName: a.project.name,
          assigneeNames: effectiveUsers.map((u) => u.realName),
          planStartDate: a.planStartDate ? a.planStartDate.toISOString() : null,
          planEndDate: a.planEndDate ? a.planEndDate.toISOString() : null,
          overdueDays,
        });
      }

      if (isActive && effectiveUsers.length === 0) {
        unassignedIssues.push({
          type: 'unassigned',
          activityId: a.id,
          activityName: a.name,
          projectId: a.project.id,
          projectName: a.project.name,
          assigneeNames: [],
          planStartDate: a.planStartDate ? a.planStartDate.toISOString() : null,
          planEndDate: a.planEndDate ? a.planEndDate.toISOString() : null,
        });
      }
    }

    const members = Array.from(userMap.values())
      .sort((a, b) => (b.inProgress + b.overdue) - (a.inProgress + a.overdue));

    overdueIssues.sort((a, b) => b.overdueDays - a.overdueDays);
    unassignedIssues.sort((a, b) => {
      const da = a.planStartDate ? new Date(a.planStartDate).getTime() : Infinity;
      const db = b.planStartDate ? new Date(b.planStartDate).getTime() : Infinity;
      return da - db;
    });

    const issues = [...overdueIssues, ...unassignedIssues];

    const summary = {
      totalOverdue: overdueSet.size,
      totalUnassigned: unassignedIssues.length,
      overloadedCount: members.filter(m => m.inProgress >= 5).length,
    };

    res.json({ summary, members, issues });
  } catch (error) {
    logger.error({ err: error }, '获取资源负载错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/resource-conflicts', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    const where: Prisma.ActivityWhereInput = {
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      planStartDate: { not: null },
      planEndDate: { not: null },
      OR: [
        { executors: { some: {} } },
      ],
    };
    const projectIdFilter = queryString(projectId);
    if (projectIdFilter) where.projectId = projectIdFilter;

    const activities = await prisma.activity.findMany({
      where,
      select: {
        id: true,
        name: true,
        projectId: true,
        planStartDate: true,
        planEndDate: true,
        planDuration: true,
        executors: { include: { user: { select: { id: true, realName: true, username: true } } } },
        project: { select: { id: true, name: true } },
      },
    });

    const userActivities = new Map<string, typeof activities>();
    for (const a of activities) {
      const effectiveUsers = executorUsers(a);
      for (const u of effectiveUsers) {
        if (!userActivities.has(u.id)) userActivities.set(u.id, []);
        userActivities.get(u.id)!.push(a);
      }
    }

    interface Conflict {
      userId: string;
      realName: string;
      activities: Array<{
        id: string;
        name: string;
        projectId: string;
        projectName: string;
        planStartDate: string;
        planEndDate: string;
      }>;
    }

    const conflicts: Conflict[] = [];

    for (const [userId, acts] of userActivities) {
      if (acts.length < 2) continue;

      const sorted = acts.sort((a, b) =>
        new Date(a.planStartDate!).getTime() - new Date(b.planStartDate!).getTime()
      );

      const overlapping: typeof acts = [];
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const aEnd = new Date(sorted[i].planEndDate!).getTime();
          const bStart = new Date(sorted[j].planStartDate!).getTime();
          if (bStart <= aEnd) {
            if (!overlapping.includes(sorted[i])) overlapping.push(sorted[i]);
            if (!overlapping.includes(sorted[j])) overlapping.push(sorted[j]);
          }
        }
      }

      if (overlapping.length >= 2) {
        const allUsers = [
          ...executorUsers(overlapping[0]),
        ];
        const user = allUsers.find((u) => u.id === userId)!;
        conflicts.push({
          userId,
          realName: user.realName,
          activities: overlapping.map((a) => ({
            id: a.id,
            name: a.name,
            projectId: a.projectId,
            projectName: a.project.name,
            planStartDate: a.planStartDate!.toISOString(),
            planEndDate: a.planEndDate!.toISOString(),
          })),
        });
      }
    }

    res.json(conflicts);
  } catch (error) {
    logger.error({ err: error }, '资源冲突检测错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export { router as analysisRouter };
