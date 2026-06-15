# Phase 2 · PR2 activity.create（含角色绑定）— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 AI 能力 `activity.create`（自然语言新建活动，支持「按角色自动填入执行人」），并把活动创建落库逻辑抽成 `createActivityCore` 供路由与能力共用（满足安全铁律③，避免逻辑漂移）。

**Architecture:** 从 `routes/activities/crud.ts` 的 `POST /` 抽出 `createActivityCore(project, params, req)`（接收已取的 project 对象，做归档/权限校验 + 执行人展开 + 工期计算 + 落库 + 进度刷新）。路由保留自身的 project 查找/依赖处理，委托 core 做创建；能力 `activityCreate.ts`（create 类、无 target）经 `validateRefs` 白名单（projectId∈ctx.projects、roleId∈ctx.roles）后调同一 core。propose 路由额外把全量角色名加载进 `capCtx.roles` 供角色名解析。

**Tech Stack:** TypeScript + Express + Prisma + Zod + Vitest。复用 PR1 能力骨架、`buildExecutorsForActivity`/`autoAssignByRole`/`calculateWorkdays`/`updateProjectProgress`/`canManageProject`。

**工作目录：** `/Users/xbot03/PlayCode/Atlas-cap`（分支 `feat/ai-capability-expansion`，已含 PR1）。提交只 `git add` 各任务列出的文件，**切勿 `git add -A`**。

**参考规格：** `docs/specs/ai-capability-registry/02-phase2-design.md` §4；参考能力实现 `capability/projectCreate.ts`。

---

## 背景：相关现有代码（实现者必读）

- `routes/activities/crud.ts` 的 `POST /`（lines 214-329）：当前内联做 project 查找 → 归档(403)/不存在(400) → `canManageProject`(403) → 依赖环检测 → `computeDatesFromDeps` → `calculateWorkdays` 补工期 → `buildExecutorsForActivity` → `prisma.activity.create({include: EXECUTOR_INCLUDE})` → `updateProjectProgress` → `auditLog`。**注意：该路由不走 Zod validate 中间件，直接解构 `req.body`。**
- `routes/activities/shared.ts`：导出 `buildExecutorsForActivity(roleId, executorIds, currentUserId)`、`EXECUTOR_INCLUDE`、`prisma`、`ActivityType`/`ActivityStatus`/`Priority`、`computeDatesFromDeps`。`import { NextFunction, Request, Response } from 'express'` 已在文件顶部。
- `middleware/permission.ts:74`：`canManageProject(req, managerId, projectId): boolean`。
- `utils/workday.ts:124`：`calculateWorkdays(startDate: Date, endDate: Date): number`。
- `utils/projectProgress.ts:57`：`updateProjectProgress(projectId): Promise<void>`。
- `utils/roleMembershipResolver.ts`：`autoAssignByRole(roleId): Promise<string[]>`（角色下 ACTIVE 用户 id）。
- `capability/projectCreate.ts`：create 类能力范例（`CapabilityValidationError`、inputSchema、missingRequired、applyDefaults、previewDisplay、execute）。
- PR1 能力骨架：create 类能力**不设 `target`**；`validateRefs(input, ctx, entity?)` 做引用白名单；`ctx.roles?` 已在 `CapabilityContext`（PR1 加，propose 路由本 PR 才填充）。

---

## Task 1: 抽出 `createActivityCore` 并改造创建路由

**Files:**
- Modify: `server/src/routes/activities/shared.ts`（新增 `ActivityCreateError` + `createActivityCore`）
- Modify: `server/src/routes/activities/crud.ts`（`POST /` 改调 core）
- Test: `server/src/routes/activities/__tests__/*` 或现有 crud 测试（保持绿）；新增 `shared.createActivityCore.test.ts`

- [ ] **Step 1: 在 `shared.ts` 末尾新增错误类与 core 函数**

在 `shared.ts` 顶部 import 区补充：

```ts
import { canManageProject } from '../../middleware/permission';
import { calculateWorkdays } from '../../utils/workday';
import { updateProjectProgress } from '../../utils/projectProgress';
```

在文件末尾追加：

```ts
export class ActivityCreateError extends Error {
  constructor(public readonly code: 'PROJECT_ARCHIVED' | 'FORBIDDEN') {
    super(code);
    this.name = 'ActivityCreateError';
  }
}

export interface CreateActivityCoreParams {
  name: string;
  description?: string | null;
  type?: ActivityType;
  phase?: string | null;
  roleId?: string | null;
  executorIds?: string[];
  status?: ActivityStatus;
  priority?: Priority;
  planStartDate?: Date | null;
  planEndDate?: Date | null;
  planDuration?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  duration?: number | null;
  dependencies?: unknown;
  notes?: string | null;
  sortOrder?: number;
}

/**
 * 活动创建核心（路由与 AI 能力共用，安全铁律③）。
 * 接收已取的 project（调用方各自查找一次），做归档/权限校验 + 执行人展开 + 工期补算 + 落库 + 进度刷新。
 * 不含：依赖环检测/依赖派生日期（留路由）、审计（调用方各自审计）。
 */
export async function createActivityCore(
  project: { id: string; managerId: string; status: string },
  params: CreateActivityCoreParams,
  req: Request
) {
  if (project.status === 'ARCHIVED') throw new ActivityCreateError('PROJECT_ARCHIVED');
  if (!canManageProject(req, project.managerId, project.id)) throw new ActivityCreateError('FORBIDDEN');

  const executorData = await buildExecutorsForActivity(params.roleId, params.executorIds, req.user?.id || '');

  let planDuration = params.planDuration ?? null;
  if (params.planStartDate && params.planEndDate && !planDuration) {
    planDuration = calculateWorkdays(params.planStartDate, params.planEndDate);
  }
  let duration = params.duration ?? null;
  if (params.startDate && params.endDate && !duration) {
    duration = calculateWorkdays(params.startDate, params.endDate);
  }

  const activity = await prisma.activity.create({
    data: {
      projectId: project.id,
      name: params.name,
      description: params.description ?? null,
      type: params.type ?? ActivityType.TASK,
      phase: params.phase ?? null,
      roleId: params.roleId ?? null,
      executors: { create: executorData },
      status: params.status ?? ActivityStatus.NOT_STARTED,
      priority: params.priority ?? ('MEDIUM' as Priority),
      planStartDate: params.planStartDate ?? null,
      planEndDate: params.planEndDate ?? null,
      planDuration,
      startDate: params.startDate ?? null,
      endDate: params.endDate ?? null,
      duration,
      dependencies: (params.dependencies as Prisma.InputJsonValue) ?? Prisma.DbNull,
      notes: params.notes ?? null,
      sortOrder: params.sortOrder ?? 0,
    },
    include: EXECUTOR_INCLUDE,
  });

  await updateProjectProgress(project.id);
  return activity;
}
```

> 注：`dependencies` 用 `Prisma.DbNull` 表示"无依赖"（与原路由 `dependencies || null` 等价；`null` JSON 字段在 Prisma 用 `Prisma.DbNull`/`Prisma.JsonNull`，若原路由用裸 `null` 也可，但 `Prisma.DbNull` 更稳妥——若 typecheck 对该字段报错，回退为 `(params.dependencies ?? null) as never` 以匹配原路由行为）。

- [ ] **Step 2: 改造 `crud.ts` 的 `POST /` 委托给 core**

把 `crud.ts` lines 241-323（从 `const project = await prisma.project.findUnique` 到 `res.status(201).json(activity);`）替换为：

```ts
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(400).json({ error: '项目不存在' });
        return;
      }

      if (dependencies && Array.isArray(dependencies) && dependencies.length > 0) {
        const hasCycle = await detectCircularDependency(projectId, '', dependencies, prisma);
        if (hasCycle) {
          res.status(400).json({ error: '存在循环依赖，无法保存' });
          return;
        }
      }

      let resolvedPlanStart = planStartDate ? new Date(planStartDate) : null;
      let resolvedPlanEnd = planEndDate ? new Date(planEndDate) : null;
      let resolvedPlanDuration = planDuration;
      if (dependencies && Array.isArray(dependencies) && dependencies.length > 0) {
        const resolved = await computeDatesFromDeps(dependencies, planDuration);
        if (resolved.planStartDate) resolvedPlanStart = resolved.planStartDate;
        if (resolved.planEndDate) resolvedPlanEnd = resolved.planEndDate;
        if (resolved.planDuration !== undefined) resolvedPlanDuration = resolved.planDuration;
      }

      try {
        const activity = await createActivityCore(
          project,
          {
            name,
            description,
            type,
            phase,
            roleId,
            executorIds,
            status,
            priority,
            planStartDate: resolvedPlanStart,
            planEndDate: resolvedPlanEnd,
            planDuration: resolvedPlanDuration,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            duration,
            dependencies,
            notes,
            sortOrder,
          },
          req
        );
        auditLog({ req, action: 'CREATE', resourceType: 'activity', resourceId: activity.id, resourceName: activity.name });
        res.status(201).json(activity);
      } catch (e) {
        if (e instanceof ActivityCreateError) {
          if (e.code === 'PROJECT_ARCHIVED') { res.status(403).json({ error: '归档项目不可修改' }); return; }
          res.status(403).json({ error: '只能在自己负责的项目中创建活动' });
          return;
        }
        throw e;
      }
```

并在 `crud.ts` 顶部 `from './shared'` 的 import 列表里加入 `createActivityCore, ActivityCreateError`。

> 行为保持：project 不存在仍 400；归档仍 403「归档项目不可修改」；非负责人仍 403「只能在自己负责的项目中创建活动」；依赖环仍 400；依赖派生日期/工期补算不变；审计不变。归档与权限校验从路由移入 core，但顺序仍在「project 存在」之后、紧接依赖处理之前由 core 执行（对无依赖请求顺序完全一致）。

- [ ] **Step 3: 跑现有活动路由测试，确认零回归**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/routes/activities/`
Expected: PASS（创建相关用例：成功创建、项目不存在 400、归档 403、非负责人 403、依赖等行为不变）。
若某用例失败，对照原行为修正映射/顺序，**不要改测试去迁就**（除非测试本身断言了被有意保留的实现细节）。

- [ ] **Step 4: 新增 `createActivityCore` 单测**

Create: `server/src/routes/activities/__tests__/createActivityCore.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, mockBuildExec, mockProgress, mockCanManage, mockWorkdays } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockBuildExec: vi.fn(),
  mockProgress: vi.fn(),
  mockCanManage: vi.fn(),
  mockWorkdays: vi.fn(),
}));

vi.mock('../../../db', () => ({ default: { activity: { create: mockCreate } } }));
vi.mock('../../../middleware/permission', () => ({ canManageProject: mockCanManage }));
vi.mock('../../../utils/projectProgress', () => ({ updateProjectProgress: mockProgress }));
vi.mock('../../../utils/workday', () => ({ calculateWorkdays: mockWorkdays }));
vi.mock('../../../utils/roleMembershipResolver', () => ({ autoAssignByRole: vi.fn(async () => []) }));

// buildExecutorsForActivity 来自同模块 shared.ts；用 spy 时直接 import 真实实现亦可，这里走真实（依赖 autoAssignByRole mock）
import { createActivityCore, ActivityCreateError } from '../shared';

const req = { user: { id: 'u1' } } as never;
const activeProject = { id: 'p1', managerId: 'u1', status: 'IN_PROGRESS' };

beforeEach(() => {
  vi.clearAllMocks();
  mockCanManage.mockReturnValue(true);
  mockCreate.mockResolvedValue({ id: 'a1', name: '结构打样', executors: [] });
  mockProgress.mockResolvedValue(undefined);
});

describe('createActivityCore', () => {
  it('归档项目 → 抛 PROJECT_ARCHIVED', async () => {
    await expect(
      createActivityCore({ ...activeProject, status: 'ARCHIVED' }, { name: 'x' }, req)
    ).rejects.toMatchObject({ code: 'PROJECT_ARCHIVED' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('非负责人 → 抛 FORBIDDEN', async () => {
    mockCanManage.mockReturnValue(false);
    await expect(createActivityCore(activeProject, { name: 'x' }, req)).rejects.toBeInstanceOf(ActivityCreateError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('正常 → 落库 + 刷新进度，使用 project.id 作 projectId', async () => {
    const out = await createActivityCore(activeProject, { name: '结构打样', roleId: 'r1' }, req);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].data.projectId).toBe('p1');
    expect(mockProgress).toHaveBeenCalledWith('p1');
    expect(out.id).toBe('a1');
  });
});
```

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/routes/activities/__tests__/createActivityCore.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/routes/activities/shared.ts server/src/routes/activities/crud.ts server/src/routes/activities/__tests__/createActivityCore.test.ts
git commit -m "refactor(activities): extract createActivityCore shared by route + AI capability

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `activity.create` 能力

**Files:**
- Create: `server/src/services/assistant/capability/activityCreate.ts`
- Modify: `server/src/services/assistant/capability/bootstrap.ts`（注册）
- Test: `server/src/services/assistant/capability/activityCreate.test.ts`

- [ ] **Step 1: 写能力实现**

Create `server/src/services/assistant/capability/activityCreate.ts`:

```ts
import type { Request } from 'express';
import { z } from 'zod';
import prisma from '../../../db';
import { createActivityCore } from '../../../routes/activities/shared';
import type { AssistantDiffRow } from '../types';
import type { Capability, CapabilityContext } from './types';

export class ActivityCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityCapabilityError';
  }
}

const activityCreateInputSchema = z.object({
  projectId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(['TASK', 'MILESTONE', 'PHASE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  planStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  planEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  roleId: z.string().min(1).optional(),
  description: z.string().optional(),
  phase: z.string().optional(),
});
type ActivityCreateInput = z.infer<typeof activityCreateInputSchema>;

const TYPE_LABEL: Record<string, string> = { TASK: '任务', MILESTONE: '里程碑', PHASE: '阶段' };
const PRIORITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '紧急' };
const STATUS_LABEL: Record<string, string> = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' };

export const activityCreateCapability: Capability<ActivityCreateInput> = {
  name: 'activity.create',
  description: '在某个项目下新建一个活动/任务/里程碑（可指定负责角色，自动填入该角色的执行人）。当用户想"建/加一个活动、任务、里程碑"时用此能力。',
  permission: { resource: 'activity', action: 'create' },
  danger: 'normal',
  mode: 'create',
  inputSchema: activityCreateInputSchema,

  buildPrompt(utterance, ctx) {
    const projectList = ctx.projects.map((p) => `- id=${p.id} | 名称=${p.name}`).join('\n') || '（无可操作项目）';
    const roleList = (ctx.roles ?? []).map((r) => `- id=${r.id} | 名称=${r.name}`).join('\n') || '（无角色）';
    return {
      system: `你是项目管理系统的"新建活动意图解析器"。把用户的话解析成创建活动所需字段。
可填字段：
- projectId：必须从下方"项目清单"里选 id（用户点了哪个项目就选哪个）
- name：活动名称
- type：TASK(任务)/MILESTONE(里程碑)/PHASE(阶段)，不填默认 TASK
- priority：LOW/MEDIUM/HIGH/CRITICAL，不填默认 MEDIUM
- status：NOT_STARTED/IN_PROGRESS/COMPLETED/CANCELLED，一般不填（默认未开始）
- planStartDate/planEndDate：YYYY-MM-DD
- roleId：负责角色，必须从下方"角色清单"里选 id（用户说了角色名才填）
- description/phase：描述/阶段名
铁律：
- projectId 和 roleId **只能取下方清单里的 id**；清单里没有就**不要填**（绝不编造 id）。
- 只填用户**明确说出**的字段；绝不编造名称、日期、角色。映射不到的枚举不填。
严格输出 JSON（只含用户说了的键）：{"projectId":"...","name":"...","type":"...","priority":"...","planStartDate":"...","planEndDate":"...","roleId":"...","description":"...","phase":"..."}`,
      user: `## 项目清单（projectId 只能从这里选）\n${projectList}\n\n## 角色清单（roleId 只能从这里选）\n${roleList}\n\n## 用户的话\n${utterance}\n\n请输出 JSON。`,
    };
  },

  validateRefs(input, ctx) {
    const fabricated: string[] = [];
    if (input.projectId && !ctx.projects.some((p) => p.id === input.projectId)) fabricated.push(`projectId=${input.projectId}`);
    if (input.roleId && !(ctx.roles ?? []).some((r) => r.id === input.roleId)) fabricated.push(`roleId=${input.roleId}`);
    return fabricated.length ? { ok: false, fabricated } : { ok: true };
  },

  missingRequired(input) {
    const missing: string[] = [];
    if (!input.projectId) missing.push('项目');
    if (!input.name) missing.push('活动名称');
    return missing;
  },

  applyDefaults(input) {
    return { ...input, type: input.type ?? 'TASK', priority: input.priority ?? 'MEDIUM', status: input.status ?? 'NOT_STARTED' };
  },

  previewLabels: {
    projectId: '项目', name: '活动名称', type: '类型', priority: '优先级', status: '状态',
    planStartDate: '计划开始', planEndDate: '计划结束', roleId: '负责角色', description: '描述', phase: '阶段',
  },
  previewDisplay(key, value, ctx) {
    if (value == null || value === '') return '（空）';
    if (key === 'projectId') return ctx.projects.find((p) => p.id === value)?.name ?? String(value);
    if (key === 'roleId') {
      const name = (ctx.roles ?? []).find((r) => r.id === value)?.name ?? String(value);
      return `${name}（将自动填入该角色在职执行人）`;
    }
    if (key === 'type') return TYPE_LABEL[String(value)] ?? String(value);
    if (key === 'priority') return PRIORITY_LABEL[String(value)] ?? String(value);
    if (key === 'status') return STATUS_LABEL[String(value)] ?? String(value);
    return String(value);
  },

  async execute(input, _ctx: CapabilityContext, req: Request) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId! } });
    if (!project) throw new ActivityCapabilityError('项目不存在');

    const activity = await createActivityCore(
      project,
      {
        name: input.name!,
        type: input.type,
        priority: input.priority,
        status: input.status,
        phase: input.phase ?? null,
        description: input.description ?? null,
        roleId: input.roleId ?? null,
        planStartDate: input.planStartDate ? new Date(`${input.planStartDate}T00:00:00.000Z`) : null,
        planEndDate: input.planEndDate ? new Date(`${input.planEndDate}T00:00:00.000Z`) : null,
      },
      req
    );

    const executorCount = (activity as { executors?: unknown[] }).executors?.length ?? 0;
    const rows: AssistantDiffRow[] = [
      { key: 'name', label: '活动名称', before: '（空）', after: input.name! },
      { key: 'project', label: '项目', before: '（空）', after: project.name },
      { key: 'type', label: '类型', before: '（空）', after: TYPE_LABEL[input.type ?? 'TASK'] },
      { key: 'priority', label: '优先级', before: '（空）', after: PRIORITY_LABEL[input.priority ?? 'MEDIUM'] },
    ];
    if (input.roleId) {
      const roleName = (_ctx.roles ?? []).find((r) => r.id === input.roleId)?.name ?? input.roleId;
      rows.push({ key: 'executors', label: '执行人', before: '（空）', after: `按角色「${roleName}」自动填入 ${executorCount} 人` });
    }
    return { rows, risks: [] };
  },
};
```

> 注：`activity.create` 是 **create 类（无 `target`）**——projectId 是输入字段，经 `validateRefs` 对 `ctx.projects` 白名单；预览的执行人不在此异步枚举姓名（只标"将自动填入"），真正展开在 `execute`/`createActivityCore` 内 `buildExecutorsForActivity` 完成，落库后 diff 给出实际人数。

- [ ] **Step 2: 注册能力**

在 `capability/bootstrap.ts` 中追加注册（与 `projectCreateCapability` 并列）：

```ts
import { activityCreateCapability } from './activityCreate';
// ...
registerCapability(activityCreateCapability);
```

- [ ] **Step 3: 写能力单测**

Create `server/src/services/assistant/capability/activityCreate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activityCreateCapability } from './activityCreate';
import type { CapabilityContext } from './types';

const ctx: CapabilityContext = {
  userId: 'u1', userName: '张三', permissions: ['activity:create'],
  projects: [{ id: 'p1', name: 'GW-X500' }],
  roles: [{ id: 'r1', name: '结构组' }],
};

describe('activity.create · parse 护栏（纯函数）', () => {
  it('missingRequired：缺项目/名称都列出', () => {
    expect(activityCreateCapability.missingRequired!({}, ctx)).toEqual(['项目', '活动名称']);
    expect(activityCreateCapability.missingRequired!({ projectId: 'p1', name: '打样' }, ctx)).toEqual([]);
  });

  it('validateRefs：编造 projectId/roleId 被拦', () => {
    expect(activityCreateCapability.validateRefs!({ projectId: 'pX' }, ctx).ok).toBe(false);
    expect(activityCreateCapability.validateRefs!({ projectId: 'p1', roleId: 'rX' }, ctx).ok).toBe(false);
    expect(activityCreateCapability.validateRefs!({ projectId: 'p1', roleId: 'r1' }, ctx).ok).toBe(true);
  });

  it('inputSchema：非法枚举被拦', () => {
    expect(activityCreateCapability.inputSchema.safeParse({ type: 'WRONG' }).success).toBe(false);
    expect(activityCreateCapability.inputSchema.safeParse({ type: 'MILESTONE', priority: 'HIGH' }).success).toBe(true);
  });

  it('applyDefaults：补 TASK/MEDIUM/NOT_STARTED', () => {
    expect(activityCreateCapability.applyDefaults!({ projectId: 'p1', name: '打样' }, ctx))
      .toMatchObject({ type: 'TASK', priority: 'MEDIUM', status: 'NOT_STARTED' });
  });

  it('previewDisplay：roleId 显示角色名 + 自动填入提示', () => {
    expect(activityCreateCapability.previewDisplay!('roleId', 'r1', ctx)).toContain('结构组');
    expect(activityCreateCapability.previewDisplay!('projectId', 'p1', ctx)).toBe('GW-X500');
  });
});
```

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/activityCreate.test.ts`
Expected: PASS（5 用例）。

- [ ] **Step 4: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/services/assistant/capability/activityCreate.ts server/src/services/assistant/capability/activityCreate.test.ts server/src/services/assistant/capability/bootstrap.ts
git commit -m "feat(capability): add activity.create with role-based executor auto-fill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: propose 路由把角色名加载进 `capCtx.roles`

**Files:**
- Modify: `server/src/routes/assistant.ts`（propose 的 capability 分支 capCtx）

- [ ] **Step 1: 在 propose 路由加载角色并填入 capCtx**

在 `routes/assistant.ts` propose 处理中，能力分支构造 `capCtx` 处（`const capCtx = { ... projects: manageable }`）改为先查全量角色再带上 `roles`：

```ts
        const roles = await prisma.role.findMany({ select: { id: true, name: true } });
        const capCtx = {
          userId: req.user!.id,
          userName: req.user?.realName || req.user?.username || '我',
          permissions: req.user?.permissions || [],
          contextProjectId,
          projects: manageable,
          roles,
        };
```

> apply 路由的 capCtx 无需 roles（execute 用 roleId 直接 `autoAssignByRole` 查库），保持不动。

- [ ] **Step 2: 路由测试不回归 + 能力被分类器纳入**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/routes/assistant.test.ts`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/routes/assistant.ts
git commit -m "feat(assistant): load roles into capability context for activity.create

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: PR2 收尾验证

- [ ] **Step 1: 自有文件 typecheck 零新增报错**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx tsc --noEmit 2>&1 | grep -E 'capability/activityCreate|activities/shared|activities/crud|routes/assistant\.ts'`
Expected: 无输出（既存 ~573 无关报错不计）。

- [ ] **Step 2: 相关测试全绿**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/ src/routes/activities/ src/routes/assistant.test.ts`
Expected: PASS。

- [ ] **Step 3: lint 零警告（本 PR 文件）**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap && npx eslint server/src/services/assistant/capability/activityCreate.ts server/src/routes/activities/shared.ts server/src/routes/activities/crud.ts server/src/routes/assistant.ts`
Expected: 无输出。

- [ ] **Step 4（可选浏览器冒烟）：** 启动 dev，登录后在首页输入「在 GW-X500 建个『结构打样』活动，交给结构组」→ 出现新建活动预览（含"执行人：按角色『结构组』自动填入 N 人"）→ 确认 → 活动被创建且执行人为结构组在职成员。

---

## Self-Review（计划 vs 规格 §4）

- **createActivityCore 抽出 + 路由/能力共用**（安全铁律③）→ Task 1 + Task 2 execute。
- **create 类、无 target、projectId/roleId 经 validateRefs 白名单**→ Task 2（能力 `validateRefs`）。
- **missingRequired=项目/活动名称；applyDefaults=TASK/MEDIUM/NOT_STARTED**→ Task 2。
- **预览：projectId→项目名、roleId→角色名+"将自动填入"，不异步枚举姓名；落库后 diff 给实际人数**→ Task 2（previewDisplay + execute rows）。
- **角色名解析需要 ctx.roles**→ Task 3（propose 路由加载 roles）。
- **不含**依赖、按人名点执行人 → inputSchema 未含，execute 不传 deps/executorIds。
- **类型一致性**：`createActivityCore(project, params, req)` 签名在 Task 1 定义、Task 2 execute 调用一致；`CapabilityContext.roles?` 来自 PR1。
- **行为保持**：crud 创建路由的错误码/消息/依赖逻辑/审计经 Task 1 保留（归档/权限移入 core 但对无依赖请求顺序一致）。

## 风险与备注

- **services→routes 依赖**：能力从 `routes/activities/shared` 导入 `createActivityCore` 属 services→routes 方向（轻微架构异味）。`shared.ts` 实为活动「共享 helpers」模块（已导出 prisma/枚举/各 helper），权衡后接受；如评审坚持，可后续把活动 helpers 整体迁到 `services/`（本 PR 不做，避免额外 churn）。
- **执行人预览人数**：预览阶段不查库枚举姓名（保持同步），故预览不显示人数；落库后 diff 显示实际人数。这是有意取舍（避免给能力上下文塞角色成员的异步查询）。
