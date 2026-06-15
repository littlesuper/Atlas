# 通用能力注册层（AI Capability Registry）— 设计文档索引

把 Atlas 往「AI（在用户权限内）驱动全系统」演进：用声明式 `Capability` 承载可写动作，新增能力近零样板，AI 能力边界 = 用户权限边界。框架与安全模型见 `docs/specs/system-wide-assistant/`。

| 文档 | 内容 |
|---|---|
| [00-design.md](00-design.md) | Phase 1 设计：Capability 接口 + 注册表 + 通用编排（mode 驱动 diff）+ 权限过滤 + 一次性 `need_input`；首发能力 `project.create` |
| [01-implementation-plan.md](01-implementation-plan.md) | Phase 1 实现计划（分任务） |
| [02-phase2-design.md](02-phase2-design.md) | Phase 2 设计：能力层骨架升级（target/引用校验/自定义解析/指纹复核）+ `activity.create`（含角色绑定）+ 真·多轮槽位填充 + 三领域（schedule/project/risk）统一迁移并删除旧 adapter 体系 |
