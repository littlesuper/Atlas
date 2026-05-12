# Week 8 确认回填

> 用途：当团队完成 Week 8 人工确认事项后，将确认结论回填为可归档的 `WEEK8_HANDOFF_PACK / CONFIRMED` JSON。

## 适用时机

仅在以下事项已经真实完成后使用：

1. 质量回顾会已经实际召开或明确书面确认。
2. 分支保护、PR 审查规则、rebase/merge 策略已有负责人和决策。
3. 下一季度质量目标、owner 和节奏已经被团队确认。

如果上述事项尚未完成，应继续使用：

```bash
npm run quality:handoff-pack --workspace=server
```

该命令会保留 `ACTION_REQUIRED` 状态，避免把人工确认事项误标为完成。

## 回填命令

```bash
npm run quality:handoff-confirm --workspace=server -- \
  --confirm "质量回顾会实会确认|AI 代码守护人|2026-05-08|确认 Week 8 action tracker 和季度目标" \
  --confirm "分支保护和 PR 审查规则|产品负责人|2026-05-10|由仓库管理员落地 GitHub Settings" \
  --confirm "rebase/merge 策略|release owner|2026-05-08|确认 main 落后 61 个提交的收口策略"
```

每个 `--confirm` 的格式为：

```text
topic|owner|confirmedAt|decision
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `topic` | 被确认的事项 |
| `owner` | 对该确认负责的人或角色 |
| `confirmedAt` | 确认日期，建议使用 `YYYY-MM-DD` |
| `decision` | 确认结论或执行决策 |

## 输出判定

当所有确认项都具备 topic、owner、confirmedAt 和 decision 时，命令输出：

```text
WEEK8_HANDOFF_PACK / CONFIRMED
```

如果缺失确认值、传入格式错误或确认项为空，命令会失败，不能作为 Week 8 归档证据。

## 归档建议

确认命令通过后，将输出 JSON 贴入质量回顾会纪要或月度质量审计附件，并同步更新：

1. `PROJECT_PROGRESS.md` 的 Week 8 状态。
2. `docs/16-质量行动项跟踪.md` 中对应行动项的状态。
3. 下一季度质量计划中的 owner 和目标日期。
