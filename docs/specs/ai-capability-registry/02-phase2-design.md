# 能力层 Phase 2：activity.create（含角色绑定）+ 真·多轮槽位填充 + 三领域统一迁移 — 设计

- 日期：2026-06-15
- 状态：已评审，待实现
- 关联：本目录 `00-design.md`（Phase 1 能力层 + project.create）、`01-implementation-plan.md`；`docs/specs/system-wide-assistant/`（助手框架与安全模型）；现有代码 `server/src/services/assistant/`
- 范围：后端为主（能力层骨架升级 + 新能力 + 三领域迁移 + 删除旧 adapter 体系）+ 前端（多轮交互 + need_input 气泡）

## 1. 背景与目标

Phase 1 落地了声明式 `Capability` 能力层与首个能力 `project.create`，但只跑通了「无目标、无引用、一次性」的 `create` 路径。Phase 1 设计 §9 明确把以下三项列为后续：

1. 重写现有 schedule / project / risk 三领域到能力层；
2. 真·多轮槽位填充（跨轮记忆）；
3. update/delete 的目标解析与引用校验泛化。

Phase 2 一次性补齐这三项，并新增一个能体现 Atlas 特色的能力 `activity.create`（含「按角色自动填入执行人」）。

**终局形态**：全站写操作只剩**一条** dispatch 路径——声明式 `Capability`。旧 `AssistantActionAdapter` 体系（`adapters/`、`registry.ts`、`orchestrator.ts`、`bootstrap.ts`）整体删除。`/api/assistant/propose` 的分支收敛为：`query`（只读问答）→ `capability`（写操作），不再有第三条 adapter 分支。

**安全模型五条铁律全程不破**（见 §8）。

## 2. 设计决策

| 维度 | 决策 |
|---|---|
| 能力层 vs adapter | **统一**：把 adapter 接口的全部能力（自定义 parse / 自定义 preview / loadContext / fingerprint / narrate）泛化进 `Capability`，迁完三领域后删除整套 adapter 体系 |
| 目标定位 | 能力声明 `target?: 'project'`；编排在 propose 时复用现有 `resolveProjectTarget`（确定性 `matchProjectByName` 优先）拿 projectId 并 `loadEntity`。create 类不设 target |
| 并发保护 | `capabilityApply` 对 `target` 类能力**重载实体 + 指纹复核**（不符抛 `VersionMismatchError`/409），补齐 Phase 1 能力层缺的 update 并发保护 |
| 引用校验 | 默认解析管线加 `validateRefs` 钩子（id 白名单，泛化 adapter 的 `fabricated_id`）；复杂解析能力用 `parseArgs` 钩子整体接管（schedule 复用现有 `parseIntentResponse`） |
| 多轮槽位 | 服务端 `pendingSlotStore` 持有「已填字段」，前端只持有不透明 `pendingId`（LLM 解析的半成品意图**不经前端**）；续填轮合并增量、缺啥问啥 |
| activity 范围 | 含角色绑定：用户说角色名 → 落库时自动展开该角色在职执行人；预览诚实标注「将按角色自动填入」，**不在预览异步枚举姓名**。v1 不含依赖、不含按人名点执行人 |
| 写入路径 | execute 复用现有/抽出的 service（安全铁律③）；activity.create 从 `routes/activities/crud.ts` 抽出 `createActivityCore` 共用 |

## 3. 地基：能力层骨架升级（PR1，纯基础设施，零行为变更）

### 3.1 `Capability` 接口扩展（`capability/types.ts`）

在 Phase 1 接口上**新增**下列可选成员（已有成员不动）：

```ts
type CapabilityMode = 'create' | 'update' | 'delete' | 'custom';

type CapabilityParseResult<TInput> =
  | { ok: true; input: TInput }
  | { ok: false; kind: 'not_understood' | 'fabricated' };

interface Capability<TInput = Record<string, unknown>> {
  // —— Phase 1 已有 —— name / description / permission / danger? / mode /
  //    inputSchema / buildPrompt / missingRequired? / applyDefaults? /
  //    previewLabels? / previewDisplay? / buildPreview? / loadEntity? /
  //    fingerprint? / execute

  /** 'project' = 作用于某个项目的 update/custom 能力：编排会 resolveProjectTarget + loadEntity。
   *  缺省 = create 类，无目标实体（projectId 等以输入字段形式出现，经 validateRefs 白名单）。 */
  target?: 'project';

  /** 默认解析管线（extractJson → inputSchema.safeParse → validateRefs）中的 id 白名单钩子。
   *  target 类能力会收到 loadEntity 得到的 entity（如 risk.update 用它校验 riskItemId）。 */
  validateRefs?(input: TInput, ctx: CapabilityContext, entity?: EntitySnapshot):
    | { ok: true }
    | { ok: false; fabricated: string[] };

  /** 复杂解析能力（schedule）整体接管解析；提供则跳过默认管线（inputSchema/validateRefs 不再调用）。 */
  parseArgs?(rawLLM: string, ctx: CapabilityContext, entity?: EntitySnapshot): CapabilityParseResult<TInput>;

  /** 自定义叙述（schedule 等）；缺省走通用叙述。 */
  narrate?(preview: AssistantPreview): string;

  /** 写入。target 类能力额外收到新鲜目标 {id, entity}；create 类 target 为 undefined。 */
  execute(
    input: TInput,
    ctx: CapabilityContext,
    req: Request,
    target?: { id: string; entity: EntitySnapshot }
  ): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }>;
}
```

`CapabilityContext` 新增 `roles: { id: string; name: string }[]`（路由一次性查全量角色名，供角色名解析/展示；角色名非敏感）。

### 3.2 编排升级（`capability/orchestrator.ts`）

`CapabilityProposeOutcome` 新增 `{ status: 'need_target' }` 与 `need_input` 携带 `partialArgs`：

```ts
type CapabilityProposeOutcome =
  | { status: 'ok'; proposalId: string; preview: AssistantPreview; narrative: string }
  | { status: 'need_input'; missing: string[]; partialArgs: Record<string, unknown> }
  | { status: 'need_target' }
  | { status: 'noop' } | { status: 'not_understood' }
  | { status: 'ai_unavailable' } | { status: 'unknown_capability' };
```

`capabilityPropose(name, utterance, ctx, priorArgs?)` 新流程：

```
1. getCapability(name)；无则 unknown_capability
2. 目标定位（target==='project' 时）：
   resolveProjectTarget(utterance, ctx.projects, ctx.contextProjectId)
     unresolved → need_target；ai_unavailable → ai_unavailable
   loadEntity(projectId) → entity；null → need_target
   否则 entity = undefined（create 类）
3. LLM 填参〔边缘1，经 aiCircuitBreaker〕：buildPrompt(utterance, ctx)
   续填轮（priorArgs 非空）：在 user prompt 追加「已知字段：<json>；本轮只补未知/被纠正的字段」
4. 解析：
   cap.parseArgs ? cap.parseArgs(rawLLM, ctx, entity)
                 : extractJson → inputSchema.safeParse → validateRefs(input, ctx, entity)
   not_understood/fabricated → not_understood
5. 合并（续填）：input = { ...priorArgs, ...nonEmpty(parsed) }（空值绝不抹掉已填）
6. missingRequired(input, ctx) 非空 → need_input{ missing, partialArgs: input }
7. applyDefaults(input, ctx)
8. preview = cap.buildPreview ? cap.buildPreview(input, entity, ctx)
                              : genericPreview(mode, input, entity, {labels,display}, ctx)
   rows 空 → noop
9. narrative = cap.narrate ? cap.narrate(preview) : 通用叙述
10. fingerprint：create → sha256(name + JSON(input))；target → cap.fingerprint(entity)
11. proposalStore.set({ capabilityName:name, args:input, targetId: projectId|'__new__', fingerprint, ... })
12. ok{ proposalId, preview, narrative }
```

`capabilityApply(proposalId, ctx, req)` 新增并发保护：

```
1. 取缓存；无 capabilityName → PROPOSAL_NOT_FOUND；已 applied → 幂等返回
2. getCapability
3. target 类：loadEntity(cached.targetId) → fresh
     null → TargetNotFoundError
     cap.fingerprint(fresh) !== cached.fingerprint → VersionMismatchError（409）
   create 类：跳过
4. result = cap.execute(args, ctx, req, target?{id,entity:fresh})
5. auditLog(rawUtterance + args + appliedDiff)；markApplied
```

### 3.3 默认解析管线（`capability/orchestrator.ts` 内 helper）

`extractJson(raw)`（Phase 1 已有）→ `inputSchema.safeParse` → 若 `validateRefs` 存在则跑，返回 `fabricated` 即视作 `not_understood`。`parseArgs` 存在则整段跳过，由能力自管。

### 3.4 路由集成（`server/src/routes/assistant.ts`）

- `domainOptions` 仅由 **capabilities + query** 构成（删除 `listAdapters()`）。
- propose 处理：
  - 读取可选 `pendingId`；命中有效 pending（且属当前用户）→ **跳过分类**，`domain = pending.capabilityName`，`capabilityPropose(domain, utterance, ctx, pending.partialArgs)`。
  - 否则照常 `classifyDomain`。
  - `isQuery` → `runAsk`（不变）。
  - 其余 → `capabilityPropose(domain, utterance, ctx)`。
  - 结局映射：`need_target` → 提示点明项目；`need_input` → 存/更新 pending、回 `{mode:'need_input', missing, pendingId}`；`ok`/`noop`/`not_understood` → 若本轮带 pendingId 则清除 pending。
- apply 处理：仅 `capabilityApply`（删除 `runApply` 分支与相关 import）。

### 3.5 删除清单（迁移完成后，见 §6）

`adapters/`（三文件 + 测试）、`assistant/registry.ts`、`assistant/orchestrator.ts`、`assistant/bootstrap.ts`、`routes/assistant.ts` 的 adapter 分支与 import。`resolveProjectTarget` 改由 `capabilityPropose` 调用（保留该文件）。`/api/schedule-assistant` 薄别名仍指向同一 propose/apply，行为不变。

## 4. activity.create（PR2，含角色绑定）

`capability/activityCreate.ts`：

- `name:'activity.create'`、`permission:{resource:'activity', action:'create'}`、`mode:'create'`、**无 target**（projectId 为输入字段，经 validateRefs 白名单）。
- `inputSchema`（全可选 + 枚举约束）：`projectId`、`name`、`type`(TASK/MILESTONE/PHASE)、`priority`(LOW/MEDIUM/HIGH/CRITICAL)、`status`(NOT_STARTED/IN_PROGRESS/COMPLETED/CANCELLED)、`planStartDate`/`planEndDate`(YYYY-MM-DD)、`roleId`、`phase`、`description`。**不含** dependencies、executorIds（按人名点）。
- `buildPrompt`：把 `ctx.projects`、`ctx.roles` 按名列给 LLM 选填；铁律「绝不编造名称/项目/角色/日期；映射不到的枚举不填」。
- `validateRefs`：`projectId`（若有）∈ `ctx.projects`；`roleId`（若有）∈ `ctx.roles`。任一编造 → `fabricated`。
- `missingRequired`：缺 `projectId`→「项目」、缺 `name`→「活动名称」。
- `applyDefaults`：`type=TASK`、`priority=MEDIUM`、`status=NOT_STARTED`。
- 预览（sync，`mode:create` + `previewDisplay`）：`projectId`→项目名、`roleId`→`角色「X」（将自动填入该角色在职执行人）`、`type/priority/status`→中文、日期原样。**不异步枚举执行人姓名**。
- `execute`：调**抽出的** `createActivityCore`（见下）；先 `canManageProject(userId, projectId)` 复核（与路由同款），落库后 diff 含「执行人：按角色「X」自动填入 N 人」（N 由 execute 内 `autoAssignByRole` 已知，非预览异步）。

**重构：抽出 `createActivityCore`**（`server/src/routes/activities/shared.ts`）

从 `routes/activities/crud.ts` 的 `POST /` 抽出「校验 + 落库」核心，供路由与能力共用（安全铁律③，避免逻辑漂移）：

```ts
// 入参为已解析字段；不含 req/res。抛 ActivityCreateError(code) 由调用方映射。
async function createActivityCore(params: {
  projectId: string; name: string;
  type?: ActivityType; priority?: Priority; status?: ActivityStatus;
  phase?: string | null; description?: string | null;
  planStartDate?: string | null; planEndDate?: string | null;
  roleId?: string | null; executorIds?: string[];
}, currentUserId: string): Promise<Activity>
```

职责：项目存在校验（缺→`PROJECT_NOT_FOUND`）、归档校验（→`PROJECT_ARCHIVED`）、`buildExecutorsForActivity(roleId, executorIds, currentUserId)` 角色展开、有起止则 `calculateWorkdays` 算 `planDuration`、`prisma.activity.create({include: EXECUTOR_INCLUDE})`、`updateProjectProgress`、返回 activity。**不含** dep-cycle / date-from-deps（仍留路由）、**不含** audit（调用方各自审计）。路由保留 `canManageProject` + 依赖处理 + 自身 audit + res 映射，create 部分改调 `createActivityCore`，**现有路由行为与测试不变**。

典型流程：「在 GW-X500 项目建个『结构打样』活动，交给结构组」→ projectId=GW-X500、name=结构打样、roleId=结构组 → 预览（含「执行人：按角色『结构组』自动填入」）→ 确认 → 创建 + 自动填入结构组在职成员为执行人。
缺字段：「帮我建个活动」→ `need_input`：「项目、活动名称」→ 多轮补全（见 §5）。

## 5. 真·多轮槽位填充 + need_input 美化（PR3）

### 5.1 服务端 pending 槽位存储（`capability/pendingSlotStore.ts`）

```ts
interface PendingSlot {
  userId: string;
  capabilityName: string;
  partialArgs: Record<string, unknown>;
  missing: string[];
  createdAt: number;
}
// Map<pendingId, PendingSlot>，TTL 5min，仿 proposalStore（prune + __reset）。
// set 返回 pendingId(uuid)；get 校验 userId 归属 + TTL；delete(pendingId)。
```

**权威半成品意图只在服务端**；前端只拿不透明 `pendingId`（安全模型：LLM 解析意图不经前端回流）。

### 5.2 续填流程（路由 + 编排）

- 首轮缺字段：`capabilityPropose` 回 `need_input{missing, partialArgs}` → 路由 `pendingSlotStore.set(...)` 得 `pendingId` → 响应 `{mode:'need_input', missing, pendingId}`。
- 续填轮：前端带 `pendingId` 调 propose → 路由跳过分类、`get(pendingId)` 拿 `partialArgs` → `capabilityPropose(name, utterance, ctx, partialArgs)`。
- 合并：`{ ...partialArgs, ...nonEmpty(本轮解析) }`；重跑 `validateRefs`/`missingRequired`。仍缺 → 更新同一 pending、再问；齐 → 出预览、删 pending。
- 清除时机：完成（出预览/答案）、用户「新对话」、TTL、用户点「取消补充」。不每轮重分类（省 LLM）；「改主意」由气泡的取消入口覆盖。

### 5.3 前端

- `client/src/api`：`assistantApi.propose(utterance, contextProjectId, pendingId?)`（第三参可选）。
- `client/src/types/index.ts`：`AssistantProposeResult` 增 `pendingId?: string`；`AssistantMessage` 的 `need_input` status variant 携带 `missing?: string[]` 与 `pendingId?: string`。
- `client/src/store/assistantChatStore.ts`：新增 `pendingId: string | null`（persist），`reset` 清零；动作 `setPending`/`clearPending`。
- `client/src/hooks/useAssistantChat.ts`：`send` 带上当前 `pendingId`；结果为 `need_input` → `setPending(pendingId)` 并生成琥珀气泡；其余 → `clearPending()`。新增 `cancelPending()`（清 pending + 推一条「已取消补充」状态）。
- `client/src/pages/Home/MessageList.tsx`：`variant==='need_input'` 用**琥珀色**气泡（`amber` 系，区别于 noop/error/ai_unavailable），醒目列出待补字段 + 「补充后我接着办」+ 「取消」按钮（触发 `cancelPending`）。**MessageList 正被并发修改——实现时只加分支/类名，最小增量，不重写。**

## 6. 三领域迁移（PR4，行为/测试不变，迁完删 adapter）

依赖 PR1，按序迁移，每步保持全测试绿：

### 6.1 project.update（易）
`capability/projectUpdate.ts`：`mode:'update'`、`target:'project'`、`permission:{project,update}`。`inputSchema`：name?/status?/priority?/startDate?/endDate?。`loadEntity(projectId)`：载 {name,status,priority,startDate,endDate}（归档项目不在 `ctx.projects`，loadEntity 再兜底拒）。`fingerprint`：`[name,status,priority,iso(start),iso(end)].join('|')`。`buildPreview`：`genericPreview('update')` + `previewDisplay`（枚举中文）+ 日期区间风险。`execute`：校验区间 + `prisma.project.update`。移植 `projectAdapter.test.ts` → `projectUpdate.test.ts`。

### 6.2 risk（中，拆成两能力）
- `capability/riskCreate.ts`：`mode:'create'`、**无 target**、`permission:{project,update}`。`inputSchema`：projectId?/title?/severity?/description?。`validateRefs`：projectId∈ctx.projects。`missingRequired`：项目、标题。`execute`：`prisma.riskItem.create` + `RiskItemLog`。
- `capability/riskUpdate.ts`：`mode:'update'`、`target:'project'`、`permission:{project,update}`。`inputSchema`：riskItemId?/severity?/status?。`loadEntity(projectId)`：载本项目风险项（id/title/severity/status，置于 `entity.fields`）。`validateRefs(input,ctx,entity)`：riskItemId∈该项目风险项。`fingerprint(entity)`：风险项列表哈希。`buildPreview`：仅变化字段出 row（沿用 riskAdapter 语义）。`execute`：`prisma.riskItem.update`（status→RESOLVED 写 resolvedAt）+ `RiskItemLog`。
- 移植 `riskAdapter.test.ts` → `riskCreate.test.ts` + `riskUpdate.test.ts`。

### 6.3 schedule.update（难，custom 模式机械重包，行为零变）
`capability/scheduleUpdate.ts`：`mode:'custom'`、`target:'project'`、`permission:{activity,update}`。
- `loadEntity(projectId)`：复用 scheduleAdapter `loadContext` 逻辑，把 ProjectSnapshot + validIds + promptActivities 放入 `entity.fields`。
- `buildPrompt`：复用 `scheduleAssistantPrompts` 的 system/user（列活动）。
- `parseArgs(rawLLM, ctx, entity)`：复用现有 `parseIntentResponse(rawLLM, entity.validIds, projectId)`（含活动 id 白名单兜底）。
- `buildPreview(input, entity, ctx)`：复用 `dryRunSchedule(snapshot, operations)` + `assessRisks(...)`（均纯同步引擎，原样调用）。
- `narrate(preview)`：复用 schedule 自定义叙述。
- `fingerprint(entity)`：复用 `computeSnapshotFingerprint(snapshot)`。
- `execute(input, ctx, req, target)`：复用 `executeScheduleApply(target.id, operations, target.entity.snapshot, req)`。
- 移植 `scheduleAdapter.test.ts` → `scheduleUpdate.test.ts`。

### 6.4 收尾删除
注册全部能力到 `capability/bootstrap.ts`（project.create/update、activity.create、risk.create/update、schedule.update）。删除 §3.5 清单。更新 `routes/assistant.test.ts`（去掉 adapter 分支用例，补能力 dispatch 用例）、`bootstrap.test.ts`（改为能力注册断言或删除）。`npm run typecheck`（server）只看本批文件零 error（既存 ~573 无关报错不计）；前端 `tsc`；根 `npm run lint` 0 warning。

## 7. 文件落点

**新增（后端）**：`capability/activityCreate.ts`、`capability/pendingSlotStore.ts`、`capability/projectUpdate.ts`、`capability/riskCreate.ts`、`capability/riskUpdate.ts`、`capability/scheduleUpdate.ts` + 各 `*.test.ts`；`pendingSlotStore.test.ts`。
**修改（后端）**：`capability/types.ts`（接口扩展）、`capability/orchestrator.ts`（目标定位/指纹复核/parseArgs/validateRefs/续填/need_target）、`capability/bootstrap.ts`（注册全部能力）、`routes/assistant.ts`（pendingId + 仅 capability/query 分发）、`routes/activities/shared.ts`（抽 `createActivityCore`）、`routes/activities/crud.ts`（改调 core）。`capability/genericPreview.ts` 现有 create/update 模式已覆盖 project.update + activity.create，预计无需改动。
**删除（后端）**：`adapters/`（含测试）、`assistant/registry.ts`、`assistant/orchestrator.ts`、`assistant/bootstrap.ts`。
**修改（前端）**：`api`（propose 三参）、`types/index.ts`、`store/assistantChatStore.ts`、`hooks/useAssistantChat.ts`、`pages/Home/MessageList.tsx` + 相关测试。

## 8. 安全模型（五条逐条满足）

1. **LLM 只在边缘**：仅选能力 + 填参 + 复述；schedule 真值仍由确定性引擎（`dryRunSchedule`/`assessRisks`）算，diff 由 `genericPreview`/`buildPreview` 代码算，写入由 `execute` 代码做。
2. **每次写入显式确认**：propose→预览→确认→apply，无自动应用；多轮只影响「填参」阶段，apply 仍需独立确认。
3. **走现有校验路径**：`execute` 复用现有/抽出的 service（activity 走 `createActivityCore`，schedule 走 `executeScheduleApply`，project/risk 走原 prisma 路径 + 同款校验）。
4. **代码层护栏**：`inputSchema`（拦造假字段/枚举）+ `validateRefs`/`parseArgs` id 白名单（拦造假 projectId/roleId/riskItemId/activityId）+ 缺失必填 `need_input` 不编 + 解析不出「没听懂」+ 续填合并空值不抹已填。
5. **全程审计**：`capabilityApply` 记录 rawUtterance + args + appliedDiff；target 类多一层指纹复核（并发保护比 Phase 1 更严）。

## 9. 范围边界

**做**：能力层骨架升级（target/validateRefs/parseArgs/narrate/指纹复核）+ `activity.create`（含角色绑定）+ 真·多轮槽位填充 + need_input 琥珀气泡 + 迁移 project.update/risk(create+update)/schedule.update + 删除 adapter 体系 + 端到端验证。
**不做**：activity 依赖编辑、按人名点执行人、活动 update/delete 能力、项目/风险的 delete 能力、从 Zod 自动生成 description、跨能力的「改主意自动切换」（用取消入口替代）。

## 10. 验收标准

1. 「在 GW-X500 建个『结构打样』，交给结构组」→ 出「新建活动」预览（项目名/活动名/类型/优先级 + 「执行人：按角色『结构组』自动填入」）→ 确认 → 活动创建且结构组在职成员被填为执行人（走现有校验/权限/审计）。
2. 「帮我建个活动」→ 琥珀 `need_input` 列「项目、活动名称」；下一句「在 GW-X500，叫结构打样」→ 合并续填 → 直接出预览（**跨轮记忆生效**，不重复追问已答字段）。点「取消」→ pending 清除。
3. 迁移后：调整排期 / 改项目字段 / 新建·改风险项 / 只读问答**行为与现状一致**（移植测试全绿）；旧 adapter 代码已删除，`/propose` 无 adapter 分支。
4. `capabilityApply` 对 update/schedule 类：目标在 propose 后被并发改动 → apply 返回 409（指纹复核生效）。
5. 无对应权限的用户：该能力不进 LLM 清单；此类话回「没听懂」。
6. 安全模型五条满足；server typecheck（本批文件）/ 前端 tsc / lint / 单测全绿。

## 11. 实施顺序（栈式 PR，独立 worktree）

在 `/Users/xbot03/PlayCode/Atlas-cap`（分支 `feat/ai-capability-expansion`，基于含能力层的 HEAD）操作，避开主检出 codex 并发；只 stage 自有文件。

- **PR1 地基**：types 扩展 + orchestrator 升级（目标定位/指纹复核/parseArgs/validateRefs/need_target）+ ctx.roles + 默认管线 + 测试。无行为变更（现有能力仍只 project.create）。
- **PR2 activity.create**：`createActivityCore` 抽出 + activity.create 能力 + 注册 + 测试（依赖 PR1）。
- **PR3 多轮 + 气泡**：pendingSlotStore + 续填编排/路由 + 前端 pendingId/取消 + 琥珀气泡 + 测试（依赖 PR1；惠及 activity.create/project.create）。
- **PR4 迁移 + 删除**：project.update → risk.create/update → schedule.update 依次迁移、移植测试，最后删除 adapter 体系并清理路由/分类器（依赖 PR1）。
