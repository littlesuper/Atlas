# Atlas AI 协作开发 14 步工作流

本文档把质量体系中的 14 步标准流程落到 Atlas 当前技术栈：React 18、Express、Prisma、Vitest、Playwright、GitHub required checks。

## 适用范围

- 新功能、新页面、新 API、权限规则、数据模型调整。
- 影响已有业务行为的 bug fix。
- 上线前必须可追溯的配置或流程变更。

纯文案、注释、无行为影响的文档变更可以走简化流程，但仍要通过 PR 和 CI。

## 标准流程

| 步骤 | 动作 | Atlas 产物 | 通过标准 |
| --- | --- | --- | --- |
| 1 | 需求结构化 | `docs/requirements/REQ-XXX-*.md` | 需求模板字段完整，无"待定" |
| 2 | 需求审查 | AI 需求审查记录 | 无阻断级问题，重要问题已有明确回答 |
| 3 | 定义验收标准 | Gherkin 场景写入需求文档 | 每条验收标准都能转成自动化测试 |
| 4 | 建分支和任务边界 | `codex/<topic>` 或团队约定分支 | 只包含本需求范围 |
| 5 | 生成或修改代码 | 前端、后端、Prisma、测试相关文件 | 遵守 Atlas 架构约束 |
| 6 | 生成测试 | Vitest / Playwright / Supertest 测试 | 覆盖正常、异常、权限、边界场景 |
| 7 | AI 自审 | AI 代码审查记录 | 无安全、权限、数据破坏类阻断问题 |
| 8 | 本地验证 | 命令输出或截图 | 相关 lint、test、build 通过 |
| 9 | 提交 PR | GitHub PR | 描述包含需求、测试、风险 |
| 10 | 处理 CI 反馈 | PR checks | `lint`、`security`、`test`、`e2e-core` 通过 |
| 11 | 等待人审 | Review comment / approval | 至少 1 个 approval |
| 12 | 合并与部署到验证环境 | merge commit / deployment record | 无未处理失败告警 |
| 13 | Staging 验证 | 验证记录 | 按验收场景验证通过 |
| 14 | 上线后观察 | 监控/日志/反馈记录 | 24 小时内无新增高危问题 |

## Atlas 本地验证命令

按改动范围选择最小但足够的验证集。

```bash
npm run lint
npm run audit
npm run build

cd server && npm test
cd client && npm test
npx playwright test --project=setup --project=chromium
```

涉及 Prisma schema、seed 或数据库行为时，额外验证：

```bash
cd server
npx prisma generate
npx prisma db push --schema prisma/schema.prisma
npx tsx prisma/seed.ts
```

## 强制暂停点

出现以下任一情况，不继续让 AI 自行决定：

- 需要新增、读取、修改密钥或生产配置。
- 需要数据库迁移、数据修复、生产数据删除或回滚。
- 需求会改变权限、角色、审计、登录、企业微信、AI 配置等高风险行为。
- PR 会影响已部署服务、发布流程、分支保护或 required checks。
- 模板说明与 Atlas 实际技术栈冲突。

## 小修复简化流程

小修复可以压缩为 7 步：

1. 写清问题和期望行为。
2. 定义一个可验证场景。
3. 修改代码。
4. 补或更新测试。
5. AI 自审。
6. 本地验证。
7. PR + CI + review。

简化流程不能跳过权限、安全、数据库、生产影响判断。

## PR 描述模板

```markdown
## 需求/问题
-

## 改动
-

## 验证
- [ ] 本地验证命令：
- [ ] GitHub required checks：

## 风险
-

## 上线/回滚
-
```
