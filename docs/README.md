# Atlas 文档归档规范（docs/ 索引）

> 本文件定义 Atlas 仓库内**文档放哪、怎么命名、何时归档**的统一规范，并作为 `docs/` 的导航入口。
> 适用范围：仓库内所有 `.md` 文档（源码注释、自动生成的 CHANGELOG 不在此列）。
> ⚠️ 现状尚未 100% 符合本规范，已知差距与迁移见 [§7 现状差距](#7-现状差距与迁移)。

## 1. 文档分区地图（谁放哪）

| 类型 | 位置 | 说明 | 命名 |
|---|---|---|---|
| 项目说明 / 上手 | 仓库根 | `README` / `GETTING_STARTED` / `CONTRIBUTING` / `DEPLOYMENT` / `PROJECT_SUMMARY` | 约定俗成全大写 |
| AI 代理指引 | 仓库根 | `CLAUDE.md` ＝ `AGENTS.md`（两份内容保持一致） | 固定名 |
| 产品需求规格 | `specs/` | 模块级「规格说明书」（稳定基线：auth / product / project / permission / system / 活动角色绑定） | `<module>-spec.md` |
| 特性 / 改造设计文档 | `docs/specs/<initiative>/` | 单个特性或重构的设计＋实现＋验收，一特性一目录 | 目录 kebab；文件 `NN-name.md`（`00` 起编号）；入口 `INDEX.md` |
| QA 执行文档 | `docs/qa/` | 当前测试计划、GLM-QA 闭环手册、bug 模板、`reports/` | 见 [docs/qa/README.md](qa/README.md) |
| 质量体系（方法论包） | `atlas-quality-system/` | 自带 `README`/`ROADMAP` 的独立质量制度包；**被 server `quality:*` 脚本硬编码引用，勿随意改路径** | 见该目录 README |
| 工作流产物 | `docs/superpowers/{plans,specs}/` | superpowers 流程的计划 / 规格 | `YYYY-MM-DD-name.md` |
| 发布 / 运维 | `docs/release.md`、根 `DEPLOYMENT.md`（已标注过时） | 发布与回滚流程 | — |
| 归档 | 各区下的 `archive/` 子目录 | 过期 / 一次性文档 | 见 §5 |

> **两类「spec」区别（不要混放）**：
> - `specs/` ＝ **长期产品需求规格**，描述系统「应该是什么」，是稳定基线。
> - `docs/specs/` ＝ **某次特性 / 改造的设计文档**，描述某次变更「怎么做的」，带日期＋状态，做完即沉淀为历史。

## 2. 命名约定

- 目录名、类型化文件名：英文 `kebab-case`（如 `activity-role-binding-spec.md`）。正文内容中文不限。
- 特性设计文档：目录内用数字前缀排序 `00-design.md` / `01-implementation-plan.md` / `02-…`，入口 `INDEX.md`。
- 产品规格：`<module>-spec.md`。
- 模板文件：`_TEMPLATE.md` 或 `UPPER_SNAKE`，与所在目录现有风格保持一致。
- **同一目录内命名风格统一**——别一半编号、一半日期、一半自由命名。

## 3. 日期格式（统一）

- **一律 ISO 8601 `YYYY-MM-DD`**（如 `2026-06-15`）。**停用** `YYYYMMDD`（旧文件 `coverage-P0-20260428.md` 属历史，新文件不再用此格式）。
- 带日期的产物文件：`<name>-YYYY-MM-DD.md`（如 `run-2026-06-15.md`）。
- 文档头部注明 `日期:` 与 `状态:`（草稿 / 已评审 / 已实现 / 已归档）。

## 4. 新增文档放哪（决策树）

1. 是「系统应该是什么」的长期规格？→ `specs/<module>-spec.md`
2. 是「某次特性 / 改造怎么做」的设计文档？→ `docs/specs/<initiative>/NN-*.md`
3. 是测试计划 / 用例 / 报告？→ `docs/qa/`（报告进 `docs/qa/reports/`）
4. 是质量制度 / 方法论 / 审计？→ `atlas-quality-system/`（注意脚本耦合，见 §5）
5. 是某次 AI 工作流的计划 / 规格？→ `docs/superpowers/`
6. 是发布 / 运维流程？→ `docs/release.md`
7. 都不是、只是临时工作笔记？→ `docs/working/`（临时区，完结后归档或删除），**不要散在 `docs/` 根目录**。

## 5. 归档策略

- 过期、一次性、被取代的文档 → 移入所在区的 `archive/` 子目录，**文件头加抬头**：
  `> 已归档于 YYYY-MM-DD：<原因 / 取代者>`
- 删除或移动前先 `grep -rn "<相对路径>" .` 确认无代码 / 文档引用。
  **特别注意 `atlas-quality-system/` 下的文件**——多被 server `quality:*` 脚本与单测断言引用（如 `server/src/scripts/writeQualityKnowledgeIndex.ts`、`checkQualityClosureConsistency.ts`），改路径会断 CI。
- 不在 `docs/` 根或仓库根堆放游离工作文件。

## 6. 索引维护

- 每个文档区维持一个 `README.md` 或 `INDEX.md` 入口。
- 新增 / 移动文档时，同步更新：本文件的分区地图、所在目录的索引。
- 若涉及 `atlas-quality-system/`，同步其预置索引（`server/src/scripts/writeQualityKnowledgeIndex.ts`，并跑 `npm run quality:knowledge-index --workspace=server` 验证 `missingRequiredPathCount` 为 0）。

## 7. 现状差距与迁移

本规范分期落地。**一期已完成**（见下），二 / 三期为后续：

### 已完成（一期）

- ✅ **游离文件归位**：`review.md`、`CODEX-CONTINUATION-PROMPT.md` → [`docs/working/`](working/)；活动内联编辑需求 / 用例 → [`docs/specs/activity-inline-edit/`](specs/activity-inline-edit/)。
- ✅ **测试用例权威源**：以 [`docs/qa/test-plan.md`](qa/test-plan.md) 为唯一权威源，`specs/{test-cases,e2e-test-suite,ui-test-cases}.md` 与 `e2e/TEST_CASES.md` 头部已加指回横幅。
- ✅ **bug 模板分工**：三份各司其职（见 §1）；并修复了 `atlas-quality-system/templates/BUG_REPORT_TEMPLATE.md` 的 `docs/examples/...` 死链。
- ✅ **占位模板防混淆**：`atlas-quality-system/templates/CLAUDE.md` 顶部已加显著抬头（**未改名**——该路径被包内 4 处引用）。
- ✅ **specs/ 自述**：新增 [`specs/README.md`](../specs/README.md) 说明「需求规格 vs 设计文档」。

### 已决策 / 已完成（二期）

- ✅ **质量包索引补漂移**：`atlas-quality-system/docs/38~40`（GLM 交接 / 看板自检速查 / P2 执行包）原未进任何索引，已补入 README 结构树与 `writeQualityKnowledgeIndex.ts` 预置索引（`quality:knowledge-index` 仍 READY）。
- ❎ **否决物理归档**：把 `docs/17~37` 收口文档移入 `archive/` 被否决——它们被 42+ 处脚本 / 测试编入索引（含 `requiredPaths` 校验），移动属高 churn、低收益、CI 易红；**维持原地**。

### 仍待处理（三期 · 可选）

- ⏳ **日期格式统一**：`docs/qa/reports/*-20260428.md`（旧 `YYYYMMDD`）改名为 ISO `YYYY-MM-DD`——旧报告一般保留历史名，按需进行。
- ⏳ **specs 单根**：是否把 `specs/` 并入 `docs/specs/product/`，待定。
