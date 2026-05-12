# GLM 继续执行交接文档

> 交接目的：让 GLM 可以从当前状态继续推进 Atlas 品质提升项目，不需要重新询问用户，也不要把进度停在口头总结。每完成一个可验证任务，必须同步更新 `atlas-quality-system/PROJECT_PROGRESS.md`。

## 1. 当前项目状态

| 项目 | 当前状态 |
| --- | --- |
| 工作目录 | `/Users/macbot/PlayCode/Atlas` |
| 当前日期 | 2026-05-08 |
| 进度看板 | `atlas-quality-system/PROJECT_PROGRESS.md` |
| 看板自检说明 | `atlas-quality-system/docs/22-进度看板自检.md` |
| 当前阶段 | Week 8 体系巩固已完成 |
| 看板整体进度 | 100% |
| 最近完成增量 | `quality:progress-guard` builder 的 `NOT AVAILABLE` 占位说明门禁 |

最近一次完整验证结果：

| 命令 | 结果 |
| --- | --- |
| `npm test --workspace=server -- checkQualityProgressGuard qualityProgressGuard` | PASS，2 个测试文件，120 个测试通过 |
| `npm run typecheck --workspace=server -- --pretty false` | PASS |
| `npm run lint` | PASS，0 errors / 0 warnings |
| `npm run quality:progress-guard --workspace=server -- --min-week8-progress=100 --evidence="120 个测试通过" --evidence="NOT AVAILABLE 占位说明" --evidence="说明列不能" --changelog="NOT AVAILABLE 占位说明门禁"` | PASS，输出 `QUALITY_PROGRESS_GUARD` / `READY` |
| `git diff --check` | PASS |

## 2. 已有关键文件

| 文件 | 用途 |
| --- | --- |
| `server/src/utils/qualityProgressGuard.ts` | 进度看板自检 builder，负责解析看板日期、Week 8 进度、PASS 证据、变更日志和缺口 |
| `server/src/utils/qualityProgressGuard.test.ts` | builder 单元测试，当前覆盖 101 个 builder 用例 |
| `server/src/scripts/checkQualityProgressGuard.ts` | CLI 入口 |
| `server/src/scripts/checkQualityProgressGuardCli.test.ts` | CLI 参数与错误输出测试，当前 19 个用例 |
| `atlas-quality-system/docs/22-进度看板自检.md` | 进度看板自检规则说明 |
| `atlas-quality-system/PROJECT_PROGRESS.md` | 用户要求的可视化进度看板，每完成一个任务必须更新 |

当前这些质量项目文件在 git 中仍显示为未跟踪文件，除非用户明确要求，不要 stage、commit 或重置：

```text
?? atlas-quality-system/PROJECT_PROGRESS.md
?? atlas-quality-system/docs/22-进度看板自检.md
?? server/src/scripts/checkQualityProgressGuard.ts
?? server/src/scripts/checkQualityProgressGuardCli.test.ts
?? server/src/utils/qualityProgressGuard.test.ts
?? server/src/utils/qualityProgressGuard.ts
```

## 3. GLM 必须遵守的执行规则

1. 不要停下来问用户下一步做什么。用户已明确要求“继续推进，不用停下来问我”。
2. 每次只推进一个小而可验证的品质增量，完成后再进入下一个。
3. 涉及行为变化时必须走 TDD：先写失败测试，确认红灯，再做最小实现，最后确认绿灯。
4. 每完成一个任务，必须更新 `atlas-quality-system/PROJECT_PROGRESS.md` 的最近验证证据和变更日志。
5. 看板更新后必须运行 `quality:progress-guard`，确认新证据和新 changelog 能被看板自检识别。
6. 收口前必须运行必要验证命令并读取输出，不要用“应该通过”代替证据。
7. 不要使用 `git reset --hard`、`git checkout --` 或删除用户/前序代理的未跟踪文件。
8. 不要在没有用户明确要求时 stage、commit、push 或创建 PR。

## 4. 标准执行循环

每个增量按以下顺序执行：

1. 选择一个最小品质缺口。
2. 阅读相关代码、测试、文档和看板。
3. 如果是行为变化，新增一个失败测试并运行聚焦测试，记录 EXPECTED_FAIL。
4. 做最小实现。
5. 运行聚焦测试，确认 PASS。
6. 更新相关说明文档。
7. 更新 `PROJECT_PROGRESS.md`：
   - 增加红灯证据行。
   - 增加绿灯证据行。
   - 增加 `quality:progress-guard` 自检证据行。
   - 增加最终验证证据行。
   - 增加 `## 7. 变更日志` 对应行。
8. 运行 `quality:progress-guard`，确认输出 `READY` 且 `gaps: []`。
9. 运行最终验证。
10. 用简短中文向用户汇报完成项、改动文件和验证结果。

## 5. 已完成任务总结

以下 P0/P1/P2 任务已全部完成（2026-05-08）：

### 已完成

| 任务 | 完成状态 |
| --- | --- |
| P0: changelog 占位值规则文档一致性 | DONE — 补齐 `22-进度看板自检.md` 和 2 个聚焦测试 |
| P0: changelog NOT AVAILABLE 占位测试 | DONE — 确认代码已覆盖，添加绿灯确认测试 |
| P1: 占位说明测试重构为 `test.each` | DONE — 9 个重复测试合并为参数化测试 |
| P1: 增强 progress guard 输出摘要文档 | DONE — `docs/39-进度看板自检故障速查.md`，35 条 gap 消息 |
| TDD 修复: `hasInlineCodeCommandCell` 多反引号 | DONE — 真实红灯→扩展正则→绿灯 |
| 测试覆盖补齐（tilde 围栏/重复章节/空白/占位） | DONE — 5 个确认测试 |
| P2: 团队侧执行包 | DONE — `docs/40-P2团队执行包.md` |
| Week 4 生成关键测试 | DONE — 新增 6 个路由测试文件（riskItems/auditLogs/activityComments/holidays/uploads/wecomConfig），85 个测试 |
| 看板状态更新 | DONE — 测试约定 DONE、CLAUDE.md DONE、pre-commit 85%、Week 4 生成关键测试 100% |

### 当前验证基线

| 命令 | 结果 |
| --- | --- |
| `npm test --workspace=server` | PASS，92 个测试文件，1280 个测试通过 |
| `npm run typecheck --workspace=server -- --pretty false` | PASS |
| `npm run lint` | PASS，0 errors / 0 warnings |
| `npm run quality:progress-guard --workspace=server -- --min-week8-progress=100` | PASS，READY |
| `git diff --check` | PASS |

### 下一步建议

本地可继续推进的方向：
1. 补齐其他 PARTIAL 路由测试覆盖（如现有路由的边界情况）
2. 更新测试覆盖矩阵文档 `docs/06-测试覆盖矩阵.md`
3. 为前端组件补测试
4. 团队侧 TODO 需要人工介入（见 `docs/40-P2团队执行包.md`）

## 6. 下一步任务样例

任务名称：

```text
收紧 quality:progress-guard builder changelog NOT AVAILABLE 占位事项门禁
```

预期测试方向：

```ts
it('does not count changelog rows with a NOT AVAILABLE completed item cell', () => {
  const guard = buildQualityProgressGuard({
    content: completeProgressContent.replace(
      '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
      '| 2026-05-06 | NOT AVAILABLE | Week 8 体系巩固推进到 99% |',
    ),
    requiredDate: '2026-05-06',
    minWeek8Progress: 99,
    requiredEvidenceMarkers: ['quality:final-closure'],
    requiredChangelogMarkers: ['quality:final-closure'],
    generatedAt: new Date('2026-05-06T10:00:00.000Z'),
  });

  expect(guard.status).toBe('BLOCKED');
  expect(guard.summary.matchedEvidence).toBe(1);
  expect(guard.summary.matchedChangelog).toBe(0);
  expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
});
```

注意：当前实现可能已经通过这个场景，因为 changelog 也复用了同一个 placeholder 集合。如果测试直接通过，说明它不是有效红灯增量，不要伪造红灯。此时应改做文档一致性任务，或寻找另一个真实缺口。

## 7. 看板更新模板

最近验证证据可追加到 `## 5. 最近验证证据` 靠近最新 `2026-05-08` 记录的位置：

```md
| 2026-05-08 | `npm test --workspace=server -- qualityProgressGuard` | EXPECTED_FAIL | TDD 红灯：... |
| 2026-05-08 | `npm test --workspace=server -- qualityProgressGuard` | PASS | 2 个测试文件，N 个测试通过；... |
| 2026-05-08 | `npm run quality:progress-guard --workspace=server -- --min-week8-progress=100 --evidence="..." --changelog="..."` | PASS | 输出 `QUALITY_PROGRESS_GUARD` / `READY`，... 证据和变更日志已同步 |
| 2026-05-08 | `npm test --workspace=server -- checkQualityProgressGuard qualityProgressGuard` | PASS | 2 个测试文件，N 个测试通过；覆盖 ... |
| 2026-05-08 | `npm run typecheck --workspace=server -- --pretty false` | PASS | ... 接入后，服务端 TypeScript 全量 typecheck 通过 |
| 2026-05-08 | `npm run lint` | PASS | ... 接入后，ESLint 全仓 0 errors / 0 warnings |
| 2026-05-08 | `git diff --check` | PASS | ... 接入后，当前工作区 diff 无空白错误 |
```

变更日志可追加到 `## 7. 变更日志` 最新同类位置：

```md
| 2026-05-08 | 收紧 `quality:progress-guard` builder ... 门禁 | ...，整体进度保持 100% |
```

看板自检命令模板：

```bash
npm run quality:progress-guard --workspace=server -- --min-week8-progress=100 --evidence="..." --evidence="..." --changelog="..."
```

最终验证模板：

```bash
npm test --workspace=server -- checkQualityProgressGuard qualityProgressGuard
npm run typecheck --workspace=server -- --pretty false
npm run lint
git diff --check
```

## 8. 交接给 GLM 的第一句话

可以把下面这段直接发给 GLM：

```text
请从 /Users/macbot/PlayCode/Atlas 继续执行 Atlas 品质提升项目。先阅读 atlas-quality-system/docs/38-GLM继续执行交接.md 和 atlas-quality-system/PROJECT_PROGRESS.md。不要问我下一步做什么，按交接文档的标准执行循环持续推进。每完成一个可验证增量，必须更新 PROJECT_PROGRESS.md 的最近验证证据和变更日志，并运行 quality:progress-guard 确认 READY。涉及行为变化必须先写失败测试，确认红灯后再实现。不要 stage、commit、reset 或删除未跟踪文件，除非我明确要求。
```
