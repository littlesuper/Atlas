# Week 8 收口门禁

> 用途：把 Week 8 体系巩固的关键产物汇总成最终收口判断，避免在行动项未闭环时误判完成。

## 生成命令

```bash
npm run quality:closure-gate --workspace=server
```

该命令输出 `WEEK8_CLOSURE_GATE` JSON：

- `READY_TO_CLOSE`：所有门禁均为 `READY/PASSED/DONE/RESOLVED/READY_TO_CONFIRM/CONFIRMED/READY_TO_ARCHIVE`。
- `ACTION_REQUIRED`：存在仍需行动的门禁，但没有硬阻断。
- `BLOCKED`：存在硬阻断，不应推进收口。

## 当前门禁

| 门禁 | 状态 | 说明 |
| --- | --- | --- |
| monthly audit run | ACTION_REQUIRED | main 分支漂移、团队流程确认、中危依赖风险 |
| quality action tracker | ACTION_REQUIRED | 2 个 open 行动项，1 个仓库管理员权限阻塞 |
| blocker resolution | ACTION_REQUIRED | 3 个人工阻塞项仍需 cleared 或 accepted 判断 |
| closure consistency | READY | 6 个检查面均包含 blocker resolution、evidence handoff 与 remaining work markers |
| closure evidence handoff | READY | 证据包可交接给 evidence intake，并生成包含 handoff artifact 的 final closure 命令 |
| evidence intake | ACTION_REQUIRED | 3 个必需人工证据主题仍需确认 |
| knowledge index | READY | 41 个知识项，30 个命令型资产 |
| quarter plan | READY | Q2 质量路线图已起草 |
| review meeting pack | READY | 议程、决策项、行动项已准备 |

## 收口动作

1. 召开质量回顾会并记录决策。
2. 解决分支保护和 PR 审查规则所需的仓库管理员权限。
3. 在标记 Week 8 完成前确认 rebase/merge 策略。

## 判断原则

Week 8 的完成不是“文档存在”，而是：

- 月度审计有执行记录。
- 回顾会行动项有 owner 和截止日期。
- 阻塞项解决判断、收口一致性、证据交接门禁和剩余工作清单均已通过。
- evidence intake 已收齐三项人工证据。
- 知识库能索引关键文档和命令型资产。
- 下一季度计划有主题、目标、里程碑和成功指标。
- 遗留风险被明确记录并进入跟踪。
