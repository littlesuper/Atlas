# Week 8 团队交接包

> 用途：把 Week 8 最后需要人工确认的事项从技术资产中拆出来，形成 owner、截止日期和决策点明确的交接清单。

## 生成命令

```bash
npm run quality:handoff-pack --workspace=server
```

该命令输出 `WEEK8_HANDOFF_PACK` JSON：

- `CONFIRMED`：所有交接项已确认。
- `ACTION_REQUIRED`：存在待确认或被阻塞事项。
- `BLOCKED`：交接项缺 owner 或截止日期。

## 当前交接项

| 事项 | Owner | 截止 | 状态 | 决策点 |
| --- | --- | --- | --- | --- |
| 质量回顾会实会确认 | AI 代码守护人 | 2026-05-08 | PENDING | 确认 Week 8 action tracker、closure gate 和季度质量目标 |
| 分支保护和 PR 审查规则 | 产品负责人 | 2026-05-10 | BLOCKED | 确认仓库管理员执行人并落地 GitHub Settings |
| rebase/merge 策略 | release owner | 2026-05-08 | PENDING | 确认 main 落后 61 个提交的收口策略 |

## 当前阻塞

| 事项 | 阻塞原因 |
| --- | --- |
| 分支保护和 PR 审查规则 | 需要仓库管理员权限 |

## 收口规则

1. 每个交接项必须有 owner 和 dueDate。
2. `BLOCKED` 项必须写明阻塞原因。
3. 团队确认后，将状态改为 `CONFIRMED` 并重新运行交接包。
4. 只有交接包 `CONFIRMED` 且 closure gate `READY_TO_CLOSE`，Week 8 才能标记完成。
