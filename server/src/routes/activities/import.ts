import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { requirePermission, canManageProject } from '../../middleware/permission';
import { calculateWorkdays } from '../../utils/workday';
import { updateProjectProgress } from '../../utils/projectProgress';
import { auditLog } from '../../utils/auditLog';
import { parseExcelActivities } from '../../utils/excelActivityParser';
import { pinyin } from 'pinyin-pro';
import { logger } from '../../utils/logger';
import { businessMetrics, recordBusinessEvent } from '../../utils/businessMetrics';
import {
  type Prisma,
  prisma,
  ActivityStatus,
  ActivityType,
  EXECUTOR_INCLUDE,
  executorUsers,
  requireFeatureFlag,
  buildExecutorsForActivity,
  type DependencyInput,
} from './shared';

const router = express.Router();

type ActivityWithRole = {
  role?: { name: string } | null;
};

router.get(
  '/project/:projectId/export-excel',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      const activities = await prisma.activity.findMany({
        where: { projectId },
        include: { executors: { include: { user: { select: { id: true, realName: true } } } } },
        orderBy: { sortOrder: 'asc' },
      });

      // 构建 id → seq 映射
      const idToSeq = new Map<string, number>();
      activities.forEach((a, i) => idToSeq.set(a.id, i + 1));

      const statusMap: Record<string, string> = {
        NOT_STARTED: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消',
      };
      const typeMap: Record<string, string> = { TASK: '任务', MILESTONE: '里程碑', PHASE: '阶段' };
      const depTypeMap: Record<string, string> = { '0': 'FS', '1': 'SS', '2': 'FF', '3': 'SF' };

      const fmtDate = (d: Date | null) => d ? d.toISOString().slice(0, 10) : '';

      const formatDeps = (deps: unknown): string => {
        if (!deps) return '';
        const arr = Array.isArray(deps) ? deps : (() => { try { return JSON.parse(deps as string); } catch { return []; } })();
        return arr.map((dep: { id: string; type: string; lag?: number }) => {
          const seq = idToSeq.get(dep.id);
          const seqStr = seq ? String(seq).padStart(3, '0') : '?';
          const typeLabel = depTypeMap[dep.type] || 'FS';
          const lag = dep.lag ?? 0;
          const lagStr = lag > 0 ? `+${lag}` : lag < 0 ? String(lag) : '';
          return `${seqStr}${typeLabel}${lagStr}`;
        }).join(', ');
      };

      // 使用 ExcelJS 生成合规的 xlsx（SheetJS 社区版会产生 metadata.xml 等非标内容导致 Excel 报警告）
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Atlas';
      wb.created = new Date();
      const ws = wb.addWorksheet('活动列表');

      const columns = [
        { header: 'ID', key: 'id', width: 6 },
        { header: '前置依赖', key: 'predecessor', width: 16 },
        { header: '阶段', key: 'phase', width: 8 },
        { header: '活动名称', key: 'name', width: 30 },
        { header: '类型', key: 'type', width: 8 },
        { header: '状态', key: 'status', width: 8 },
        { header: '角色', key: 'role', width: 12 },
        { header: '负责人', key: 'assignee', width: 12 },
        { header: '计划工期', key: 'planDuration', width: 10 },
        { header: '计划开始', key: 'planStart', width: 12 },
        { header: '计划结束', key: 'planEnd', width: 12 },
        { header: '实际开始', key: 'actualStart', width: 12 },
        { header: '实际结束', key: 'actualEnd', width: 12 },
        { header: '备注', key: 'notes', width: 20 },
      ];
      ws.columns = columns;

      // 表头加粗 + 背景色
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F3F5' } };

      activities.forEach((a, i) => {
        ws.addRow({
          id: String(i + 1).padStart(3, '0'),
          predecessor: formatDeps(a.dependencies),
          phase: a.phase || '',
          name: a.name,
          type: typeMap[a.type] || a.type,
          status: statusMap[a.status] || a.status,
          role: (a as ActivityWithRole).role?.name || '',
          assignee: executorUsers(a).map((user) => user.realName).join(', ') || '',
          planDuration: a.planDuration ?? '',
          planStart: fmtDate(a.planStartDate),
          planEnd: fmtDate(a.planEndDate),
          actualStart: fmtDate(a.startDate),
          actualEnd: fmtDate(a.endDate),
          notes: a.notes || '',
        });
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = encodeURIComponent(`${project.name}_活动列表_${dateStr}.xlsx`);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
      await wb.xlsx.write(res);
    } catch (error) {
      logger.error({ err: error }, '导出 Excel 错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    if (ext.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .xlsx 文件，请将 .xls 文件另存为 .xlsx 后再导入'));
    }
  },
});

router.post(
  '/project/:projectId/import-excel',
  authenticate,
  requirePermission('activity', 'create'),
  requireFeatureFlag('activity.import', '活动导入功能已临时关闭'),
  excelUpload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // 验证项目存在
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      // 权限检查
      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '无权在此项目中导入活动' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: '请上传 Excel 文件' });
        return;
      }

      // 解析 Excel
      const parsed = await parseExcelActivities(req.file.buffer);
      if (parsed.length === 0) {
        res.json({ success: true, count: 0, skipped: 0, createdUsers: [], activities: [] });
        return;
      }

      // 收集所有负责人姓名
      const allNames = new Set<string>();
      parsed.forEach((a) => a.assigneeNames.forEach((n) => allNames.add(n)));

      // 查询已有用户（按 realName 匹配）
      const existingUsers = allNames.size > 0
        ? await prisma.user.findMany({
            where: { realName: { in: Array.from(allNames) } },
            select: { id: true, realName: true },
          })
        : [];
      const userMap = new Map<string, string>(); // realName → userId
      existingUsers.forEach((u) => userMap.set(u.realName, u.id));

      // 自动创建不存在的联系人（用户名由姓名拼音生成，重复时追加数字）
      const createdUsers: string[] = [];
      for (const name of allNames) {
        if (!userMap.has(name)) {
          const baseUsername = pinyin(name, { toneType: 'none', type: 'array' }).join('');
          let username = baseUsername;
          let suffix = 1;
          while (await prisma.user.findUnique({ where: { username } })) {
            username = baseUsername + suffix;
            suffix++;
          }
          const newUser = await prisma.user.create({
            data: { realName: name, username, canLogin: false },
          });
          userMap.set(name, newUser.id);
          createdUsers.push(name);
        }
      }

      // 查询项目现有活动，用于去重（按 名称+阶段+计划日期 匹配）
      const dateStr = (d: Date | null | undefined) => d ? d.toISOString().slice(0, 10) : '';
      const existingActivities = await prisma.activity.findMany({
        where: { projectId },
        select: { id: true, name: true, phase: true, planStartDate: true, planEndDate: true },
      });
      const existingByKey = new Map<string, string>();
      existingActivities.forEach((a) => {
        const key = `${a.name}|${a.phase || ''}|${dateStr(a.planStartDate)}|${dateStr(a.planEndDate)}`;
        existingByKey.set(key, a.id);
      });

      // 区分已存在（跳过）和新增的行，但保留所有行的 seq → activityId 映射用于解析前置依赖
      const seqToActivityId = new Map<number, string>();
      const toCreate: typeof parsed = [];
      parsed.forEach((a) => {
        const key = `${a.name}|${a.phase || ''}|${dateStr(a.planStartDate)}|${dateStr(a.planEndDate)}`;
        const existingId = existingByKey.get(key);
        if (existingId) {
          if (a.seq) seqToActivityId.set(a.seq, existingId);
        } else {
          toCreate.push(a);
        }
      });
      const skipped = parsed.length - toCreate.length;

      if (toCreate.length === 0) {
        res.json({ success: true, count: 0, skipped, createdUsers, activities: [] });
        return;
      }

      const PHASE_ORDER: Record<string, number> = { EVT: 0, DVT: 1, PVT: 2, MP: 3 };
      toCreate.sort((a, b) => {
        const pa = PHASE_ORDER[a.phase || ''] ?? 9;
        const pb = PHASE_ORDER[b.phase || ''] ?? 9;
        if (pa !== pb) return pa - pb;
        const da = a.planStartDate ? new Date(a.planStartDate).getTime() : Infinity;
        const db = b.planStartDate ? new Date(b.planStartDate).getTime() : Infinity;
        return da - db;
      });

      // 获取当前最大 sortOrder
      const maxSort = await prisma.activity.aggregate({
        where: { projectId },
        _max: { sortOrder: true },
      });
      let sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

      const roleNames = new Set<string>();
      toCreate.forEach((a) => { if (a.roleName) roleNames.add(a.roleName); });
      const roles = roleNames.size > 0
        ? await prisma.role.findMany({ where: { name: { in: Array.from(roleNames) } } })
        : [];
      const roleMap = new Map<string, string>();
      roles.forEach((r) => roleMap.set(r.name, r.id));

      const currentUserId = req.user?.id || '';

      const executorDataList = await Promise.all(
        toCreate.map(async (a) => {
          const assigneeIds = a.assigneeNames
            .map((n) => userMap.get(n))
            .filter((id): id is string => !!id);

          const roleId = a.roleName ? roleMap.get(a.roleName) : undefined;

          if (roleId) {
            return buildExecutorsForActivity(roleId, assigneeIds.length > 0 ? assigneeIds : undefined, currentUserId);
          }

          if (assigneeIds.length > 0) {
            return assigneeIds.map((uid) => ({
              userId: uid,
              source: 'MANUAL_ADD' as const,
              assignedBy: currentUserId,
            }));
          }

          return [];
        })
      );

      const activities = await prisma.$transaction(
        toCreate.map((a, idx) => {
          const executorData = executorDataList[idx];

          const data: Prisma.ActivityUncheckedCreateInput & { executors?: { create: Array<{ userId: string; source: 'ROLE_AUTO' | 'MANUAL_ADD'; snapshotRoleId?: string | null; assignedBy: string }> } } = {
            projectId,
            name: a.name,
            type: a.type || ActivityType.TASK,
            phase: a.phase || null,
            status: (a.status as ActivityStatus | undefined) || ActivityStatus.NOT_STARTED,
            planStartDate: a.planStartDate || null,
            planEndDate: a.planEndDate || null,
            planDuration: a.planDuration || null,
            startDate: a.actualStartDate || null,
            endDate: a.actualEndDate || null,
            notes: a.notes || null,
            sortOrder: sortOrder++,
            roleId: a.roleName ? roleMap.get(a.roleName) || null : null,
          };

          const dataPlanStart = data.planStartDate instanceof Date ? data.planStartDate : undefined;
          const dataPlanEnd = data.planEndDate instanceof Date ? data.planEndDate : undefined;
          if (!data.planDuration && dataPlanStart && dataPlanEnd) {
            data.planDuration = calculateWorkdays(dataPlanStart, dataPlanEnd);
          }

          if (executorData && executorData.length > 0) {
            data.executors = { create: executorData };
          }

          return prisma.activity.create({
            data,
            include: EXECUTOR_INCLUDE,
          });
        })
      );

      // 记录新建活动的 seq → id 映射
      activities.forEach((created, idx) => {
        const seq = toCreate[idx].seq;
        if (seq) seqToActivityId.set(seq, created.id);
      });

      // 解析并写回前置依赖（仅引用本次解析中存在 seq 的活动）
      const depUpdates: Array<{ activityId: string; dependencies: DependencyInput[] }> = [];
      toCreate.forEach((a, idx) => {
        if (!a.predecessors || a.predecessors.length === 0) return;
        const resolved: DependencyInput[] = [];
        for (const p of a.predecessors) {
          const id = seqToActivityId.get(p.seq);
          if (id) resolved.push({ id, type: p.type, lag: p.lag });
        }
        const activity = activities[idx];
        if (activity && resolved.length > 0) {
          depUpdates.push({ activityId: activity.id, dependencies: resolved });
        }
      });

      if (depUpdates.length > 0) {
        await prisma.$transaction(
          depUpdates.map((u) =>
            prisma.activity.update({
              where: { id: u.activityId },
              data: { dependencies: u.dependencies as unknown as Prisma.InputJsonValue },
            })
          )
        );
      }

      // 更新项目进度
      await updateProjectProgress(projectId);

      auditLog({
        req,
        action: 'CREATE',
        resourceType: 'activity',
        resourceId: projectId,
        resourceName: `批量导入 ${activities.length} 条活动`,
      });

      recordBusinessEvent(businessMetrics, 'activity.import.succeeded');
      res.json({
        success: true,
        count: activities.length,
        skipped,
        createdUsers,
        activities,
      });
    } catch (error) {
      logger.error({ err: error }, '导入 Excel 活动错误');
      res.status(500).json({ error: error instanceof Error ? error.message : '服务器内部错误' });
    }
  }
);

router.post(
  '/project/:projectId/undo-import',
  authenticate,
  requirePermission('activity', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: '无可撤销的活动' });
        return;
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }
      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '无权操作' });
        return;
      }

      // 仅删除属于该项目的活动
      await prisma.activity.deleteMany({
        where: { id: { in: ids }, projectId },
      });

      await updateProjectProgress(projectId);

      res.json({ success: true, count: ids.length });
    } catch (error) {
      logger.error({ err: error }, '撤销导入错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export { router as importRouter };
