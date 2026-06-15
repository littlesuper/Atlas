# 通用能力注册层（Capability Registry）+ project.create 首发 — 设计

- 日期：2026-06-15
- 状态：已评审，待实现
- 关联：`docs/specs/system-wide-assistant/`（助手框架与安全模型）、现有代码 `server/src/services/assistant/`
- 范围：后端为主（新增能力层 + 一个落地能力）+ 少量前端（追问气泡）。**不重写**现有 schedule/project/risk 三领域。

## 1. 背景与目标

目标是把 Atlas 往「AI（在用户权限内）可驱动全系统」演进。当前每个可写动作要手写一个 `AssistantActionAdapter`（parseIntent/buildPreview/apply），逐个补意图不可持续。

核心洞察：**用户意图无穷，但系统能力有限**。`AssistantActionAdapter` 框架其实已接近「能力注册表」（注册表动态路由、声明 domain/description/permission/Zod 校验/确定性 diff）。两个真正的障碍：

1. 框架假设「目标实体已存在」（`domain + targetId` 定位、`loadContext(targetId)` 查库、`fingerprint` 对旧状态哈希），**新建类意图没有 targetId**，会被卡在「认不出是哪个项目」。
2. 每个能力仍要手写 `parseIntent/buildPreview`，样板成本高。

本设计引入一个**通用能力层**：用声明式 `Capability`（带 Zod 契约 + mode 驱动的通用 diff）承载简单 CRUD/字段类能力，让新增能力近乎零样板；复杂/有副作用的领域（排期级联、风险评分）仍可自带逻辑。首个落地能力为 `project.create`（用户当前最痛的「帮我建个项目」）。

## 2. 设计决策

| 维度 | 决策 |
|---|---|
| 与现有框架关系 | **共存**：新增 Capability 层 + 独立编排；现有三 adapter 不动，继续工作；后续再逐步迁移 |
| 路由 | 复用现有 `classifyDomain`（纯函数，从清单选 key），把 capabilities 作为可选目标一并传入，**不改分类器** |
| 通用 diff | 由 `mode`（create/update/delete）代码生成；复杂领域用可选 `buildPreview` 自定义 |
| 创建型摩擦 | create 能力不要 targetId、不查实体、fingerprint 用 intent 哈希、apply 不再要求"先查到实体" |
| 缺失必填 | 新增 `need_input` 结果：列出缺失项提示补全；**一次性、无跨轮记忆**（真·多轮槽位填充留后续） |
| 权限 | LLM 只看到该用户有权限的能力（按 `capability.permission` 过滤）——AI 能力边界 = 用户权限边界 |
| 安全模型 | 五条全保留（见 §9）；apply 复用现有写入路径 |

## 3. 架构

### 3.1 Capability 接口（新增 `server/src/services/assistant/capability/types.ts`）
```ts
type CapabilityMode = 'create' | 'update' | 'delete' | 'custom';

interface CapabilityPreviewInput<TInput> {
  input: TInput;
  entity?: EntitySnapshot;        // update/delete 时为目标实体快照；create 时 undefined
  ctx: CapabilityContext;
}

interface Capability<TInput = unknown> {
  name: string;                   // 命名空间化，如 'project.create'（不与现有 domain key 冲突）
  description: string;            // 给 LLM 路由 + 填参用
  permission: { resource: string; action: string };
  danger?: 'normal' | 'dangerous';// 默认 normal；dangerous 预览加强警示
  mode: CapabilityMode;
  inputSchema: z.ZodType<TInput>; // 参数契约：LLM 填参后过它（拦造假字段/枚举/类型）

  /** update/delete：取目标实体（用于通用 diff + fingerprint）；create 不提供 */
  loadEntity?(id: string, ctx: CapabilityContext): Promise<EntitySnapshot | null>;
  /** 缺失必填检查；默认从 inputSchema 的 required 推断，可覆盖（如 create 默认 managerId 不算缺失） */
  missingRequired?(input: TInput, ctx: CapabilityContext): string[];
  /** 不给则按 mode 用通用 diff（genericPreview）；排期等复杂领域自带 */
  buildPreview?(p: CapabilityPreviewInput<TInput>): AssistantPreview;
  /** 写入：调现有 service/prisma（自带 Zod+权限+审计语义）。返回应用后的 diff/风险 */
  execute(input: TInput, ctx: CapabilityContext, req: Request): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }>;
  /** update/delete 用实体快照哈希；create 默认用 intent 哈希（见 §3.4） */
  fingerprint?(entity?: EntitySnapshot): string;
}
```
复用现有类型 `AssistantPreview` / `AssistantDiffRow` / `AssistantRisk`（`assistant/types.ts`）。`CapabilityContext = { userId; permissions: string[]; contextProjectId?: string | null; projects: ProjectRef[] }`（该用户权限可见的实体清单，用于 id 白名单与默认值）。

### 3.2 注册表（`capability/registry.ts`）
仿 `assistant/registry.ts`：`registerCapability` / `getCapability(name)` / `listCapabilities()` / `__reset()`。`capability/bootstrap.ts` 注册首批能力（本次仅 `projectCreateCapability`）。

### 3.3 通用编排（`capability/orchestrator.ts`）
新增 `capabilityPropose` / `capabilityApply`，**不改**现有 `assistant/orchestrator.ts`。

`capabilityPropose(capabilityName, utterance, ctx)`：
```
1. getCapability(name)；权限过滤双保险（无权限 → 不可达）
2. mode==update/delete：从话里解析目标实体 id（首发不涉及，预留）→ loadEntity → entity
3. LLM 填参〔边缘1，经 aiCircuitBreaker〕：buildArgsPrompt(capability, utterance, ctx)
4. 解析：抽 JSON → inputSchema.safeParse → 实体 id 白名单（如用户指定 managerId 须在真实库）
   失败 → { status: 'not_understood' }；AI 不可用 → { status: 'ai_unavailable' }
5. missingRequired(input) 非空 → { status: 'need_input', missing: string[] }
6. buildPreview：capability.buildPreview ?? genericPreview(mode, input, entity)
   rows 为空 → { status: 'noop' }
7. narrate〔边缘2，可降级为空〕
8. proposalStore.set（承载 capability proposal，见 §3.5）
9. { status: 'ok', proposalId, preview, narrative }
```

`capabilityApply(proposalId, req)`：取缓存 → getCapability → update/delete 重新 loadEntity 比对 fingerprint（create 跳过）→ `capability.execute` → 助手层 `auditLog`（rawUtterance + input + diff）→ markApplied。

### 3.4 通用 diff（`capability/genericPreview.ts`）
- `create`：每个有值字段 → `AssistantDiffRow{ before: '（空）', after: 值 }`，`raw` 为将创建的实体。
- `update`：`entity` 当前值 vs `input` 新值，仅变化字段出 row。
- `delete`：列出将删实体的关键字段 + 一条 `danger` 风险。
- 仅适用于「字段即 diff」的简单能力；副作用/级联（排期）必须走 `buildPreview` 自定义。

### 3.5 proposalStore 复用
复用 `assistant/proposalStore.ts` 的同一 `ProposalCache`（TTL 10min + 幂等）。`StoredProposal` 扩展为可承载两类提议：在现有字段外加可选 `capabilityName?: string` 与 `args?: unknown`；`runApply` 路由层按「有 capabilityName → capabilityApply，否则 → 现有 runApply」分发。create 的 `fingerprint` = `sha256(capabilityName + JSON(args)).slice(0,16)`（无"旧状态被并发改"问题，apply 仅用它做幂等键）。

### 3.6 路由集成（`server/src/routes/assistant.ts`）
分类阶段：`classifyDomain` 的 options = 现有 adapters + **capabilities** + query（`capability.name`/`description` 一并加入）。命中后分发：
- `query` → 现有 `runAsk`
- 现有 adapter domain（schedule/project/risk）→ 现有 `resolveProjectTarget` → `runPropose`（**完全不变**）
- capability（如 `project.create`）→ `capabilityPropose`（**不经过 resolveProjectTarget / targetId**，解决创建型摩擦）

apply 路由按缓存里有无 `capabilityName` 分发到 `capabilityApply` / `runApply`。

## 4. project.create 首发（`capability/capabilities/projectCreate.ts`）
- `name: 'project.create'`、`mode: 'create'`、`permission: { resource:'project', action:'create' }`、`danger:'normal'`。
- `inputSchema`：对齐 `server/src/schemas/projects.ts` 的 `createProjectSchema`——`name`(必填)、`productLine`(必填)、`status`(默认 IN_PROGRESS)、`priority`(默认 MEDIUM)、`managerId`(默认=当前登录用户)、`startDate?`/`endDate?`（给了才校验区间）、`description?`/`progress?`。
- `missingRequired`：仅当 `name` 或 `productLine` 缺失才返回（`managerId` 默认当前用户、status/priority 有默认，故不计入）。
- `execute`：直接 `prisma.project.create`（与现有 `projectAdapter.apply` 直连 prisma 的风格一致），并自做 `managerId` 存在性校验、日期区间校验（参照 `routes/projects/crud.ts:191` 的同款校验）；写权限由 `capability.permission` 过滤 + apply 前复核保证。
- `buildPreview`：用 `genericPreview('create', …)`——展示 名称/产品线/状态/优先级/负责人/起止日 的「空→新值」。

典型流程：「帮我建个项目甲，产品线蒲公英」→ name=项目甲、productLine=蒲公英、managerId=我 → 预览（空→新值）→ 确认 → 创建。「帮我建个新项目」（缺名）→ `need_input`：「还需要：项目名称、产品线」。

## 5. 前端改动（最小）
- `client/src/types/index.ts`：`AssistantMessage` 的 status variant 增加 `'need_input'`。
- `client/src/hooks/useAssistantChat.ts`：`toAssistantDraft` 把后端 `need_input` 结果映射为 `status/need_input` 气泡，文案=缺失提示。
- `pages/Home/MessageList.tsx`：`need_input` 复用现有 status 气泡渲染（可加一个「待补充」徽标）。
- propose/apply API 形状不变（沿用 `assistantApi`）。后端 `/propose` 响应在 noop 家族下增加 `mode:'need_input'` + `missing: string[]`。

## 6. 文件落点
**新增（后端）**：`capability/{types,registry,orchestrator,genericPreview,bootstrap}.ts`、`capability/capabilities/projectCreate.ts`、各 `*.test.ts`。
**修改（后端）**：`routes/assistant.ts`（分类 options 纳入 capabilities + propose/apply 分发）、`assistant/proposalStore.ts`（StoredProposal 加可选 capabilityName/args）、`assistant/bootstrap.ts` 旁引入 capability bootstrap。
**修改（前端）**：`types/index.ts`、`hooks/useAssistantChat.ts`、`pages/Home/MessageList.tsx`（+ 测试）。

## 7. 安全模型（五条逐条满足）
1. **LLM 只在边缘**：仅"选能力 + 填参 + 复述"；diff 由 `genericPreview`/`buildPreview` 代码算，写入由 `execute` 代码做。
2. **每次写入显式确认**：propose→预览→用户确认→apply，无自动应用。
3. **走现有校验路径**：`execute` 复用现有创建逻辑（Zod + managerId/日期校验 + 权限）。
4. **代码层护栏**：参数过 `inputSchema`（拦造假字段/枚举）、实体 id 白名单（拦造假 id）、缺失必填不编（`need_input`）、解析不出"没听懂"。
5. **全程审计**：`capabilityApply` 记录 rawUtterance + input + appliedDiff。

## 8. 测试
- **纯函数离线测**（仿现有 parseIntent 传统）：`projectCreate` 的参数解析（Zod 通过/拦截造假字段）、`missingRequired`（缺 name/productLine → 列出；齐 → 空）、`genericPreview('create')` 的 diff。
- **registry**：注册/获取/按权限过滤。
- **capabilityPropose**（mock LLM + prisma）：ok / need_input / not_understood / ai_unavailable；**capabilityApply**：execute 调用 + 审计 + 幂等。
- **前端**：`useAssistantChat` 把 need_input 映射为状态气泡。
- 后端 `npm run typecheck`、前端 `tsc`，根 `npm run lint` 0 warning。

## 9. 范围边界
**做**：Capability 接口 + 注册表 + 通用编排（create/update/delete/custom 全设计到位）+ 权限过滤 + `need_input` 一次性追问 + `danger` 字段 + `project.create` 一个落地能力 + 端到端验证。
**不做（后续）**：重写现有 schedule/project/risk 三领域；真·多轮槽位填充（跨轮记忆）；从 Zod 全自动生成 `description`；删除/批量等具体危险能力；update/delete 的目标解析泛化（接口预留，本次不接入具体能力）。

## 10. 验收标准
1. 「帮我建个项目甲，产品线蒲公英」→ 出现「新建项目」改动预览（空→新值，负责人默认当前用户）→ 确认 → 项目被创建（走现有校验/权限/审计）。
2. 「帮我建个新项目」（缺名）→ `need_input` 气泡列出「项目名称、产品线」，不创建、不编造。
3. 无 `project:create` 权限的用户：该能力不进 LLM 清单，此类话仍回「没听懂」。
4. 现有 schedule/project.update/risk 与只读问答**行为不变**（共存未破坏）。
5. 安全模型五条满足；`tsc`/`lint`/单测全绿。
