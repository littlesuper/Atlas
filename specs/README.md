# specs/ — 产品需求规格

> 本目录存放 Atlas 的**产品需求规格说明书**（描述系统「应该是什么」的长期基线）。
> 文档归档总规范见 [../docs/README.md](../docs/README.md)。

## 与 `docs/specs/` 的区别（不要混放）

| | `specs/`（本目录） | `docs/specs/<initiative>/` |
|---|---|---|
| 内容 | 模块级**需求规格**，长期基线 | 单次**特性 / 改造的设计文档** |
| 回答 | 系统「应该是什么」 | 某次变更「怎么做的」 |
| 生命周期 | 随产品演进持续维护 | 做完即沉淀为历史（带日期 + 状态） |
| 命名 | `<module>-spec.md` | 目录内 `NN-name.md` |

## 文件清单

| 文件 | 说明 |
|---|---|
| [auth-spec.md](auth-spec.md) | 认证模块规格（JWT 双令牌、用户模型） |
| [permission-spec.md](permission-spec.md) | RBAC 权限模型规格 |
| [project-spec.md](project-spec.md) | 项目管理规格 |
| [product-spec.md](product-spec.md) | 产品管理规格 |
| [system-spec.md](system-spec.md) | 系统级规格（总纲，含交叉索引） |
| [activity-role-binding-spec.md](activity-role-binding-spec.md) | 活动角色绑定规格 |
| [test-cases.md](test-cases.md) | API/功能测试用例（历史快照） |
| [e2e-test-suite.md](e2e-test-suite.md) | E2E 测试用例集（历史快照） |
| [ui-test-cases.md](ui-test-cases.md) | UI 界面交互测试用例（专项快照） |

> ⚠️ 测试用例的**当前权威源**是 [../docs/qa/test-plan.md](../docs/qa/test-plan.md)（380+ 用例 / 16 模块）；
> 本目录的 `test-cases.md` / `e2e-test-suite.md` / `ui-test-cases.md` 为历史 / 专项快照，保留作参考。
