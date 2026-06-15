# [BUG] computeSortOrder 在相邻/稠密 sortOrder 上塌缩到下界 → 插入活动排序冲突

- 严重度：P2（插入活动可能出现在错误位置；稠密 sortOrder 下必现）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：client/pages/Project/Detail/helpers.ts（`computeSortOrder`）

## 复现步骤

`client/src/pages/Project/Detail/helpers.ts:52`：

```ts
export function computeSortOrder(activities: { sortOrder: number }[], atIndex: number): number {
  const prev = atIndex > 0 ? activities[atIndex - 1].sortOrder : 0;
  const next = atIndex < activities.length ? activities[atIndex].sortOrder : prev + 20;
  return Math.floor((prev + next) / 2);
}
```

被 `pages/Project/Detail/index.tsx:180` 的 `handleInsertActivity` 用于「在某位置插入新活动」。

当现有 `sortOrder` 为**相邻整数**（稠密）时，`Math.floor((prev + next) / 2)` 塌缩到下界：
- `[1,2,3]` 在 index 1 插入：`floor((1+2)/2) = 1` → 新值 = prev(1)，与现有 sortOrder=1 的活动冲突。
- 首项 sortOrder=0（服务端默认 `sortOrder || 0`，见 `routes/activities/crud.ts:314`）在 index 0 插入：`floor((0+0)/2) = 0` → 与现有 sortOrder=0 冲突。

`sortOrder || 0` 的服务端默认意味着 sortOrder=0 / 稠密序列在实际数据里常见（任何未显式传 sortOrder 的活动都落 0）。

## 期望行为

`computeSortOrder` 返回的值应**严格落在 (prev, next) 开区间内**（插入到末尾时 > prev），保证不与任何现有 sortOrder 冲突、不破坏排序。

## 实际行为

相邻整数（含 0）场景下返回值 = prev（或 =0），与现有活动冲突 → 新插入的「新活动」会与同 sortOrder 的活动抢位，列表顺序错乱。

## 失败测试（交接契约）

- 路径：`client/src/pages/Project/Detail/helpers.test.ts`（新建文件）
  - `describe`：`computeSortOrder (GLM QA bug repro #9)`
  - 用例：① 相邻整数 [1,2,3] 在 index 1 插入；② 首项 sortOrder=0 在 index 0 插入
- 运行命令：

```bash
cd client && npx vitest run src/pages/Project/Detail/helpers.test.ts
```

- 当前失败输出（关键片段）：

```
 FAIL  ... > 相邻整数 sortOrder 之间插入，新值不得等于 prev 或 next（floor 平均会塌缩到下界）
AssertionError: expected 1 to be greater than 1
 FAIL  ... > 两端为 0 的退化情况：index 0 且首项 sortOrder=0 时，新值不得与首项冲突
AssertionError: expected 0 to be greater than 0
 Tests  2 failed (2)
```

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `client/src/pages/Project/Detail/helpers.ts` 的 `computeSortOrder`，使其在 `prev`/`next` 间距过小（或相等）时仍能给出非冲突值——例如：间距足够用中点；间距 ≤1 时回退到 `prev + 1` 并（可选）触发调用方重排，或直接保证 `result > prev`（中间插入时同时 `< next`）。不要碰复现测试。CI 🔴 → 🟢。
- **GLM（复测）**：复跑 `cd client && npx vitest run src/pages/Project/Detail/helpers.test.ts` 确认转绿、测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）

- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
