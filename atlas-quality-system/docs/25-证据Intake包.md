# 证据 Intake 包

> 用途：当负责人回填真实证据后，检查三项 Week 8 人工证据是否齐全，并生成下一步确认和最终收口命令。

## 默认命令

```bash
npm run quality:evidence-intake --workspace=server
```

默认会检查以下 required topics：

| 主题 | 证据来源 |
| --- | --- |
| 质量回顾会实会确认 | `quality-review-minutes#2026-05-08` |
| 分支保护和 PR 审查规则 | `github-settings#branch-protection` |
| rebase/merge 策略 | `release-notes#merge-plan` |

未传入证据时输出 `QUALITY_EVIDENCE_INTAKE / ACTION_REQUIRED`。

## 收齐证据后运行

```bash
npm run quality:evidence-intake --workspace=server -- \
  --confirm "质量回顾会实会确认|AI 代码守护人|2026-05-08|确认 Week 8 action tracker 和季度目标|quality-review-minutes#2026-05-08" \
  --confirm "分支保护和 PR 审查规则|产品负责人|2026-05-10|由仓库管理员落地 GitHub Settings|github-settings#branch-protection" \
  --confirm "rebase/merge 策略|release owner|2026-05-08|确认 main 落后 61 个提交的收口策略|release-notes#merge-plan"
```

进入 evidence intake 前，先运行 `quality:closure-request-pack` 生成 owner 请求文本；该步骤对应 `QUALITY_CLOSURE_REQUEST_PACK / READY` 或 owner 请求已发出并回填。

通过时输出 `READY_TO_CONFIRM`，并给出：

1. `quality:team-confirmations` 命令。
2. `quality:final-closure` 命令，包含 `QUALITY_BLOCKER_RESOLUTION / RESOLVED`、`QUALITY_CLOSURE_EVIDENCE_HANDOFF / READY`、`QUALITY_CLOSURE_REMAINING_WORK / READY` 和 `QUALITY_CLOSURE_REQUEST_PACK / READY` artifact。

## 使用顺序

1. 运行 `quality:owner-assignments` 分派 owner。
2. 运行 `quality:closure-request-pack` 生成 owner 请求文本。
3. owner 按消息回填证据。
4. 运行 `quality:evidence-intake` 检查证据是否齐全。
5. 按 `nextCommands` 运行团队确认和最终收口。
