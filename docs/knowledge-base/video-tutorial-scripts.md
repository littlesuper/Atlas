# Atlas 关键流程视频教程脚本

ROADMAP 要求录制关键流程视频。本文件先沉淀可直接录制的脚本、画面顺序和检查点;实际录制需要由团队在本地或会议工具中完成。

## 视频 1: 从需求到 PR

**目标时长**: 8-10 分钟

**适合观众**: 第一次用 AI 做 Atlas 需求的业务同学

**画面顺序**
1. 打开 `docs/requirements/REQUIREMENT_TEMPLATE.md`。
2. 填写一个小需求的目标、角色、验收标准。
3. 打开 `docs/prompts/01-需求澄清提示词.md`,演示如何让 AI 找缺口。
4. 打开 `docs/prompts/02-代码生成提示词.md`,强调要贴 CLAUDE.md、需求、相关代码。
5. 展示 PR 描述里必须写:改了什么、验证了什么、风险是什么。

**必须讲清楚**
- 需求没澄清完不要写代码。
- AI 的输出不能直接合并,必须进入审查和测试。
- 遇到密钥、生产配置、数据库迁移要暂停。

## 视频 2: PR 前自检和 AI 代码审查

**目标时长**: 6-8 分钟

**适合观众**: 已经能让 AI 改代码,但不熟悉质量门禁的同学

**画面顺序**
1. 打开 `docs/checklists/提交代码前检查清单.md`。
2. 展示 `docs/prompts/03-代码审查提示词.md`。
3. 演示如何把 diff、测试结果、CLAUDE.md 片段给 AI 审查。
4. 展示 GitHub required checks: `lint`、`security`、`test`、`e2e-core`。

**必须讲清楚**
- 红色/橙色问题不能靠感觉忽略。
- 文档 PR 也要等 required checks。
- E2E 慢是已知成本,不要因为慢就绕过。

## 视频 3: Bug 诊断和防回归

**目标时长**: 8-12 分钟

**适合观众**: 需要处理测试失败、线上反馈或 E2E flaky 的同学

**画面顺序**
1. 打开 `docs/prompts/05-Bug诊断提示词.md`。
2. 展示需要收集的信息:复现步骤、账号角色、Console、Network、requestId、日志。
3. 演示先写失败测试,再修复。
4. 展示修复后如何跑相关 Vitest/Supertest/Playwright。

**必须讲清楚**
- 不要“改一下试试”。
- 没有复现测试的修复很容易回归。
- 生产问题先止血,再根因修复。

## 视频 4: 上线、灰度和回滚

**目标时长**: 10-15 分钟

**适合观众**: 业务负责人、AI 代码守护人、发布执行人

**画面顺序**
1. 打开 `docs/checklists/上线前检查清单.md`。
2. 打开 `docs/prompts/07-上线前检查提示词.md`。
3. 展示 `docs/qa/canary-release-runbook.md` 和 `docs/qa/rollback-runbook.md`。
4. 展示 `docs/qa/feature-flags.md` 和 `docs/qa/degradation-switches.md`。
5. 展示 `docs/qa/incident-response.md`。

**必须讲清楚**
- 上线不是 PR 合并的同义词。
- 没有回滚标准就不要发布高风险改动。
- 没有真实配置证据时,Sentry、告警、Unleash 都只能记为缺口。

## 录制完成后的归档信息

| 视频 | 录制人 | 日期 | 存放位置 | 是否已给新成员试用 |
| --- | --- | --- | --- | --- |
| 从需求到 PR | 待定 | 待定 | 待定 | 否 |
| PR 前自检和 AI 代码审查 | 待定 | 待定 | 待定 | 否 |
| Bug 诊断和防回归 | 待定 | 待定 | 待定 | 否 |
| 上线、灰度和回滚 | 待定 | 待定 | 待定 | 否 |

