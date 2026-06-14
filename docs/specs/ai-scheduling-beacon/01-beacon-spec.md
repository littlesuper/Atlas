# 01 · 灯塔实施规格：对话式排期 + 风险暴露

> 本规格定义**新增层**与**与现有引擎的集成契约**。凡涉及现有引擎内部实现的，标注为「契约假设 / step-0 核实」，由 Claude Code 读真实代码核对，**有出入先停下报告**。

---

## A. 目标与用户故事

**目标**：项目经理用自然语言调整某项目的排期，系统在**落库前**展示级联影响（哪些下游活动顺延）与风险（是否撞里程碑/硬节点/超期），PM **整批确认**后应用，全过程可审计、可回滚。

**用户故事**
- 作为 PM，我说"把硬件打样推迟两周，后面依赖它的任务都顺延"，系统给我一个改动预览（哪些活动从什么时候移到什么时候）+ 风险提示（验收里程碑会不会撞到我设的硬节点），我看完点"应用全部"或"取消"。
- 作为 PM，我说一句它没听懂的话，系统明确告诉我"没听懂，请换个说法或手动操作"，而不是瞎猜乱改。
- 作为团队，任何经由对话应用的排期改动，都在审计日志里留有"原始说法 + 解析意图 + 实际改动"，可回滚。

---

## B. 新增 vs 复用（总览）

| 能力 | 状态 | 本灯塔动作 |
|---|---|---|
| 依赖级联计算 / 计划时间推算 | 现有（调度器） | **复用**，新增"干跑"入口（见 §E 关键问题一） |
| 循环依赖检测 | 现有（dependencyValidator） | **复用**，应用阶段照常触发 |
| AI 调用熔断/降级 | 现有（circuitBreaker） | **复用**，两个 LLM 边缘都经它 |
| 撞里程碑/硬节点/超期判定 | 部分 | **新建确定性判定**（见 §E 关键问题二），不依赖 AI 风险引擎 |
| 自然语言 → 结构化意图 | 无 | **新建**（LLM 边缘 1） |
| 结构化结果 → 自然语言 | 无 | **新建**（LLM 边缘 2） |
| 提议→预览→确认→应用 管线 | 无 | **新建**（编排 + 前端） |
| 写入权威排期 | 现有（活动写入路径） | **复用**，对话只是触发，不直接写库 |

---

## C. 端到端数据流

```
[1] 前端：PM 在项目排期页的对话面板输入自然语言
        POST /api/schedule-assistant/propose  { projectId, utterance }
[2] 后端：拉取本项目活动清单（id, name, 计划时间, 依赖, 是否里程碑/硬节点）
[3] 后端：LLM 意图解析（经 circuitBreaker）
        输入 = utterance + 活动清单（仅 id/name 等必需字段）
        输出 = ScheduleChangeIntent（Zod 校验）
        解析失败 / 低置信 → 走 §G 降级，不进入 [4]
[4] 后端：调度器"干跑"（不落库）→ 假设排期 ProjectScheduleSnapshot
        计算 before/after diff（逐活动：旧计划时间 → 新计划时间）
[5] 后端：确定性风险判定（基于 diff + 里程碑/硬节点定义）
        → RiskFinding[]（撞里程碑 / 撞硬节点 / 整体超期）
[6] 后端：LLM 结果叙述（经 circuitBreaker）
        输入 = diff + RiskFinding（结构化）
        输出 = 一段自然语言预览（仅基于输入，禁止新增事实）
[7] 后端响应：{ proposalId, intent, diff, risks, narrative, parseConfidence }
        proposalId 关联服务端短期缓存的"已校验意图"（TTL，如 10 分钟）
[8] 前端：渲染 narrative + diff 表 + 风险标记，按钮[应用全部][取消]
[9] PM 点[应用全部]：
        POST /api/schedule-assistant/apply  { proposalId }
[10] 后端：取出缓存意图 → 通过【现有活动写入路径】提交改动
        → 调度器正式重算 → dependencyValidator 照常校验
        → 写审计日志（rawUtterance + intent + 实际 diff）
[11] 前端：刷新排期，提示"已应用，可在审计/撤回处回滚"
```

> 关键安全点：[9]→[10] **不信任前端传回的 diff**，只信 `proposalId` 对应的、服务端已校验缓存的 intent，再走现有写入路径重新计算。前端 diff 仅供展示。

---

## D. 数据结构（新增）

> 字段名为示意，Claude Code 按真实 schema 调整（如真实里程碑/硬节点字段叫什么、依赖怎么存）。

### D.1 ScheduleChangeIntent（LLM 边缘 1 的结构化输出，Zod 约束）

```ts
// server/src/schemas/scheduleAssistant.ts
const ScheduleOperation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('shift_activity'),  activityId: z.string(), deltaDays: z.number().int() }),
  z.object({ type: z.literal('set_planned'),     activityId: z.string(), field: z.enum(['start','end']), date: z.string() /* ISO */ }),
  z.object({ type: z.literal('set_duration'),    activityId: z.string(), durationDays: z.number().int().positive() }),
  z.object({ type: z.literal('add_dependency'),  activityId: z.string(), dependsOnId: z.string() }),
  z.object({ type: z.literal('remove_dependency'),activityId: z.string(), dependsOnId: z.string() }),
]);

const ScheduleChangeIntent = z.object({
  projectId: z.string(),
  operations: z.array(ScheduleOperation).min(1),
  confidence: z.enum(['high','low']),     // LLM 自评；low 时前端强制额外警示
  unresolved: z.array(z.string()).default([]), // 提到但无法对应到活动的词，原样回传给用户
});
```

**硬约束（在 §03 prompt 里强制）**：
- `activityId`/`dependsOnId` **只能**取自后端传入的活动清单，**不得编造**。无法对应 → 放进 `unresolved`，不要硬塞一个 id。
- 解析不出任何可执行操作 → 返回空操作 + 说明，由后端走降级，不得"猜一个最可能的"。

### D.2 ProjectScheduleSnapshot（干跑输出，见 §E 问题一）

```ts
type ScheduledActivity = {
  activityId: string; name: string;
  plannedStart: string; plannedEnd: string;
  isMilestone: boolean;          // 真实字段名 step-0 核实
  hardConstraintDate?: string;   // "硬节点"：不能晚于的日期，真实表示法 step-0 核实
};
type ProjectScheduleSnapshot = { activities: ScheduledActivity[] };
```

### D.3 ScheduleDiff（before/after，供展示与叙述）

```ts
type ActivityDiff = {
  activityId: string; name: string;
  before: { start: string; end: string } | null;  // 新增依赖等情况可能无 before
  after:  { start: string; end: string };
  changed: boolean;
};
type ScheduleDiff = { items: ActivityDiff[] };
```

### D.4 RiskFinding（确定性风险判定输出，见 §E 问题二）

```ts
type RiskFinding =
  | { kind: 'milestone_slip'; activityId: string; name: string; before: string; after: string }
  | { kind: 'hard_node_breach'; activityId: string; name: string; deadline: string; projected: string }
  | { kind: 'project_overdue'; projectDeadline: string; projectedEnd: string };
```

### D.5 审计记录（应用时写入）
沿用现有审计机制，附加：`rawUtterance`、`resolvedIntent`(JSON)、`appliedDiff`(JSON)、`actor`、`proposalId`。

---

## E. 关键集成问题（设计分水岭，step-0 必须核实并报告）

### 问题一：现有调度器能否"干跑"（不落库算出假设排期）？

灯塔要在应用前预览，必须能在**不写库**的前提下算出"如果这么改会变成什么样"。

- **若现有调度器有纯计算入口**（输入活动+依赖+变更 → 输出排期，无副作用）：直接包装为干跑。
- **若调度器只在写入时计算**（计算与持久化耦合）：**先重构**——把核心排期算法抽成纯函数 `computeSchedule(activities, deps, change): ProjectScheduleSnapshot`，让现有写入路径与新干跑入口**共用同一份算法**（避免两套实现产生分歧）。重构必须保持现有写入行为不变，并有回归测试覆盖。

→ **step-0 产出**：报告调度器属于哪种情况、干跑如何实现、是否需要重构、重构影响面。**等 L.S. 确认后再编码。**

### 问题二：风险如何判定？

Q3 已确认：本灯塔的"风险"**仅指可由排期结构确定性算出的**——撞里程碑、撞硬节点、整体超期。

- **判定放在确定性代码里**（基于 §D.2 的假设排期快照 + 里程碑/硬节点定义），**不交给 LLM，也不强依赖现有 AI 风险引擎**。理由：这类风险是结构化事实，确定性可算；让 LLM 判定会引入幻觉，依赖 AI 风险引擎会引入"它能否评估假设排期"的不确定性。
- 现有 AI 风险引擎**保持原职责不变**；如已有"里程碑/硬节点"概念，可在 step-0 复用其字段定义，避免重复造概念。

→ **step-0 产出**：报告真实 schema 里"里程碑""硬节点（不得晚于的日期）""项目截止"是如何表示的（字段名/枚举/关联表）。若**根本不存在**硬节点字段，报告并暂停——可能需要先补一个轻量字段，或本期只做"撞里程碑/超期"两类风险。

---

## F. API 设计（新增模块 `schedule-assistant`）

挂载 `/api/schedule-assistant`（`server/src/index.ts`），路由 `server/src/routes/scheduleAssistant.ts`，Zod 校验 `server/src/schemas/scheduleAssistant.ts`，编排逻辑 `server/src/services/scheduleAssistant.ts`。权限沿用项目写权限（PM 角色，step-0 核对现有权限模型）。

### F.1 `POST /api/schedule-assistant/propose`
- 入参：`{ projectId, utterance }`
- 流程：§C [2]–[7]
- 出参：`{ proposalId, intent, diff, risks, narrative, parseConfidence }`
- 失败/降级：见 §G

### F.2 `POST /api/schedule-assistant/apply`
- 入参：`{ proposalId }`
- 流程：§C [10]——取缓存意图 → 现有写入路径 → 重算 → 审计
- 出参：`{ ok: true, appliedDiff }` 或冲突错误（如缓存过期、期间排期已被他人改动 → 让用户重新 propose）
- **幂等**：同一 proposalId 重复 apply 只生效一次。

### F.3 提议缓存
- 服务端短期缓存 `proposalId → 已校验 intent + projectId + 创建时刻排期版本`，TTL（如 10 分钟）。
- apply 时若项目排期已变更（版本不一致）→ 拒绝并提示重新 propose（避免基于过期预览应用）。

---

## G. 护栏与降级（详见 `03`）

- **意图解析失败 / 空操作 / 全部 unresolved**：不进入干跑，返回"没听懂"+ 把 `unresolved` 回显给用户，建议换说法或手动操作。
- **低置信（confidence='low'）**：照常给预览，但前端**额外醒目警示**"AI 对你的意图不太确定，请仔细核对下面每一条改动"。
- **AI 不可用（circuitBreaker 打开）**：propose 直接返回"AI 助手暂不可用，请手动调整排期"，**不伪造**任何意图或叙述；不阻断手动排期功能。
- **叙述阶段 AI 不可用**：降级为**只展示结构化 diff 表 + 风险标记**（无自然语言段落），仍可让用户确认应用——因为 diff 与风险是确定性产物，不依赖 LLM。
- **应用必须人工确认**：无 `apply` 调用绝不写库；不存在自动应用。
- **不信任前端 diff**：apply 只认服务端缓存意图，重新计算。

---

## H. 前端

- **位置**：项目排期页（甘特/活动列表所在页）新增一个可收起的"排期助手"对话面板（Arco Design）。
- **组件**：复用 Arco（如 `Input.Search`/`Button`/`Table`/`Tag`/`Alert`/`Drawer` 或 `Card`）。diff 用表格：列 = 活动 | 原计划 → 新计划 | 风险标记（撞里程碑用警示色 Tag）。
- **交互**：输入 → loading（"正在分析…"）→ 渲染 narrative + diff 表 + 风险 → [应用全部][取消]。低置信时顶部 `Alert` 警示。
- **与现有约束兼容**：现有"内联编辑单例 + 依赖锁定计划时间"约束不受影响——助手不走内联编辑，走 propose/apply；应用后由调度器重算，与手改互斥规则一致。
- **类型/常量/API**：类型入 `client/src/types/index.ts`；API 封装入 `client/src/api/`；风险种类的中文/颜色入 `client/src/utils/constants.ts`。

---

## I. 明确不做（防范围蔓延）

- ❌ 自动应用（永远人工确认）
- ❌ 跨项目资源/产能调度优化（本期仅单项目内依赖级联）
- ❌ 工期/延期**概率预测**或工期估算（数据与建模另议）
- ❌ 多轮协商式排期、语音输入
- ❌ 编辑排期以外的实体（活动以外的活动属性、风险条目、周报、包材、节假日等）
- ❌ 让 LLM 参与日期计算或风险判定（仅意图解析 + 结果叙述两个边缘）

---

## J. 验收标准

1. PM 用自然语言可完成：推迟/提前某活动、设定某活动计划起止、改工期、增/删一条依赖。
2. 每次 propose 返回的 diff 与"按相同意图实际应用后调度器重算的结果"**完全一致**（干跑 = 实算）。
3. 撞里程碑/撞硬节点/整体超期，均能在预览中被确定性标出（构造用例验证命中与不命中）。
4. LLM 永远只从活动清单选 id；构造"提到不存在的活动"用例 → 进 `unresolved`，不编造 id。
5. 解析不出 → 明确"没听懂"，不瞎改。
6. AI 不可用 → propose 优雅降级提示；叙述不可用 → 仍能用结构化 diff 确认应用；手动排期不受影响。
7. 未点"应用全部"前，数据库无任何排期改动。
8. apply 只认服务端缓存意图，重算后写入；前端篡改 diff 不影响结果。
9. apply 经过 dependencyValidator（构造会形成环的依赖变更 → 被拒并提示）。
10. 应用后审计日志含 rawUtterance + 解析意图 + 实际 diff，且可回滚。
11. 提议缓存过期或期间排期被他人改动 → apply 被拒并提示重新 propose。
12. 所有 LLM 调用经现有 circuitBreaker；source 标识风格与现有 ai/rule_engine 一致。
13. 现有写入路径、调度器既有行为、内联编辑约束均未被破坏（回归测试通过）。

---

## K. 测试要求

- **意图解析测试集**：见 `04`，自然语言 → 期望结构化意图（含"没听懂""不存在的活动""低置信"等负样本）。可对解析层做契约测试（mock LLM 或离线评测）。
- **干跑一致性**：同一意图，干跑结果 == 实际应用后调度器结果。
- **风险判定**：构造撞/不撞里程碑、撞/不撞硬节点、超期/不超期的用例。
- **护栏**：AI 宕机降级、空意图、unresolved、低置信警示、前端篡改 diff。
- **回归**：调度器既有行为、dependencyValidator、内联编辑约束、现有活动写入。
- **E2E**：自然语言 → 预览 → 确认 → 已应用 + 审计可见 + 可回滚。

---

## L. 实施顺序（建议，Claude Code 分步执行）

0. **step-0 验证门**（不写代码）：核实 §E 两个问题 + 真实 schema 字段 + 现有写入路径与 circuitBreaker 接口，产出报告，**等 L.S. 确认**。
1. 后端：Zod schema + 干跑入口（或调度器重构）+ 确定性风险判定（纯逻辑，先单测）。
2. 后端：propose/apply 路由 + 提议缓存 + 审计；接 circuitBreaker。
3. 后端：两个 LLM 边缘（意图解析、结果叙述）+ prompt（落地 `03` 护栏）。
4. 前端：对话面板 + diff 表 + 风险标记 + 确认/取消 + 降级态。
5. 测试：意图集、干跑一致性、风险、护栏、回归、E2E。
6. 自检对照 §J 验收标准，输出验证报告。

每完成一步 check-in；步骤 1 涉及调度器重构、步骤 2 涉及迁移/写库前，**必须停下等确认**。
