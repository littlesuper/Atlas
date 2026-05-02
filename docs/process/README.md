# Atlas AI 协作开发流程

本目录记录 Week 3 "开发流程"落地材料。目标是让业务团队按同一套流程与 AI 协作，而不是每个需求都临时发挥。

## 文档清单

| 文件 | 用途 |
| --- | --- |
| `atlas-ai-development-workflow.md` | Atlas 版 14 步 AI 协作开发流程 |
| `week3-day1-2-training.md` | Week 3 Day 1-2 流程培训执行包与实战记录模板 |
| `week3-day3-4-template-prompt-trial.md` | Week 3 Day 3-4 需求模板与提示词试用记录 |
| `week3-day5-retrospective.md` | Week 3 Day 5 第一次流程回顾执行表 |
| `process-change-log.md` | AI 协作开发流程变更台账 |
| `week3-acceptance.md` | Week 3 仓库侧验收与待业务确认事项 |

## 使用原则

1. 新需求先写清楚，再让 AI 写代码。
2. 需求、提示词、检查清单三件套必须一起用。
3. 每个阶段都要留下可追溯产物：需求文档、验收场景、测试、PR、CI 结果、上线验证。
4. 小修复可以走简化流程，但不能跳过测试和 PR 门禁。
5. 遇到密钥、生产配置、数据库迁移、已部署服务影响时，必须暂停并让 AI 代码守护人确认。

## 相关入口

- 需求模板：`docs/requirements/REQUIREMENT_TEMPLATE.md`
- 需求文档目录：`docs/requirements/`
- 提示词库：`docs/prompts/`
- 质量检查清单：`docs/checklists/`
- 流程变更台账：`docs/process/process-change-log.md`
