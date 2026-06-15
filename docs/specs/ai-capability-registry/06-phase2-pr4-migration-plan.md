# Phase 2 · PR4 三领域迁移到能力层 + 删除旧 adapter 体系 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 schedule / project / risk 三个 `AssistantActionAdapter` 迁移为 `Capability`（custom 模式、行为逐字保持），迁完删除整套旧 adapter 体系，使全站写操作只剩**一条** dispatch 路径（query 只读 + capability 写）。

**Architecture:** 每个 adapter 端到端**复用其原有的更底层纯逻辑**（`scheduleEngine`/`scheduleRisks`/`scheduleAssistantPrompts`/`scheduleAssistant`、`schemas/projectAssistant`、`schemas/riskAssistant` 全部保留不动），只把 adapter 那层「胶水」重写成 custom-mode 能力（`loadEntity`/`parseArgs`/`buildPreview`/`narrate`/`fingerprint`/`execute`）。这是**逐字重包、零行为变更**，不重塑意图结构、不拆分 risk（design §6.1/§6.2 的 genericPreview/拆分形态作为后续精修，本 PR 为降低迁移回归风险一律走 custom 端口）。迁移按 schedule→project→risk 顺序，每步把对应 adapter 从注册表摘除；最后统一删除 adapter 框架并把错误类迁到中性 `errors.ts`。

**Tech Stack:** TypeScript + Express + Prisma + Zod + Vitest。

**工作目录：** `/Users/xbot03/PlayCode/Atlas-cap`（分支 `feat/ai-capability-expansion`，已含 PR1+PR2+PR3）。提交只 `git add` 各任务列出的文件，**切勿 `git add -A`**。

**参考规格：** `docs/specs/ai-capability-registry/02-phase2-design.md` §6；现有 adapter 源码 `server/src/services/assistant/adapters/{schedule,project,risk}Adapter.ts`（作为逐字端口的依据）。

---

## 背景：迁移要点（实现者必读）

- 能力 `EntitySnapshot = { id: string; fingerprint: string; fields: Record<string, unknown> }`。约定：`loadEntity` 计算好领域指纹放进 `fingerprint`，并把领域上下文放进 `fields`；`fingerprint(entity)` 直接返回 `entity.fingerprint`（与 PR1 测试里 `fakeUpdateCap` 同模式）。
- 能力 `mode:'custom'` 的能力**必须**提供 `loadEntity`+`fingerprint`（PR1 注册守卫强制；`target:'project'` 也要求），并用自定义 `buildPreview`/`parseArgs`。
- **复用的底层（保留，勿删）**：`services/scheduleAssistant.ts`（`loadProjectSnapshot`/`computeSnapshotFingerprint`/`executeScheduleApply`/`DependencyCycleError`）、`utils/scheduleEngine.ts`（`dryRunSchedule`）、`utils/scheduleRisks.ts`（`assessRisks`）、`utils/scheduleAssistantPrompts.ts`（4 个 prompt/parse 函数）、`schemas/{scheduleAssistant,projectAssistant,riskAssistant}.ts`、`utils/validation.ts`（`isValidDateRange`）。
- **要删的胶水**：`adapters/{schedule,project,risk}Adapter.ts`(+ tests)、`assistant/registry.ts`、`assistant/orchestrator.ts`、`assistant/bootstrap.ts`(+ test)。
- 错误类现状：`assistant/orchestrator.ts` 定义 `UnknownDomainError`/`ProposalNotFoundError`/`TargetNotFoundError`/`VersionMismatchError`；`capability/orchestrator.ts` 从 `../orchestrator` import 这 4 个 + 自定义 `CapabilityForbiddenError`；`routes/assistant.ts` 也 import 这 4 个 + `ProjectValidationError`(from projectAdapter) + `DependencyCycleError`(保留)。
- 能力 `buildPrompt(utterance, ctx)` 当前**不收 entity**——但三领域的 prompt 都依赖加载态（活动表/当前字段/风险表），故 Task 1 先给 `buildPrompt` 加可选 `entity` 形参。
- `narrate?(preview): string` 存在则触发 LLM 复述；schedule 用自定义（`buildNarrateUserPrompt`），project/risk 旧时走「通用 LLM 叙述」→ 迁移后设 `narrate = genericNarrateUserPrompt`（PR1 已从 `capability/orchestrator.ts` 导出）。

---

## Task 1: backbone — `buildPrompt` 增加 entity 形参

**Files:**
- Modify: `server/src/services/assistant/capability/types.ts`
- Modify: `server/src/services/assistant/capability/orchestrator.ts`
- Test: 现有 `capability/orchestrator.test.ts`（不回归）

- [ ] **Step 1: 接口加 entity 形参**

`types.ts` 的 `Capability.buildPrompt` 改为：
```ts
  buildPrompt(utterance: string, ctx: CapabilityContext, entity?: EntitySnapshot): { system: string; user: string };
```

- [ ] **Step 2: 编排传 entity**

`orchestrator.ts` 中 `const prompt = cap.buildPrompt(utterance, ctx);` 改为 `const prompt = cap.buildPrompt(utterance, ctx, entity);`（此时 entity 已在目标定位阶段加载）。

- [ ] **Step 3: 不回归**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/`
Expected: PASS（create 能力忽略第 3 参，无影响）。

- [ ] **Step 4: Commit**
```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/services/assistant/capability/types.ts server/src/services/assistant/capability/orchestrator.ts
git commit -m "feat(capability): pass entity into buildPrompt (for target capabilities)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 迁移 schedule → `schedule.update` 能力（custom）

**Files:**
- Create: `server/src/services/assistant/capability/scheduleUpdate.ts`
- Create: `server/src/services/assistant/capability/scheduleUpdate.test.ts`
- Modify: `server/src/services/assistant/capability/bootstrap.ts`（注册）
- Modify: `server/src/services/assistant/bootstrap.ts`（摘除 scheduleAdapter）

- [ ] **Step 1: 写能力（逐字复用排期纯逻辑）**

Create `capability/scheduleUpdate.ts`:
```ts
import type { Request } from 'express';
import { z } from 'zod';
import {
  loadProjectSnapshot,
  computeSnapshotFingerprint,
  executeScheduleApply,
} from '../../scheduleAssistant';
import { dryRunSchedule, type ProjectSnapshot } from '../../../utils/scheduleEngine';
import { assessRisks, type RiskFinding } from '../../../utils/scheduleRisks';
import {
  buildIntentSystemPrompt,
  buildIntentUserPrompt,
  parseIntentResponse,
  buildNarrateUserPrompt,
  type IntentPromptActivity,
} from '../../../utils/scheduleAssistantPrompts';
import type { ScheduleChangeIntent } from '../../../schemas/scheduleAssistant';
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import { genericNarrateUserPrompt } from './orchestrator';
import type { Capability, CapabilityContext, EntitySnapshot } from './types';

const iso = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '—');

function toPromptActivities(snapshot: ProjectSnapshot): IntentPromptActivity[] {
  return snapshot.activities.map((a) => ({
    id: a.id,
    name: a.name,
    isMilestone: a.type === 'MILESTONE',
    planStartDate: a.planStartDate ? iso(a.planStartDate) : null,
    planEndDate: a.planEndDate ? iso(a.planEndDate) : null,
    dependsOn: a.dependencies.map((d) => d.id),
  }));
}

function riskToAssistant(r: RiskFinding): AssistantRisk {
  switch (r.kind) {
    case 'milestone_slip':
      return { kind: r.kind, severity: 'warning', text: `里程碑「${r.name}」从 ${iso(r.before)} 移到 ${iso(r.after)}` };
    case 'hard_node_breach':
      return { kind: r.kind, severity: 'danger', text: `「${r.name}」预计 ${iso(r.projected)} 完成，晚于硬节点 ${iso(r.deadline)}` };
    case 'project_overdue':
      return { kind: r.kind, severity: 'danger', text: `项目预计 ${iso(r.projectedEnd)} 结束，晚于截止 ${iso(r.projectDeadline)}` };
  }
}

interface ScheduleFields {
  snapshot: ProjectSnapshot;
  validIds: string[];
  promptActivities: IntentPromptActivity[];
}

export const scheduleUpdateCapability: Capability<ScheduleChangeIntent> = {
  name: 'schedule.update',
  description: '调整活动排期：推迟/提前某活动、设定活动计划起止日、改工期、增删活动之间的依赖关系。',
  permission: { resource: 'activity', action: 'update' },
  mode: 'custom',
  target: 'project',
  // 解析全由 parseArgs 接管，inputSchema 仅占位（不会被默认管线用到）
  inputSchema: z.any() as unknown as z.ZodType<ScheduleChangeIntent>,

  async loadEntity(id: string): Promise<EntitySnapshot | null> {
    const snapshot = await loadProjectSnapshot(id);
    if (!snapshot) return null;
    const fields: ScheduleFields = {
      snapshot,
      validIds: snapshot.activities.map((a) => a.id),
      promptActivities: toPromptActivities(snapshot),
    };
    return { id, fingerprint: computeSnapshotFingerprint(snapshot), fields: fields as unknown as Record<string, unknown> };
  },
  fingerprint: (e) => e?.fingerprint ?? '',

  buildPrompt(utterance, _ctx, entity) {
    const f = entity?.fields as unknown as ScheduleFields;
    return { system: buildIntentSystemPrompt(), user: buildIntentUserPrompt(utterance, f?.promptActivities ?? []) };
  },

  parseArgs(rawLLM, _ctx, entity) {
    const f = entity?.fields as unknown as ScheduleFields;
    const r = parseIntentResponse(rawLLM, f?.validIds ?? [], entity?.id ?? '');
    if (r.ok) return { ok: true, input: r.intent };
    return { ok: false, kind: r.kind === 'fabricated_id' ? 'fabricated' : 'not_understood' };
  },

  buildPreview(intent, entity): AssistantPreview {
    const f = entity!.fields as unknown as ScheduleFields;
    const dry = dryRunSchedule(f.snapshot, intent.operations);
    const risks = assessRisks(f.snapshot, dry.snapshot, dry.diff);
    const rows: AssistantDiffRow[] = dry.diff.items
      .filter((i) => i.changed)
      .map((i) => ({ key: i.activityId, label: i.name, before: `${iso(i.before.start)} ~ ${iso(i.before.end)}`, after: `${iso(i.after.start)} ~ ${iso(i.after.end)}` }));
    return { rows, risks: risks.map(riskToAssistant), confidence: intent.confidence, raw: { diff: dry.diff, risks } };
  },

  narrate(preview) {
    const raw = preview.raw as { diff: Parameters<typeof buildNarrateUserPrompt>[0]; risks: RiskFinding[] } | undefined;
    return raw ? buildNarrateUserPrompt(raw.diff, raw.risks) : genericNarrateUserPrompt(preview);
  },

  async execute(intent, _ctx: CapabilityContext, req: Request, target) {
    const f = target!.entity.fields as unknown as ScheduleFields;
    const { diff, risks } = await executeScheduleApply(target!.id, intent.operations, f.snapshot, req);
    const rows: AssistantDiffRow[] = diff.items
      .filter((i) => i.changed)
      .map((i) => ({ key: i.activityId, label: i.name, before: `${iso(i.before.start)} ~ ${iso(i.before.end)}`, after: `${iso(i.after.start)} ~ ${iso(i.after.end)}` }));
    return { rows, risks: risks.map(riskToAssistant) };
  },
};
```

- [ ] **Step 2: 注册 + 摘除旧 adapter**

`capability/bootstrap.ts`：`import { scheduleUpdateCapability } from './scheduleUpdate';` + `registerCapability(scheduleUpdateCapability);`。
`assistant/bootstrap.ts`：从 `registerAllAdapters()` 中**删除** `registerAdapter(scheduleAdapter);`（及其 import）。

- [ ] **Step 3: 端口测试**（移植 `adapters/scheduleAdapter.test.ts` 的断言到能力层）

Create `capability/scheduleUpdate.test.ts`：覆盖 loadEntity（无项目→null）、parseArgs（合法→ok / 编造活动 id→fabricated）、buildPreview（dryRun 出 diff + 风险）、execute（调 executeScheduleApply）。参照原 adapter 测试的 mock 方式（mock `../../scheduleAssistant`、`../../../utils/scheduleEngine` 等）。

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/scheduleUpdate.test.ts`
Expected: PASS。

- [ ] **Step 4: 全量回归 + Commit**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/ src/routes/assistant.test.ts`
Expected: PASS（schedule 现经能力层；旧 scheduleAdapter 单测仍绿——它直接测对象）。
```bash
git add server/src/services/assistant/capability/scheduleUpdate.ts server/src/services/assistant/capability/scheduleUpdate.test.ts server/src/services/assistant/capability/bootstrap.ts server/src/services/assistant/bootstrap.ts
git commit -m "feat(capability): migrate schedule to schedule.update capability (custom)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 迁移 project → `project.update` 能力（custom，逐字端口）

**Files:**
- Create: `server/src/services/assistant/capability/projectUpdate.ts`
- Create: `server/src/services/assistant/capability/projectUpdate.test.ts`
- Modify: `capability/bootstrap.ts`、`assistant/bootstrap.ts`

- [ ] **Step 1: 写能力**（端口 `projectAdapter` 的 parse/preview/apply 逻辑；`CapabilityValidationError` 复用 Task 5 的 `errors.ts`——但 Task 5 在其后，故此处先用本地 class，Task 5 统一替换为 errors.ts 版）

Create `capability/projectUpdate.ts`（结构对照 `adapters/projectAdapter.ts`，把 `loadContext`→`loadEntity`、`parseIntent`→`parseArgs`、`buildPreview/apply` 端口；`ctx.project`→`entity.fields as ProjectFields`；`ctx.targetId`→`target.id`）：

```ts
import type { Request } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../../../db';
import { isValidDateRange } from '../../../utils/validation';
import {
  projectChangeIntentSchema,
  type ProjectChangeIntent,
  type ProjectOperation,
} from '../../../schemas/projectAssistant';
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import { genericNarrateUserPrompt } from './orchestrator';
import { CapabilityValidationError } from './errors'; // Task 5 创建；若先于 Task 5 实现，临时 `class CapabilityValidationError extends Error {}` 占位
import type { Capability, CapabilityContext, EntitySnapshot } from './types';

interface ProjectFields { name: string; status: string; priority: string; startDate: Date | null; endDate: Date | null; }

const STATUS_LABEL: Record<string, string> = { IN_PROGRESS: '进行中', COMPLETED: '已完成', ON_HOLD: '已暂停', ARCHIVED: '已归档' };
const PRIORITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '紧急' };
const FIELD_LABEL: Record<ProjectOperation['field'], string> = { name: '名称', status: '状态', priority: '优先级', startDate: '计划开始', endDate: '计划结束' };
const iso = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '未设定');

function displayValue(field: ProjectOperation['field'], value: string | Date | null): string {
  if (field === 'status') return STATUS_LABEL[value as string] ?? String(value);
  if (field === 'priority') return PRIORITY_LABEL[value as string] ?? String(value);
  if (field === 'startDate' || field === 'endDate') return value instanceof Date ? iso(value) : (value as string) || '未设定';
  return (value as string) ?? '未设定';
}
function currentValue(field: ProjectOperation['field'], p: ProjectFields): string | Date | null {
  switch (field) { case 'name': return p.name; case 'status': return p.status; case 'priority': return p.priority; case 'startDate': return p.startDate; case 'endDate': return p.endDate; }
}
function resolveDates(intent: ProjectChangeIntent, p: ProjectFields): { start: Date | null; end: Date | null } {
  let start = p.startDate, end = p.endDate;
  for (const op of intent.operations) {
    if (op.field === 'startDate') start = new Date(`${op.value}T00:00:00.000Z`);
    if (op.field === 'endDate') end = new Date(`${op.value}T00:00:00.000Z`);
  }
  return { start, end };
}
function fp(p: ProjectFields): string {
  return crypto.createHash('sha256').update([p.name, p.status, p.priority, iso(p.startDate), iso(p.endDate)].join('|')).digest('hex').slice(0, 16);
}

export const projectUpdateCapability: Capability<ProjectChangeIntent> = {
  name: 'project.update',
  description: '修改项目本身的属性：项目名称、项目状态(进行中/已完成/已暂停)、优先级、项目计划起止日期。',
  permission: { resource: 'project', action: 'update' },
  mode: 'custom',
  target: 'project',
  inputSchema: z.any() as unknown as z.ZodType<ProjectChangeIntent>,

  async loadEntity(id) {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, status: true, priority: true, startDate: true, endDate: true } });
    if (!project) return null;
    if (project.status === 'ARCHIVED') return null; // 归档不可编辑 → target_not_found
    const fields: ProjectFields = { name: project.name, status: project.status, priority: project.priority, startDate: project.startDate, endDate: project.endDate };
    return { id, fingerprint: fp(fields), fields: fields as unknown as Record<string, unknown> };
  },
  fingerprint: (e) => e?.fingerprint ?? '',

  buildPrompt(utterance, _ctx, entity) {
    const p = entity!.fields as unknown as ProjectFields;
    const system = `你是项目管理系统的"项目字段编辑意图解析器"。把用户的话解析成对**项目本身属性**的结构化改动。
可改字段（只有这几项）：
- name：项目名称（字符串）
- status：项目状态，只能是 IN_PROGRESS(进行中) / COMPLETED(已完成) / ON_HOLD(已暂停)。**不能设为已归档**。
- priority：优先级，只能是 LOW(低) / MEDIUM(中) / HIGH(高) / CRITICAL(紧急)。
- startDate / endDate：计划起止日，格式 YYYY-MM-DD。
铁律：
- 只输出用户**明确表达**的字段改动；**绝不编造用户没说的值**。
- status/priority 必须映射到上面的枚举值之一；映射不了就不要输出该操作。
- 解析不出任何明确改动 → 返回空 operations。
- 有把握 confidence:"high"，含糊 confidence:"low"。
严格输出 JSON：{"operations":[{"field":"...","value":"..."}],"confidence":"high|low","unresolved":[]}`;
    const user = ['## 当前项目字段', `- 名称：${p.name}`, `- 状态：${STATUS_LABEL[p.status] ?? p.status}`, `- 优先级：${PRIORITY_LABEL[p.priority] ?? p.priority}`, `- 计划开始：${iso(p.startDate)}`, `- 计划结束：${iso(p.endDate)}`, '', '## 用户的话', utterance, '', '请输出 JSON 格式的结构化意图。'].join('\n');
    return { system, user };
  },

  parseArgs(rawLLM) {
    let s = rawLLM.trim();
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) s = fenced[1].trim();
    let raw: unknown;
    try { raw = JSON.parse(s); } catch { return { ok: false, kind: 'not_understood' }; }
    const parsed = projectChangeIntentSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, kind: 'not_understood' };
    return { ok: true, input: parsed.data };
  },

  buildPreview(intent, entity): AssistantPreview {
    const p = entity!.fields as unknown as ProjectFields;
    const rows: AssistantDiffRow[] = intent.operations.map((op) => ({ key: op.field, label: FIELD_LABEL[op.field], before: displayValue(op.field, currentValue(op.field, p)), after: displayValue(op.field, op.value) }));
    const risks: AssistantRisk[] = [];
    const { start, end } = resolveDates(intent, p);
    if (start && end && end.getTime() < start.getTime()) risks.push({ kind: '日期区间无效', severity: 'danger', text: `结束日 ${iso(end)} 早于开始日 ${iso(start)}` });
    return { rows, risks, confidence: intent.confidence };
  },

  narrate: (preview) => genericNarrateUserPrompt(preview),

  async execute(intent, _ctx: CapabilityContext, _req: Request, target) {
    const p = target!.entity.fields as unknown as ProjectFields;
    const { start, end } = resolveDates(intent, p);
    if (start && end && !isValidDateRange(iso(start), iso(end))) throw new CapabilityValidationError('结束日期不能早于开始日期');
    const data: Record<string, unknown> = {};
    for (const op of intent.operations) data[op.field] = (op.field === 'startDate' || op.field === 'endDate') ? new Date(`${op.value}T00:00:00.000Z`) : op.value;
    await prisma.project.update({ where: { id: target!.id }, data });
    const rows: AssistantDiffRow[] = intent.operations.map((op) => ({ key: op.field, label: FIELD_LABEL[op.field], before: displayValue(op.field, currentValue(op.field, p)), after: displayValue(op.field, op.value) }));
    return { rows, risks: [] };
  },
};
```

- [ ] **Step 2: 注册 + 摘除旧 adapter**：`capability/bootstrap.ts` 注册 `projectUpdateCapability`；`assistant/bootstrap.ts` 删 `registerAdapter(projectAdapter)`。

- [ ] **Step 3: 端口测试**（移植 `projectAdapter.test.ts`）：loadEntity（ARCHIVED→null）、parseArgs（枚举非法→not_understood）、buildPreview（字段 diff + 日期区间风险）、execute（prisma.update + 区间非法抛 CapabilityValidationError）。

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/projectUpdate.test.ts`
Expected: PASS。

- [ ] **Step 4: 回归 + Commit**
```bash
cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/
git add server/src/services/assistant/capability/projectUpdate.ts server/src/services/assistant/capability/projectUpdate.test.ts server/src/services/assistant/capability/bootstrap.ts server/src/services/assistant/bootstrap.ts
git commit -m "feat(capability): migrate project to project.update capability (custom)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 迁移 risk → `risk.update` 能力（custom，逐字端口，含 create+update 混合操作）

**Files:**
- Create: `server/src/services/assistant/capability/riskUpdate.ts`
- Create: `server/src/services/assistant/capability/riskUpdate.test.ts`
- Modify: `capability/bootstrap.ts`、`assistant/bootstrap.ts`

> 命名说明：保留单一能力 `risk.update`（custom 模式，内部仍支持 create_risk/update_risk 两种操作），不拆分——逐字端口、零行为变更。description 同原 adapter，分类器据此路由。

- [ ] **Step 1: 写能力**（端口 `adapters/riskAdapter.ts`：`loadContext`→`loadEntity`（fields={riskItems}）、`parseIntent`(含 riskItemId 白名单)→`parseArgs`、`buildPreview`/`apply` 逐字搬，`ctx.targetId`→`target.id`）：

```ts
import type { Request } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../../../db';
import { riskChangeIntentSchema, type RiskChangeIntent } from '../../../schemas/riskAssistant';
import type { AssistantPreview, AssistantDiffRow } from '../types';
import { genericNarrateUserPrompt } from './orchestrator';
import type { Capability, CapabilityContext, EntitySnapshot } from './types';

interface RiskItemRef { id: string; title: string; severity: string; status: string; }
const SEVERITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '严重' };
const STATUS_LABEL: Record<string, string> = { OPEN: '待处理', IN_PROGRESS: '处理中', RESOLVED: '已解决', ACCEPTED: '已接受' };

function fp(items: RiskItemRef[]): string {
  const blob = items.slice().sort((a, b) => a.id.localeCompare(b.id)).map((r) => `${r.id}:${r.severity}:${r.status}:${r.title}`).join('|');
  return crypto.createHash('sha256').update(blob).digest('hex').slice(0, 16);
}

export const riskUpdateCapability: Capability<RiskChangeIntent> = {
  name: 'risk.update',
  description: '管理项目的风险项：新建一条风险项；修改已有风险项的严重度(低/中/高/严重)或状态(待处理/处理中/已解决/已接受)。',
  permission: { resource: 'project', action: 'update' },
  mode: 'custom',
  target: 'project',
  inputSchema: z.any() as unknown as z.ZodType<RiskChangeIntent>,

  async loadEntity(id) {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return null;
    const items = await prisma.riskItem.findMany({ where: { projectId: id }, select: { id: true, title: true, severity: true, status: true }, orderBy: { createdAt: 'desc' } });
    return { id, fingerprint: fp(items), fields: { riskItems: items } as Record<string, unknown> };
  },
  fingerprint: (e) => e?.fingerprint ?? '',

  buildPrompt(utterance, _ctx, entity) {
    const items = (entity!.fields.riskItems as RiskItemRef[]) ?? [];
    const system = `你是项目管理系统的"风险项编辑意图解析器"。把用户的话解析成对**风险项**的结构化改动。
可执行的操作：
- create_risk：新建风险项。{ "type":"create_risk", "title":"<风险标题，来自用户原话>", "severity":"LOW|MEDIUM|HIGH|CRITICAL", "description":"<可选>" }
- update_risk：修改已有风险项的严重度/状态。{ "type":"update_risk", "riskItemId":"<从下方清单选>", "severity":"...(可选)", "status":"OPEN|IN_PROGRESS|RESOLVED|ACCEPTED(可选)" }
铁律：
- update_risk 的 riskItemId **只能**从下方清单里选；清单里没有就**不要编造 id**。
- severity/status 必须是上面的枚举值；映射不了就不要输出该操作。
- **不要编造用户没说的标题或内容**。解析不出明确改动 → 返回空 operations。confidence：有把握 high，含糊 low。
严格输出 JSON：{"operations":[...],"confidence":"high|low","unresolved":[]}`;
    const lines: string[] = ['## 现有风险项清单（update_risk 只能从这里选 riskItemId）'];
    if (items.length === 0) lines.push('（暂无风险项）');
    else for (const r of items) lines.push(`- id=${r.id} | 标题=${r.title} | 严重度=${SEVERITY_LABEL[r.severity] ?? r.severity} | 状态=${STATUS_LABEL[r.status] ?? r.status}`);
    lines.push('', '## 用户的话', utterance, '', '请输出 JSON 格式的结构化意图。');
    return { system, user: lines.join('\n') };
  },

  parseArgs(rawLLM, _ctx, entity) {
    let s = rawLLM.trim();
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) s = fenced[1].trim();
    let raw: unknown;
    try { raw = JSON.parse(s); } catch { return { ok: false, kind: 'not_understood' }; }
    const parsed = riskChangeIntentSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, kind: 'not_understood' };
    const validIds = new Set(((entity!.fields.riskItems as RiskItemRef[]) ?? []).map((r) => r.id));
    for (const op of parsed.data.operations) if (op.type === 'update_risk' && !validIds.has(op.riskItemId)) return { ok: false, kind: 'fabricated' };
    return { ok: true, input: parsed.data };
  },

  buildPreview(intent, entity): AssistantPreview {
    const items = (entity!.fields.riskItems as RiskItemRef[]) ?? [];
    const byId = new Map(items.map((r) => [r.id, r]));
    const rows: AssistantDiffRow[] = [];
    for (const op of intent.operations) {
      if (op.type === 'create_risk') {
        rows.push({ key: `new:${op.title}`, label: '新建风险项', before: '（无）', after: `${op.title}（严重度：${SEVERITY_LABEL[op.severity]}）` });
      } else {
        const existing = byId.get(op.riskItemId);
        if (!existing) continue;
        if (op.severity && op.severity !== existing.severity) rows.push({ key: `${op.riskItemId}:severity`, label: `「${existing.title}」严重度`, before: SEVERITY_LABEL[existing.severity] ?? existing.severity, after: SEVERITY_LABEL[op.severity] });
        if (op.status && op.status !== existing.status) rows.push({ key: `${op.riskItemId}:status`, label: `「${existing.title}」状态`, before: STATUS_LABEL[existing.status] ?? existing.status, after: STATUS_LABEL[op.status] });
      }
    }
    return { rows, risks: [], confidence: intent.confidence };
  },

  narrate: (preview) => genericNarrateUserPrompt(preview),

  async execute(intent, _ctx: CapabilityContext, req: Request, target) {
    const items = (target!.entity.fields.riskItems as RiskItemRef[]) ?? [];
    const byId = new Map(items.map((r) => [r.id, r]));
    const userId = req.user?.id || '';
    const rows: AssistantDiffRow[] = [];
    for (const op of intent.operations) {
      if (op.type === 'create_risk') {
        const item = await prisma.riskItem.create({ data: { projectId: target!.id, title: op.title, description: op.description || null, severity: op.severity, source: 'manual' } });
        await prisma.riskItemLog.create({ data: { riskItemId: item.id, action: 'CREATED', content: `创建风险项「${op.title}」，严重度: ${op.severity}`, userId } });
        rows.push({ key: `new:${item.id}`, label: '新建风险项', before: '（无）', after: `${op.title}（严重度：${SEVERITY_LABEL[op.severity]}）` });
      } else {
        const existing = byId.get(op.riskItemId);
        if (!existing) continue;
        const data: Record<string, unknown> = {};
        if (op.severity && op.severity !== existing.severity) {
          data.severity = op.severity;
          await prisma.riskItemLog.create({ data: { riskItemId: op.riskItemId, action: 'SEVERITY_CHANGED', content: `严重度从 ${existing.severity} 变更为 ${op.severity}`, userId } });
          rows.push({ key: `${op.riskItemId}:severity`, label: `「${existing.title}」严重度`, before: SEVERITY_LABEL[existing.severity] ?? existing.severity, after: SEVERITY_LABEL[op.severity] });
        }
        if (op.status && op.status !== existing.status) {
          data.status = op.status;
          if (op.status === 'RESOLVED') data.resolvedAt = new Date();
          await prisma.riskItemLog.create({ data: { riskItemId: op.riskItemId, action: 'STATUS_CHANGED', content: `状态从 ${existing.status} 变更为 ${op.status}`, userId } });
          rows.push({ key: `${op.riskItemId}:status`, label: `「${existing.title}」状态`, before: STATUS_LABEL[existing.status] ?? existing.status, after: STATUS_LABEL[op.status] });
        }
        if (Object.keys(data).length > 0) await prisma.riskItem.update({ where: { id: op.riskItemId }, data });
      }
    }
    return { rows, risks: [] };
  },
};
```

- [ ] **Step 2: 注册 + 摘除**：`capability/bootstrap.ts` 注册 `riskUpdateCapability`；`assistant/bootstrap.ts` 删 `registerAdapter(riskAdapter)`（此时 `registerAllAdapters` 应为空体）。

- [ ] **Step 3: 端口测试**（移植 `riskAdapter.test.ts`）：parseArgs（编造 riskItemId→fabricated）、buildPreview（create + update 混合）、execute（create 写 riskItem+log；update status=RESOLVED 写 resolvedAt）。

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/riskUpdate.test.ts`
Expected: PASS。

- [ ] **Step 4: 回归 + Commit**
```bash
cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/
git add server/src/services/assistant/capability/riskUpdate.ts server/src/services/assistant/capability/riskUpdate.test.ts server/src/services/assistant/capability/bootstrap.ts server/src/services/assistant/bootstrap.ts
git commit -m "feat(capability): migrate risk to risk.update capability (custom)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 删除 adapter 体系 + 错误类迁移 + 路由/分类器收敛

**Files:**
- Create: `server/src/services/assistant/errors.ts`
- Modify: `server/src/services/assistant/capability/orchestrator.ts`、`server/src/services/assistant/capability/projectCreate.ts`、`server/src/services/assistant/capability/projectUpdate.ts`、`server/src/routes/assistant.ts`、`server/src/routes/activities/crud.ts`（若它 import 了 adapter 错误——核对）
- Delete: `adapters/scheduleAdapter.ts`(+test)、`adapters/projectAdapter.ts`(+test)、`adapters/riskAdapter.ts`(+test)、`assistant/registry.ts`、`assistant/orchestrator.ts`(+ `orchestrator.test.ts`)、`assistant/bootstrap.ts`(+ `bootstrap.test.ts`)
- Modify: `server/src/routes/assistant.test.ts`

- [ ] **Step 1: 建中性错误模块**

Create `services/assistant/errors.ts`（从 `assistant/orchestrator.ts` 搬这 4 个类，原样）：
```ts
export class UnknownDomainError extends Error {
  constructor(public readonly domain: string) { super(`未知助手领域：${domain}`); this.name = 'UnknownDomainError'; }
}
export class ProposalNotFoundError extends Error {
  constructor() { super('提议不存在或已过期'); this.name = 'ProposalNotFoundError'; }
}
export class TargetNotFoundError extends Error {
  constructor() { super('目标对象不存在'); this.name = 'TargetNotFoundError'; }
}
export class VersionMismatchError extends Error {
  constructor() { super('数据在此期间已被改动，请重新发起'); this.name = 'VersionMismatchError'; }
}
/** 项目/通用字段校验失败（如日期区间非法）→ 上层 400 */
export class CapabilityValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'CapabilityValidationError'; }
}
```

- [ ] **Step 2: 改 capability/orchestrator.ts 的错误来源**

把 `import { VersionMismatchError, TargetNotFoundError, ProposalNotFoundError, UnknownDomainError } from '../orchestrator';` 改为 `from '../errors';`。（`CapabilityForbiddenError` 仍在本文件定义。）

- [ ] **Step 3: 统一 `CapabilityValidationError`**

`capability/projectCreate.ts`：删除其本地 `CapabilityValidationError` 定义，改 `import { CapabilityValidationError } from './errors';`（保持导出兼容：若有别处 `import { CapabilityValidationError } from './projectCreate'`，改为从 errors 导入；用 grep 核对）。
`capability/projectUpdate.ts`：把 Task 3 的本地占位改为 `import { CapabilityValidationError } from './errors';`。

- [ ] **Step 4: 删除 adapter 体系文件**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git rm server/src/services/assistant/adapters/scheduleAdapter.ts server/src/services/assistant/adapters/scheduleAdapter.test.ts \
       server/src/services/assistant/adapters/projectAdapter.ts server/src/services/assistant/adapters/projectAdapter.test.ts \
       server/src/services/assistant/adapters/riskAdapter.ts server/src/services/assistant/adapters/riskAdapter.test.ts \
       server/src/services/assistant/registry.ts \
       server/src/services/assistant/orchestrator.ts server/src/services/assistant/orchestrator.test.ts \
       server/src/services/assistant/bootstrap.ts server/src/services/assistant/bootstrap.test.ts
```
（若 `adapters/` 目录还剩 `types.ts` 之类被引用的文件则保留；本批只删上面列出的。`AssistantActionAdapter` 接口在 `assistant/types.ts` —— 若已无引用可一并清理，但 `AssistantPreview/DiffRow/Risk` 等类型**仍被能力层引用，务必保留 types.ts**。)

- [ ] **Step 5: 收敛 `routes/assistant.ts`**

- 删 import：`getAdapter, listAdapters`（registry）、`runPropose, runApply, ProposalNotFoundError, VersionMismatchError, TargetNotFoundError, UnknownDomainError`（改从 `../services/assistant/errors` import 这 4 个错误类）、`'../services/assistant/bootstrap'` 这行副作用 import、`resolveProjectTarget`（不再直接用）、`ProjectValidationError`（projectAdapter 已删）。
- `domainOptions` 去掉 `...listAdapters().map(...)`，只剩 capabilities + QUERY_DOMAIN。
- 删除「写领域：adapter 分支」整段（从 `const adapter = getAdapter(domain);` 到该分支末尾的 `runPropose` 处理 switch）。能力分支已 `return` 处理所有命中能力；若 `getCapability(domain)` 未命中（理论上不会，因 domain 只来自 capabilities/query），收尾返回 400 UNKNOWN_DOMAIN。
- apply 路由：`runApply` 分支删除；`cached?.capabilityName ? capabilityApply : runApply` 简化为「非 capability 一律 PROPOSAL_NOT_FOUND（理论不达）」——实际所有提议都是 capability，故 apply 直接 `capabilityApply`。catch 链：`ProjectValidationError` → 替换为 `CapabilityValidationError`（→400）；保留 `DependencyCycleError`/`ActivityCreateError`/`ActivityCapabilityError`/`CapabilityForbiddenError`/`VersionMismatchError`/`TargetNotFoundError`/`ProposalNotFoundError`/`UnknownDomainError`。

参考收敛后的 propose 尾部（能力未命中兜底）：
```ts
      const capability = getCapability(domain);
      if (!capability) {
        res.status(400).json({ error: 'UNKNOWN_DOMAIN', message: `未知能力：${domain}` });
        return;
      }
      // ...（既有能力分支：构造 capCtx、capabilityPropose、pending 生命周期、switch）— 保持不变，但去掉末尾对 adapter 的回退
```
apply 尾部：
```ts
      const { proposalId } = req.body as { proposalId: string };
      const capCtx = { userId: req.user!.id, userName: req.user?.realName || req.user?.username || '我', permissions: req.user?.permissions || [], contextProjectId: null, projects: [], roles: [] };
      const result = await capabilityApply(proposalId, capCtx, req);
      res.json({ ok: true, appliedDiff: { rows: result.rows }, risks: result.risks });
```

- [ ] **Step 6: 修 `routes/assistant.test.ts`**

删除/改写 adapter-path 相关用例（schedule/project/risk 经 adapter 的断言），保留并按需新增 capability dispatch 用例。确保 mock 不再引用已删模块（`../services/assistant/registry`、`../orchestrator`、`bootstrap`）。`ProjectValidationError`→`CapabilityValidationError`。

- [ ] **Step 7: 全量验证**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/ src/routes/`
Expected: PASS。
Run（确认旧模块无悬空引用）: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx tsc --noEmit 2>&1 | grep -E "assistant/(registry|orchestrator|bootstrap)|adapters/" ` → 期望无「找不到模块」类报错（既存无关报错忽略）。

- [ ] **Step 8: Commit**
```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add -- server/src/services/assistant/errors.ts server/src/services/assistant/capability/orchestrator.ts server/src/services/assistant/capability/projectCreate.ts server/src/services/assistant/capability/projectUpdate.ts server/src/routes/assistant.ts server/src/routes/assistant.test.ts
# 删除已由 git rm 暂存；如有遗漏用具体路径 git add -u <path>
git commit -m "refactor(assistant): delete adapter system; unify on capability layer (single dispatch path)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> 注意：本任务**禁止 `git add -A`**。删除用 `git rm <具体文件>`，新增/改动用 `git add <具体文件>`，逐一列出。

---

## Task 6: PR4 收尾验证

- [ ] **Step 1: 后端 typecheck（自有 + 无悬空引用）**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx tsc --noEmit 2>&1 | grep -E 'services/assistant|routes/assistant' || echo clean`
Expected: 无本批新增报错；无「Cannot find module」指向已删文件。

- [ ] **Step 2: 后端全量助手/路由测试**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/ src/routes/`
Expected: PASS。

- [ ] **Step 3: lint**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap && npx eslint server/src/services/assistant/capability/ server/src/routes/assistant.ts server/src/services/assistant/errors.ts`
Expected: 无输出。

- [ ] **Step 4: `/api/schedule-assistant` 薄别名仍通**：核对该路由（`server/src/routes/scheduleAssistant*`）是否依赖被删模块；若依赖 `runPropose/runApply`，需一并改走 capability（或确认它本就独立调用 `services/scheduleAssistant`，不经 adapter 框架）。grep `git grep -n "assistant/orchestrator\|assistant/registry\|assistant/bootstrap" server/src` 应只剩 `errors`/`capability` 相关，无对已删文件的引用。

- [ ] **Step 5（可选浏览器冒烟）：** 调整排期 / 改项目字段 / 新建风险项 三类话各跑一遍 propose→apply，确认与迁移前行为一致。

---

## Self-Review（计划 vs 规格 §6）

- **schedule/project/risk 迁到能力层**（custom 端口，复用底层纯逻辑）→ Task 2/3/4。
- **删除 adapter 体系 + 错误类迁移 + 路由/分类器收敛**→ Task 5。
- **buildPrompt 需 entity** → Task 1（backbone 补形参）。
- **行为零变**：三能力逐字端口 adapter 的 parse/preview/apply/fingerprint/narrate（project/risk 用 `genericNarrateUserPrompt` 保留 LLM 通用叙述；schedule 保留自定义叙述）。
- **类型一致**：`loadEntity`→`EntitySnapshot{fields}`；`buildPreview(intent, entity)`、`execute(intent, ctx, req, target)`、`fingerprint(e)=e.fingerprint` 全链一致；`CapabilityValidationError` 统一到 `errors.ts`。
- **安全模型**：parseArgs 内白名单（schedule 活动 id / risk riskItemId）保留；指纹复核由 capabilityApply 统一做；审计由 capabilityApply 统一写。

## 偏离与风险

- **偏离 design §6.1/§6.2**：project 未拆成 genericPreview 字段模型、risk 未拆成 create+update，而是各自一个 custom 能力逐字端口。**理由**：迁移首要目标是行为零变 + 测试绿，custom 端口复用原 parse/apply 纯逻辑，回归面最小；genericPreview/拆分形态列为后续精修。
- **删除面大**：Task 5 一次删 11 个文件 + 改路由/测试，风险集中。务必逐步：先建 errors.ts + 改 import（Step 1-3）跑通，再删文件（Step 4），再收敛路由（Step 5），每步可独立 typecheck。
- **`AssistantActionAdapter`/`AdapterContext`/`IntentParseResult` 类型**：随 adapter 删除若无引用可清理，但 `assistant/types.ts` 内 `AssistantPreview/AssistantDiffRow/AssistantRisk` 仍被能力层 `../types` 引用——**保留 types.ts**，仅在确认无引用时移除 adapter 专属类型。
- **`/api/schedule-assistant` 别名**：须确认其实现不经 adapter 框架（Task 6 Step 4 验证）。
