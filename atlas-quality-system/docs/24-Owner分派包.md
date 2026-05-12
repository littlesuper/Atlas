# Owner 分派包

> 用途：把 `quality:blocker-register` 中的 open 阻塞项按 owner 拆分，生成可以直接发给负责人的执行消息。

## 生成命令

```bash
npm run quality:owner-assignments --workspace=server
```

默认输出 `QUALITY_OWNER_ASSIGNMENT_PACK` JSON，包含：

| 字段 | 含义 |
| --- | --- |
| `assignments[].owner` | 负责人 |
| `assignments[].items` | 该负责人名下的 open 阻塞项 |
| `assignments[].evidenceRefs` | 完成后必须回填的证据引用 |
| `assignments[].message` | 可直接发给负责人的短消息 |

## 当前默认分派

| Owner | 阻塞项 | 证据 |
| --- | --- | --- |
| AI 代码守护人 | 质量回顾会实会确认 | `quality-review-minutes#2026-05-08` |
| 产品负责人 | 分支保护和 PR 审查规则 | `github-settings#branch-protection` |
| release owner | rebase/merge 策略 | `release-notes#merge-plan` |

## 使用方式

1. 运行 `quality:owner-assignments` 获取 owner 消息。
2. 将 `message` 发给对应负责人。
3. 负责人完成后，将证据引用回填到 `quality:team-confirmations`。
4. 所有证据齐备后，再运行 `quality:final-closure`。

## 输出判定

- `ACTION_REQUIRED`：存在 open 阻塞项，已生成 owner 分派消息。
- `READY`：没有 open 阻塞项需要分派。
