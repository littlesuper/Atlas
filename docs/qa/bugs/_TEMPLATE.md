# [BUG] <一句话标题>

- 严重度：P0 / P1 / P2 / P3（定义见 `docs/qa/test-plan.md`）
- 发现者：GLM QA
- 日期：<YYYY-MM-DD>
- 模块：<如 WeeklyReports / scheduleEngine / auth>

## 复现步骤
1. ...
2. ...

## 期望行为
...

## 实际行为
...

## 失败测试（交接契约）
- 路径：`<path/to/xxx.test.ts>`
- 运行命令：`<命令>`
- 当前失败输出（关键片段）：

```
<粘贴 FAIL 输出>
```

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：只改源码让测试自然变绿；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
