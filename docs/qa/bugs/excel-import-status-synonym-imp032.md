# [BUG] Excel 导入状态同义词「已开始」漏判（IMP-032），活动以错误状态入库

- 严重度：P1（IMP-032 为 test-plan P1 业务用例；影响导入数据正确性）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：excelActivityParser（Excel 批量导入 → `parseStatus`）

## 复现步骤

`server/src/utils/excelActivityParser.ts:78-87` 的 `parseStatus` 用正则按顺序匹配中文状态：

```ts
function parseStatus(raw: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/已完成|完成/.test(s)) return 'COMPLETED';
  if (/进行中|进行/.test(s)) return 'IN_PROGRESS';
  if (/未开始|未启动/.test(s)) return 'NOT_STARTED';
  if (/暂停|挂起/.test(s)) return 'ON_HOLD';
  if (/已取消|取消/.test(s)) return 'CANCELLED';
  return undefined;
}
```

test-plan **IMP-032**（P1 业务）明确规定：`"进行中" / "已开始" / "进行"` 均应映射到 `IN_PROGRESS`。但 `"已开始"` 不含 `进行中` 也不含 `进行` → 上述正则全部不命中 → 返回 `undefined`。`undefined` 的活动在导入路由侧会以默认状态（NOT_STARTED）入库，与导入者本意（已开始/进行中）相反。

## 期望行为

`parseStatus("已开始")` → `'IN_PROGRESS'`（IMP-032 spec）。

## 实际行为

`parseStatus("已开始")` → `undefined`（活动以 NOT_STARTED 入库）。

## 关联的更严重隐患（同函数，建议一并处理）

`parseStatus("未完成")` → 命中 `/已完成|完成/`（"未完成" 含子串 "完成"）→ 错误返回 `'COMPLETED'`。
即「未完成」会被当成「已完成」入库——数据污染方向相反、更严重。根因是 `完成` 作为子串匹配过于宽泛。本 PR 的失败测试只断言 IMP-032（已开始），但修复时建议同时收敛 `完成` 的匹配（如要求 `已完成` 或加边界/排除 `未完成`），避免遗留该隐患。

## 失败测试（交接契约）

- 路径：`server/src/utils/excelActivityParser.test.ts`
  - `describe`：`Status Mapping`
  - 用例：`IMP-032 (GLM QA bug repro #3): maps "已开始" → "IN_PROGRESS"（spec 同义词，当前漏判为 undefined）`
- 运行命令：

```bash
cd server && npx vitest run src/utils/excelActivityParser.test.ts -t "GLM QA bug repro #3"
```

- 当前失败输出（关键片段）：

```
 FAIL  src/utils/excelActivityParser.test.ts > Status Mapping > IMP-032 (GLM QA bug repro #3): maps "已开始" → "IN_PROGRESS"（spec 同义词，当前漏判为 undefined）
- Expected: "IN_PROGRESS"
+ Received: undefined

 ❯ src/utils/excelActivityParser.test.ts:238:30

 Test Files  1 failed (1)
      Tests  1 failed | 59 skipped (60)
```

## 影响面

- Excel 批量导入（IMP 模块，58 条 test-plan 用例）是高频用户场景。
- 用户在「状态」列填 `已开始` 的活动，导入后变成「未开始」——与实际进度不符，后续排期/进度统计/风险引擎均受污染。
- 若用户填 `未完成`（关联隐患），则被当成「已完成」——污染方向更严重。

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `server/src/utils/excelActivityParser.ts` 的 `parseStatus` 让测试自然变绿（把 `已开始` 纳入 `IN_PROGRESS`）。**建议**同时收敛 `完成` 的子串匹配以排除 `未完成`→COMPLETED 的隐患（可选，但强烈建议）。**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑 `cd server && npx vitest run src/utils/excelActivityParser.test.ts` 确认全绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）

- [x] 同一测试已转绿，且测试本身未被修改
- 验证命令输出（2026-06-15 复测，Claude 修复提交 `c8d80d43`）：

```
cd server && npx vitest run src/utils/excelActivityParser.test.ts
 Test Files  1 passed (1)
      Tests  60 passed (60)
```

- 反作弊：`git diff c3aac7fc..HEAD -- server/src/utils/excelActivityParser.test.ts` 为空（复现测试零改动）；Claude 提交 `c8d80d43` 仅改动 `server/src/utils/excelActivityParser.ts`（1 行，源码，无任何 `.test` 文件）。✅ 已 `gh pr ready`。
- 注：Claude 仅修了「已开始」同义词（IMP-032），**未**触碰 `完成` 子串匹配——故本报告提到的「未完成」→COMPLETED 更严重隐患**仍然存在**，已由 GLM 另开独立 PR 复现（见 `docs/qa/bugs/excel-status-uncompleted-misclassify.md`）。
