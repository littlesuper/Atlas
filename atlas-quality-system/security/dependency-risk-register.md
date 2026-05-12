# 依赖风险登记表

> 用途：记录无法立即通过安全升级消除的依赖风险，避免在 `npm audit --audit-level=high` 通过后遗忘中低危残留。

## 当前状态

| 更新时间 | high/critical | moderate | 当前门禁 |
| --- | ---: | ---: | --- |
| 2026-05-05 | 0 | 2 | CI 阻断 `npm audit --audit-level=high` |

## 风险项

| ID | 依赖链 | 严重级别 | 状态 | 处置决策 | 后续动作 |
| --- | --- | --- | --- | --- | --- |
| DEP-001 | `exceljs@4.4.0 -> uuid@8.3.2` | moderate | ACCEPTED_TEMPORARILY | 不执行 `npm audit fix --force`，因为它会降级到 `exceljs@3.4.0`，属于破坏性回退。当前 Excel 导入/导出依赖 ExcelJS，且 high/critical 已清零。 | 每周由 Dependabot 跟踪 ExcelJS/uuid 上游修复；若 30 天内无修复，评估替代导出库或局部隔离 Excel 生成路径。 |

## 已解除风险

| 日期 | 依赖 | 原风险 | 解除方式 |
| --- | --- | --- | --- |
| 2026-05-05 | `xlsx` | high，SheetJS 社区版无 npm audit 可用修复 | 移除依赖；活动导入改用 ExcelJS 解析 `.xlsx`；legacy `.xls` 上传改为拒绝并提示另存为 `.xlsx` |
| 2026-05-05 | `axios` | high/moderate advisories | 升级到 `^1.16.0` |
| 2026-05-05 | `dompurify` | moderate XSS advisories | 升级到 `^3.4.2` |
| 2026-05-05 | `vite` | high dev server advisories | 升级到 `^7.3.2` |
| 2026-05-05 | `express-rate-limit` | high IPv4-mapped IPv6 bypass | 升级到 `^8.5.0` |
| 2026-05-05 | `prisma` / `@prisma/client` | high transitive `effect` advisory | 升级到 `^6.19.3` |

## 复查命令

```bash
npm audit --audit-level=high
npm audit --json
```
