# ESLint / Ruff / mypy 适配基线

ROADMAP Week 2 Day 1-2 要求配置 ESLint / Ruff / mypy。Atlas 当前是 React + Express + TypeScript monorepo，没有 Python 应用运行时，因此本阶段只落地 TypeScript/ESLint；Ruff 和 mypy 不适用。

## 当前工具

- `npm run lint`：现有 CI 使用的 ESLint 检查，当前允许 warning。
- `npm run lint -- --quiet`：只检查 error，供 pre-commit 快速阻断明显问题。
- `npm run lint:strict`：零 warning 目标检查，当前用于度量，不接入 required checks。

## 基线快照

快照日期：2026-04-30

生成命令：

```bash
npx eslint . -f json > /tmp/atlas-eslint.json
```

当前结果：

- errors: 0
- warnings: 521
- affected files: 75

按规则统计：

| Rule | Count |
| --- | ---: |
| `@typescript-eslint/no-explicit-any` | 493 |
| `react-hooks/exhaustive-deps` | 19 |
| `@typescript-eslint/no-unused-vars` | 9 |

Top files：

| File | Warnings |
| --- | ---: |
| `server/src/routes/activities.ts` | 42 |
| `server/src/routes/__tests__/performance.test.ts` | 33 |
| `server/src/routes/activities.test.ts` | 28 |
| `server/src/utils/__tests__/chaos.test.ts` | 25 |
| `server/src/routes/weeklyReports.test.ts` | 16 |
| `client/src/api/index.ts` | 15 |
| `server/src/routes/products.test.ts` | 15 |
| `server/src/middleware/__tests__/security.test.ts` | 14 |
| `server/src/routes/activities.import-excel.test.ts` | 14 |
| `server/src/routes/risk.test.ts` | 13 |
| `server/src/routes/roles.test.ts` | 13 |
| `server/src/routes/products.ts` | 12 |

## 执行策略

现阶段不把 `lint:strict` 接入 CI required checks，因为 521 个存量 warning 会立刻阻断所有 PR。当前门禁目标是：

1. 不允许新增 ESLint error。
2. 新写或重构代码尽量不新增 warning。
3. 按模块分批清理 warning，清零后再把 `npm run lint:strict` 升级为 required check。

建议清理顺序：

1. `client/src/api/index.ts`：先收敛 API 返回类型，减少前端 `any` 外溢。
2. `server/src/routes/activities.ts`：拆分大型路由并补 Prisma/Zod 类型。
3. 测试文件中的 mock `any`：用最小 typed helper 批量替换。
4. `react-hooks/exhaustive-deps`：逐个确认依赖是否缺失，避免机械补依赖造成循环渲染。

## 不适用项

- Ruff：仅用于 Python lint/format，Atlas 无 Python 应用代码。
- mypy：仅用于 Python 类型检查，Atlas 无 Python 应用代码。
