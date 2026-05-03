# Atlas 质量保障知识库

本目录是 Atlas 团队质量保障体系的知识库入口。它把需求、提示词、检查清单、CI 门禁、上线、回滚和事故处理串成一条业务团队能执行的路径。

## 适用对象

| 角色 | 先看什么 | 目标 |
| --- | --- | --- |
| 业务开发人员 | `atlas-quality-handbook.md` | 知道每个需求从想法到上线要留下哪些证据 |
| AI 代码守护人 | `atlas-quality-handbook.md` + `video-tutorial-scripts.md` | 能辅导业务同学、审查 PR、处理质量风险 |
| 业务负责人 | `atlas-quality-handbook.md` 的质量门禁和上线章节 | 判断是否可以发布、是否需要延期 |
| 新加入成员 | 本 README + 小白手册 | 半天内理解 Atlas 的质量协作方式 |

## 快捷入口

| 主题 | 入口 |
| --- | --- |
| 14 步 AI 协作开发流程 | `../process/atlas-ai-development-workflow.md` |
| 需求模板 | `../requirements/REQUIREMENT_TEMPLATE.md` |
| 7 个标准 AI 提示词 | `../prompts/README.md` |
| 日常/提交/上线/事故/月审检查清单 | `../checklists/README.md` |
| CI/CD 和 required checks | `../qa/ci-cd-baseline.md` |
| 核心模块测试目标 | `../qa/core-modules-test-targets.md` |
| E2E 核心旅程 | `../qa/e2e-core-journeys.md` |
| Feature Flag | `../qa/feature-flags.md` |
| 灰度发布 | `../qa/canary-release-runbook.md` |
| 回滚 | `../qa/rollback-runbook.md` |
| 事故响应 | `../qa/incident-response.md` |
| 第一次月度审计 | `../qa/reports/monthly-quality-audit-202605.md` |
| Week 8 团队质量回顾会 | `../process/week8-day4-quality-review.md` |

## 知识库维护规则

1. 新增质量流程时,先更新对应源文档,再从本目录补入口。
2. 发现提示词或检查清单不好用时,记录到 `../process/week3-day3-4-template-prompt-trial.md` 或流程变更台账。
3. 月度审计后的长期问题,进入 `../qa/reports/` 对应报告,不要只留在聊天记录里。
4. 外部 Wiki 可以引用本目录,但仓库文档仍作为质量体系的单一事实来源。
5. 涉及密钥、生产配置、数据库迁移、真实用户数据或已部署服务影响的内容,只记录流程和负责人,不记录密钥值或生产敏感细节。
