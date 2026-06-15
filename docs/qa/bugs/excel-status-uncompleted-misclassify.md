# [BUG] Excel 导入「未完成」被误判为 COMPLETED（子串「完成」匹配过宽，方向相反的数据污染）

- 严重度：P0（未完成任务被标成已完成 → 进度统计/风险引擎/排期全线污染；方向相反，比 #73 更严重）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：excelActivityParser（Excel 批量导入 → `parseStatus`）
- 关联：#73 同函数；Claude 修 #73 时按纪律未夹带本缺陷，独立复现。

## 复现步骤

`server/src/utils/excelActivityParser.ts:78-87` 的 `parseStatus`，COMPLETED 分支排最前且用子串匹配：

```ts
function parseStatus(raw: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/已完成|完成/.test(s)) return 'COMPLETED';   // ← 「未完成」含子串「完成」→ 命中
  if (/进行中|进行/.test(s)) return 'IN_PROGRESS';
  ...
}
```

在 Excel「状态」列填 `未完成` 的活动导入时：
- `parseStatus("未完成")` → `/已完成|完成/.test("未完成")` 为 `true`（"未完成" 含 "完成"）→ 返回 `'COMPLETED'`。

但「未完成」字面语义 = 未完成，**绝不应是 COMPLETED**。

## 期望行为

`parseStatus("未完成")` **不得**返回 `'COMPLETED'`（明确不变量）。

> 关于目标状态：`specs/project-spec.md:661` 的状态映射表只定义 `已完成→COMPLETED`、`进行中→IN_PROGRESS`、`未开始→NOT_STARTED`，「未完成」非法定输入、无定义目标状态。故本报告只断言**不变量**「≠ COMPLETED」，不规定具体落点（修法收敛 `完成` 匹配后会落到 `undefined` 或其它非 COMPLETED 值，均满足）。

## 实际行为

`parseStatus("未完成")` → `'COMPLETED'`。

## 影响面（为什么是 P0）

- Excel 批量导入（IMP 模块）是高频用户场景。用户在「状态」列写 `未完成` 的活动，导入后变成「已完成」。
- **方向相反**：未完成被标成已完成 → 进度统计虚高、风险引擎（`riskEngine.ts` 的延期率/逾期任务因子按 `COMPLETED` 排除）漏报、排期重排（`reschedule` 跳过 `COMPLETED`）把这些活动错误排除。
- 相比 #73（「已开始」漏判成 NOT_STARTED，只是状态偏保守），本 bug 把活动推向「已完成」的虚假终点，污染更严重 → P0。
- 与 #73 同根因（`parseStatus` 子串匹配过宽），但缺陷位置与修法不同（这里是 COMPLETED 分支的 `完成` 子串）。

## 失败测试（交接契约）

- 路径：`server/src/utils/excelActivityParser.test.ts`
  - `describe`：`Status Mapping`
  - 用例：`GLM QA bug repro #4: "未完成" 不得被误判为 COMPLETED（含子串「完成」但语义相反）`
- 运行命令：

```bash
cd server && npx vitest run src/utils/excelActivityParser.test.ts -t "GLM QA bug repro #4"
```

- 当前失败输出（关键片段）：

```
 FAIL  src/utils/excelActivityParser.test.ts > Status Mapping > GLM QA bug repro #4: "未完成" 不得被误判为 COMPLETED（含子串「完成」但语义相反）
AssertionError: expected 'COMPLETED' not to be 'COMPLETED' // Object.is equality

 Test Files  1 failed (1)
      Tests  1 failed | 59 skipped (60)
```

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `server/src/utils/excelActivityParser.ts` 的 `parseStatus`，让测试自然变绿（COMPLETED 分支不再误命中「未完成」）。建议把 `/已完成|完成/` 收敛为 `/^已完成$|^(已)?完成$/` 或显式排除前缀 `未`（如 `/(?<!未)完成|^已完成/`），同时回归确认「已完成」「完成」仍正常 → COMPLETED。**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。注意：#73 的修复（加了「已开始」）与本缺陷互不冲突，二者可并存。
- **GLM（复测）**：复跑 `cd server && npx vitest run src/utils/excelActivityParser.test.ts` 确认全绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）

- [x] 同一测试已转绿，且测试本身未被修改
- 验证命令输出（2026-06-15 复测，Claude 修复提交 `9bbd4cf1`）：

```
cd server && npx vitest run src/utils/excelActivityParser.test.ts
 Test Files  1 passed (1)
      Tests  60 passed (60)
```

- 反作弊：`git diff 65974fce..HEAD -- server/src/utils/excelActivityParser.test.ts` 为空（复现测试零改动）；Claude 提交 `9bbd4cf1` 仅改动 `server/src/utils/excelActivityParser.ts`（1 行，源码，无任何 `.test` 文件）。✅ 已 `gh pr ready`。
- 修法确认：`parseStatus` 的 COMPLETED 匹配收紧为「含 `完成` 且排除 `未完成`」→「已完成」「完成」仍 COMPLETED，「未完成」落 undefined（不再误判）。与本 PR 不变量断言一致。
- 合并提醒：本 PR 与 #73 改的是 `parseStatus` **不同行**（#73 动 IN_PROGRESS 行加「已开始」、本 PR 动 COMPLETED 行排除「未完成」），互补可共存；二者都合入后建议再跑一次 `npx vitest run src/utils/excelActivityParser.test.ts` 确认复合无碍（两条用例都应过）。
