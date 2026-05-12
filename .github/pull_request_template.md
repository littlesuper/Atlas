## 变更摘要

- 

## 影响范围

- [ ] 前端
- [ ] 后端
- [ ] 数据库 / Prisma migration
- [ ] CI/CD / 工具链
- [ ] 文档 / 流程

## 风险检查

- [ ] 不包含 `.env`、本地数据库、日志、上传文件或其他临时产物
- [ ] 不包含硬编码密钥、token、密码或真实敏感数据
- [ ] 涉及用户输入的路径已做 Zod/前端校验或安全转义
- [ ] 涉及权限、认证、数据隔离的改动已说明风险
- [ ] 新增依赖已说明必要性，并通过 `npm audit --audit-level=high`

## 验证命令

- [ ] `npm run lint`
- [ ] `npm run typecheck --workspace=server`
- [ ] `npm test --workspace=server -- roleMembers roleMembershipResolver`
- [ ] `npm test --workspace=server -- excelActivityParser activities performance chaos`
- [ ] `npm test --workspace=client`
- [ ] `npm run build --workspace=client`
- [ ] `npm audit --audit-level=high`
- [ ] `npm run test:e2e:smoke`

## 截图 / 录屏

适用于 UI 变更。非 UI 变更可写 N/A。

## 关联

- Issue / 需求：
- 风险登记：
