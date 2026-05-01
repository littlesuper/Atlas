# Week 3 Acceptance Review

本文件记录 2026-05-01 对 Week 3 "开发流程"的仓库侧验收结果。Week 3 的目标是让团队按统一流程与 AI 协作，本记录只确认代码仓库中可验证的落地内容；团队培训、真实需求试用和口头掌握程度需要业务团队线下补充记录。

## 验收结论

Week 3 的流程材料已经落地：Atlas 版 14 步 AI 协作开发流程、流程培训执行包、需求模板入口、提示词库入口、模板/提示词试用记录、第一次流程回顾执行表和流程变更台账都已经进入仓库。

但 ROADMAP 中有多项验收标准依赖团队实际执行，目前不能仅凭代码仓库证明已经完成。不建议为了进入 Week 4 而把这些项标记为完成；建议把它们作为 Week 4 前置运营事项继续跟踪。

## 验收明细

| 标准 | 状态 | 仓库证据 | 差距 |
| --- | --- | --- | --- |
| 全团队接受过流程培训 | 待业务确认 | `docs/process/week3-day1-2-training.md` 已提供 2 小时培训议程、实战记录表和卡点记录表 | 需要补充参会人、培训日期、真实实战记录 |
| 所有新需求使用需求模板 | 部分达标 | `docs/requirements/REQUIREMENT_TEMPLATE.md` 与 `docs/requirements/README.md` 已落地，流程文档已要求新需求先写需求文档 | 需要在后续真实需求中检查是否全部使用模板 |
| 7 个提示词都被实际使用过 | 待业务确认 | `docs/prompts/` 已包含 7 个标准提示词，`docs/process/week3-day3-4-template-prompt-trial.md` 已提供试用记录表 | 需要补充每个提示词的实际使用场景和反馈 |
| 团队能说出 14 步工作流关键节点 | 待业务确认 | `docs/process/atlas-ai-development-workflow.md` 已定义 Atlas 版 14 步流程 | 需要培训后抽查或复盘记录 |
| 至少 1 个完整需求按新流程从 0 到上线 | 待业务确认 | 流程、需求模板、提示词和复盘表均已准备好 | 需要选择一个真实小需求并记录从需求到上线的证据链 |

## 已落地内容

1. Week 3 Day 1-2: `docs/process/atlas-ai-development-workflow.md` 和 `docs/process/week3-day1-2-training.md`。
2. Week 3 Day 3-4: `docs/requirements/REQUIREMENT_TEMPLATE.md`、`docs/requirements/README.md`、`docs/prompts/` 和 `docs/process/week3-day3-4-template-prompt-trial.md`。
3. Week 3 Day 5: `docs/process/week3-day5-retrospective.md` 和 `docs/process/process-change-log.md`。

## 验证记录

| PR | 内容 | 结果 |
| --- | --- | --- |
| #21 | Week 3 Day 1-2 流程培训材料 | 已合并，required checks 通过 |
| #22 | Week 3 Day 3-4 需求模板与提示词库 | 已合并，required checks 通过 |
| #23 | Week 3 Day 5 流程回顾与变更台账 | 已合并，required checks 通过，main CI 通过 |

## Week 4 前置事项

- 在 `docs/process/week3-day1-2-training.md` 中补充一次真实培训记录。
- 在 `docs/process/week3-day3-4-template-prompt-trial.md` 中补充 7 个提示词的真实使用反馈。
- 在 `docs/process/week3-day5-retrospective.md` 中补充第一次流程回顾结论，并把已决定生效的调整写入 `docs/process/process-change-log.md`。
- 选择一个低风险真实需求，按 `docs/process/atlas-ai-development-workflow.md` 跑完整流程并保留 PR、CI、上线验证证据。

## 是否可以进入 Week 4

从仓库材料角度，可以进入 Week 4 Day 1-2；从 ROADMAP 验收标准角度，Week 3 仍有业务执行项待确认。建议进入 Week 4 时继续保留这些待办，不把它们视为已完成。
