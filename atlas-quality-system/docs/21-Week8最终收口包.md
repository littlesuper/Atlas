# Week 8 最终收口包

> 用途：在 Week 8 归档前，把知识库、阻塞项解决判断、收口一致性、证据交接门禁、剩余工作清单、团队确认、交接回填和收口门禁合并成一份统一 JSON。任何一项不是绿色状态，最终收口包都会保持 `ACTION_REQUIRED`。

归档前应先运行 `quality:closure-request-pack`，确认 `QUALITY_CLOSURE_REQUEST_PACK / READY` 或已将其生成的 owner 请求发出并回填到 evidence intake。

## 默认检查

```bash
npm run quality:final-closure --workspace=server
```

默认检查 9 个归档前证据：

| 证据 | 期望状态 | 默认结果 |
| --- | --- | --- |
| `QUALITY_KNOWLEDGE_INDEX` | `READY` | `READY` |
| `QUALITY_BLOCKER_RESOLUTION` | `RESOLVED` | `ACTION_REQUIRED` |
| `QUALITY_CLOSURE_CONSISTENCY` | `READY` | `ACTION_REQUIRED` |
| `QUALITY_CLOSURE_EVIDENCE_HANDOFF` | `READY` | `ACTION_REQUIRED` |
| `QUALITY_CLOSURE_REMAINING_WORK` | `READY` | `ACTION_REQUIRED` |
| `QUALITY_CLOSURE_REQUEST_PACK` | `READY` | `ACTION_REQUIRED` |
| `TEAM_CONFIRMATION_REGISTER` | `CONFIRMED` | `ACTION_REQUIRED` |
| `WEEK8_HANDOFF_PACK` | `CONFIRMED` | `ACTION_REQUIRED` |
| `WEEK8_CLOSURE_GATE` | `READY_TO_CLOSE` | `ACTION_REQUIRED` |

默认命令会失败退出，因为阻塞项解决判断、收口一致性、证据交接门禁、剩余工作清单、团队确认和最终收口仍需要真实证据。

## 完整归档命令

团队确认完成后，使用实际输出状态和证据引用回填：

```bash
npm run quality:final-closure --workspace=server -- \
  --artifact "knowledge index|QUALITY_KNOWLEDGE_INDEX|READY|npm run quality:knowledge-index --workspace=server" \
  --artifact "blocker resolution|QUALITY_BLOCKER_RESOLUTION|RESOLVED|quality:blocker-resolution" \
  --artifact "closure consistency|QUALITY_CLOSURE_CONSISTENCY|READY|quality:closure-consistency" \
  --artifact "closure evidence handoff|QUALITY_CLOSURE_EVIDENCE_HANDOFF|READY|quality:closure-evidence-handoff" \
  --artifact "closure remaining work|QUALITY_CLOSURE_REMAINING_WORK|READY|quality:closure-remaining-work" \
  --artifact "closure request pack|QUALITY_CLOSURE_REQUEST_PACK|READY|quality:closure-request-pack" \
  --artifact "team confirmations|TEAM_CONFIRMATION_REGISTER|CONFIRMED|quality-review-minutes#2026-05-08" \
  --artifact "handoff confirmation|WEEK8_HANDOFF_PACK|CONFIRMED|npm run quality:handoff-confirm --workspace=server -- --confirm ..." \
  --artifact "closure gate|WEEK8_CLOSURE_GATE|READY_TO_CLOSE|npm run quality:closure-gate --workspace=server" \
  --archive-action "attach final closure JSON to monthly audit" \
  --archive-action "start next-quarter quality cadence"
```

每个 `--artifact` 的格式为：

```text
name|mode|status|evidenceRef
```

## 完成标准

命令只有在所有 artifact 都是绿色状态且都有 `evidenceRef` 时，才输出：

```text
WEEK8_FINAL_CLOSURE / READY_TO_ARCHIVE
```

该输出是 Week 8 可归档的最终机器证据。它不替代团队会议、GitHub 设置或 release owner 决策，只负责检查这些证据是否已被登记。
