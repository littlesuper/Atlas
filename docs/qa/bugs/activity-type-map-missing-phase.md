# [BUG] 前端活动类型映射 ACTIVITY_TYPE_MAP 缺 PHASE（下拉无选项 + 显示原始英文）

- 严重度：P1（schema 一等公民类型 PHASE 在前端无法新建/选择、且渲染为原始英文；影响排期/导入的往返一致性）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：client/utils/constants.ts（ACTIVITY_TYPE_MAP）

## 复现步骤

`server/prisma/schema.prisma:186` 的 `enum ActivityType { TASK MILESTONE PHASE }` 含 **PHASE**；后端 `excelActivityParser.parseType`、`scheduleEngine` 的 `ActivitySnapshotType`、activities 路由测试 mock 都认 PHASE。但前端 `client/src/utils/constants.ts:62` 的 `ACTIVITY_TYPE_MAP` 只有 `MILESTONE` 和 `TASK`，**缺 PHASE**。

该表在前端被两处模式消费：

1. **类型下拉（遍历 Object.entries）**：`pages/Project/Detail/ActivityDrawer.tsx:440`（新建/编辑活动的「类型」选择器）、`hooks/useActivityColumns.tsx:535`（类型筛选）、`pages/Admin/TemplateManagement.tsx:488`（模板）。遍历 ACTIVITY_TYPE_MAP → 下拉**只有 TASK/MILESTONE，无 PHASE** → 用户无法经 UI 新建/选择 PHASE 活动。
2. **类型渲染（按 key 查表）**：`hooks/useActivityColumns.tsx:543` `ACTIVITY_TYPE_MAP[record.type] ?? { label: record.type, color: 'default' }`。PHASE 活动查不到 → 回落 `{ label: record.type }` → 表格里显示**原始英文 'PHASE'**，而非中文「阶段」。

## 期望行为

`ACTIVITY_TYPE_MAP` 包含 `PHASE`（label 如「阶段」，color 为合法 badgeColor），使下拉提供 PHASE 选项、PHASE 活动显示中文标签。与 schema 枚举 / 后端解析保持往返一致。

## 实际行为

`ACTIVITY_TYPE_MAP` 无 `PHASE` 键 → 上述两处 UI 行为异常。

## 失败测试（交接契约）

- 路径：`client/src/utils/constants.test.ts`
  - `describe`：`ACTIVITY_TYPE_MAP`
  - 用例：`GLM QA bug repro #8: 应包含 PHASE（schema ActivityType 枚举含 PHASE，当前缺失）`
- 运行命令：

```bash
cd client && npx vitest run src/utils/constants.test.ts -t "GLM QA bug repro #8"
```

- 当前失败输出（关键片段）：

```
 FAIL  src/utils/constants.test.ts > ACTIVITY_TYPE_MAP > GLM QA bug repro #8: 应包含 PHASE（...）
AssertionError: expected { …(2) } to have property "PHASE"

 Tests  1 failed | 1719 skipped (1720)
```

## ⚠️ 锁 bug 的旧测试（需一并更正，归 GLM）

同文件 `constants.test.ts:151-155` 有一条 **PRE-EXISTING 特征测试**把缺陷当期望锁死：

```ts
it('包含 MILESTONE、TASK 两种类型', () => {
  expect(Object.keys(ACTIVITY_TYPE_MAP)).toHaveLength(2);   // ← 锁死 2 种
  ...
});
```

Claude 修复（加 PHASE）后这条 `toHaveLength(2)` 会失败。**GLM 在复测转正阶段会将其更正为 `toHaveLength(3)` 并补 PHASE 断言**（属 README §3「测试本身过时断言」修复，与本复现用例不同）。本 PR 只新增复现用例，不动该锁。

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `client/src/utils/constants.ts` 的 `ACTIVITY_TYPE_MAP`，补 `PHASE` 条目（label 建议「阶段」，color 任选合法 badgeColor 如 `purple`/`cyan`；不要碰复现测试、不要碰锁测试——锁测试由 GLM 复测时更正）。CI 🔴 → 🟢。
- **GLM（复测）**：复跑 `cd client && npx vitest run src/utils/constants.test.ts` 确认本复现用例转绿、且未被改动；同时把 `toHaveLength(2)` 锁更正为 `toHaveLength(3)`（+ PHASE 断言），全量绿后 `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）

- [x] 同一测试已转绿，且复现测试本身未被修改
- 验证命令输出（2026-06-15 复测，Claude 修复提交 `04d0ea99`）：

```
cd client && npx vitest run src/utils/constants.test.ts
 Test Files  1 passed (1)
      Tests  1721 passed (1721)
```

- 反作弊：Claude 提交 `04d0ea99` 仅改动 `client/src/utils/constants.ts`（+4 行源码，补 PHASE=阶段/cyan）；GLM 复现用例（`GLM QA bug repro #8`）零改动（`git diff d923b962..HEAD -- constants.test.ts` 在 GLM 更正前为空）。✅ 已 `gh pr ready`。
- 附带更正（GLM，按交接指令）：同文件 `constants.test.ts:151` 的 PRE-EXISTING 锁测试 `toHaveLength(2)` 已更正为 `toHaveLength(3)`（+ PHASE 断言），属 README §3「源码契约变更后的过时锁测试」修复，非复现用例。全量 1721 绿。
