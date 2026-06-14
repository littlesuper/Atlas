# 全系统 AI 助手 · 框架与安全模型

> 目标：把已交付的"对话式排期助手"泛化为**覆盖全系统的可写助手**——用户用自然语言，
> AI 识别意图，系统在落库前展示改动预览，用户确认后经现有校验路径写入。
> 2026-06-13，经 L.S. 确认走"可写全系统"，并确认本安全模型 + 分期。

## 1. 不可妥协的安全模型（每个可写领域都必须满足）

继承自排期助手（见 `docs/specs/ai-scheduling-beacon/`），五条缺一不可：

1. **LLM 只在边缘**：仅"解析意图 + 复述结果"，**绝不直接产出权威值、绝不直接写库**。
2. **每次写入都需用户显式确认**：propose（预览 before→after）→ 用户确认 → apply。**无自动应用。**
3. **走现有校验写入路径**：apply 复用各模块**已有的路由 handler / service**（自带 Zod + 权限 + 审计），不开旁路。
4. **代码层护栏**（不依赖 prompt 自觉）：
   - 结构化意图过 Zod（拦造假字段 / 非法枚举）；
   - 所有实体 id 对真实库做白名单校验（拦造假 id）；
   - **LLM 不得填用户未陈述的值**（杜绝 `2026-04-26` 式编造）；
   - 解析不出 → "没听懂"，不瞎猜。
5. **全程审计可回滚**：`rawUtterance` + `resolvedIntent` + `appliedDiff`。

### 与排期的关键差异
排期的日期/风险由**确定性引擎**算，LLM 碰不到真值。多数 CRUD 领域**没有"计算"**——
LLM 的解析本身就是改动。故这些领域的安全来自：**用户逐字段确认 before→after + Zod/枚举校验
+ id 白名单 + 走现有校验路由**。LLM 仍只是"把话翻成结构化字段变更"，真值由用户与校验器拍板。

## 2. 架构：助手动作框架（Assistant Action Framework）

### 2.1 动作适配器（每个领域一个）
```ts
interface AssistantActionAdapter<TContext, TIntent> {
  domain: string;                              // 'schedule' | 'project' | 'product' | ...
  permission: { resource: string; action: string };  // requirePermission 用
  loadContext(targetId: string, req): Promise<TContext | null>;   // 拉白名单+当前值（字段最小化）
  buildIntentPrompts(utterance, ctx): { system: string; user: string };
  parseIntent(rawLLM: string, ctx): IntentParseResult<TIntent>;   // Zod + id 白名单（纯函数，可离线测）
  buildPreview(intent: TIntent, ctx): { diff: FieldDiff[]; risks: RiskFinding[] };  // 确定性
  fingerprint(ctx): string;                    // 权威态指纹，防并发
  apply(intent: TIntent, ctx, req): Promise<{ appliedDiff }>;     // 调现有校验路由
  narrate?(diff, risks): Promise<string>;      // 可选；缺省用通用 diff 叙述
}
```

### 2.2 通用编排（全部复用排期已建好的机制）
- `ProposalCache`（TTL 10min + 指纹 + 幂等）
- 通用 `propose(domain, targetId, utterance)`：loadContext → 权限 → LLM 解析（经 `aiCircuitBreaker`）
  → parseIntent（护栏）→ buildPreview → narrate → 缓存 → 返回。
- 通用 `apply(proposalId)`：取缓存 → 指纹校验（防并发）→ adapter.apply（现有校验路由）→ 审计。
- 降级：AI 不可用 503、没听懂 noOp、叙述失败仅结构化 diff、低置信警示——全部沿用。

### 2.3 API
- 新增通用 `POST /api/assistant/propose`、`POST /api/assistant/apply`（body 带 `domain`、`targetId`）。
- 现有 `POST /api/schedule-assistant/*` 保留为**薄别名**（向后兼容现有前端与测试），内部走框架的 `domain='schedule'`。

### 2.4 前端
- 浮层升级为**全局**（挂在应用外壳 `MainLayout`，所有页面可唤出）。
- 浮层感知当前路由的项目上下文；不在项目内时先让用户选目标。
- 时间线（意图解析〔AI〕→ 生成预览〔系统〕→ 预览待确认 → 已应用）通用化，适配各领域。

## 3. 分期（每阶段独立 check-in + 回归；不一把梭）

- **Phase 0 ✅** 排期助手（已交付，`docs/specs/ai-scheduling-beacon/`）。
- **Phase 1（本期）** 抽出通用框架 + 适配器注册表；把排期重构为**首个适配器**；新增 `/api/assistant/*`，
  `/api/schedule-assistant/*` 保留别名；浮层全局化。**不加新领域，排期行为与测试 100% 不变。**
- **Phase 2 ✅** 项目字段编辑（`project.update`：名称/状态/优先级/起止日）端到端：Zod + 枚举校验
  + 字段 diff 预览 + 日期区间风险 + 归档保护 + 走 `prisma.project.update`（复用 `isValidDateRange` 等校验helper）
  + 权限 + 正/负样本测试。同时新增**领域分类器** `domainClassifier`（从一句话路由 排期/项目字段），
  使单框对话可覆盖多领域。
- **Phase 3 ✅** 风险项编辑（`risk`：新建风险项 / 改严重度·状态）。项目内实体，目标定位复用
  resolveProjectTarget；update 的 riskItemId 对本项目风险项白名单校验；写入复用 riskItem + RiskItemLog 语义。
  纯增量——分类器/路由/前端零改动（adapter 注册即生效）。
- **Phase 4+** 每期一个领域（产品 / 周报 / 模板 / 用户…）。注意：产品非严格项目内实体，
  需把目标定位从"仅项目"泛化（adapter 自带 target 解析）后再接。

## 4. 明确不做
- ❌ 任何不经用户逐次确认的写入（无静默/自动应用）。
- ❌ 绕过现有校验路由的旁路写入。
- ❌ 让 LLM 决定权威值或编造未陈述的数据。
- ❌ 一次性铺开所有领域——必须分期，逐个建+测+验收。
