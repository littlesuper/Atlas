# 排期助手 · 浮层 + 分步执行时间线（前端 UX 迭代）

> 在已交付的"对话式排期 + 风险暴露"之上，把入口从标签页改为**右下角常驻浮层**，并把
> propose→apply 管线可视化为**分步执行时间线**。**纯前端，复用既有 `/propose` `/apply`
> 后端，零后端/DB 改动。** 2026-06-13，经 L.S. 确认。

## 决策（已拍板）
- **浮层形态**：右下角悬浮按钮（FAB）+ 点开对话面板，可收起。
- **执行过程**：分步时间线（Arco `Steps` 竖向），每步标注〔AI〕或〔系统计算〕。
- **原标签页**：移除 `<Tabs.TabPane key="schedule-assistant">`，改为页面级浮层。

## 组件
- `client/src/pages/Project/Detail/ScheduleAssistantLauncher.tsx`
  - FAB：`position: fixed` 右下角，`IconRobot`；点击切换面板开合。
  - 面板：固定定位浮层（约 420px 宽、≤70vh、可滚），含输入区 + 执行时间线。
  - 复用既有逻辑：`scheduleAssistantApi.propose/apply`、降级分支、`Modal.confirm` 应用确认。
  - 可见性由父组件控制：`!isSnapshot && canManage` 才挂载。
- `Detail/index.tsx`：移除标签页；在页面级（Tabs 外）挂 `<ScheduleAssistantLauncher>`。
- 删除旧 `ScheduleAssistantPanel.tsx` + 其测试，逻辑并入 launcher。

## 执行时间线状态机
五步（Arco Steps）：
1. **意图解析**〔AI〕— 产出解析后的操作摘要
2. **排期干跑**〔系统计算〕— "已重算 N 个活动"
3. **风险判定**〔系统计算〕— 风险条数 / "无风险"
4. **预览待确认** — 叙述 + diff 表 + 风险 Tag + [应用全部][取消]
5. **已应用** — 成功态

`/propose` 一次性返回（意图+diff+风险+叙述），故 ①②③ 同时标记完成并各显真实产出；
请求在飞时整体显示"分析中…"。**不为瞬时计算造假进度。**

### 降级映射（沿用后端已实现行为）
| 情形 | 时间线表现 |
|---|---|
| AI 不可用（propose 503） | ① 标红"AI 暂不可用，请手动调整"，止步 |
| 没听懂（noOp，200） | ① 完成但显示"没听懂…"，②~④ 不展开 |
| 叙述为空（叙述 AI 挂） | ④ 仅结构化 diff + 提示，仍可应用 |
| 低置信 | ① 带警示标签，④ 顶部醒目提示逐条核对 |
| apply 409/404/400 | 提示并清预览（409 版本冲突 / 404 过期 / 400 成环） |

## 测试（`ScheduleAssistantLauncher.test.tsx`）
FAB 渲染与显隐（归档/无权限隐藏）、点开收起、analyze→①②③④ 填充、风险 Tag、低置信提示、
noOp、503 ①标红、apply 确认→⑤、取消清预览。

## 不变
types / constants（`SCHEDULE_RISK_KIND_MAP`）/ api / 全部后端与既有测试。
