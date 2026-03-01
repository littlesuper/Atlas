# 活动列表内联编辑 — 需求文档

## 1. 概述

项目详情页的「活动列表」Tab 支持单击单元格进行内联编辑，无需打开抽屉即可快速修改活动属性。所有编辑操作受权限控制，仅具备 `activity:update` 权限且为项目经理的用户可执行。

## 2. 支持内联编辑的字段

| # | 字段 | 列标题 | 编辑器类型 | 提交方式 | 取消方式 |
|---|------|--------|-----------|---------|---------|
| 1 | predecessor | 前置 | Input 文本框 | 回车 / 失焦 | 失焦自动提交 |
| 2 | phase | 阶段 | Select 下拉 | 选择即提交 | 点击空白关闭 |
| 3 | name | 活动名称 | Input 文本框 | 回车 / 失焦 | 失焦自动提交 |
| 4 | type | 类型 | Select 下拉 | 选择即提交 | 点击空白关闭 |
| 5 | status | 状态 | Select 下拉 | 选择即提交 | 点击空白关闭 |
| 6 | assignee | 负责人 | Select 多选下拉 | 选择即提交 | 点击空白关闭 |
| 7 | planDuration | 计划工期 | InputNumber | 回车 / 失焦 | 失焦自动提交 |
| 8 | planDates | 计划时间 | DatePicker.RangePicker | 选完日期范围自动提交 | 点击空白关闭 |
| 9 | actualDates | 实际时间 | DatePicker.RangePicker | 选完日期范围自动提交 | 点击空白关闭 |
| 10 | notes | 备注 | Input 文本框 | 回车 / 原生失焦 | 失焦自动提交 |

## 3. 交互规范

### 3.1 触发编辑
- **触发方式**：单击单元格内容
- **权限检查**：单击前检查 `hasPermission('activity', 'update') && isProjectManager()`，无权限时不响应
- **互斥**：同一时刻只有一个单元格处于编辑态（`inlineEditing` state 为单例）

### 3.2 编辑器行为

#### Input 类（predecessor、name、notes）
- 单击后显示 `<Input autoFocus />` 并预填当前值
- 按 Enter 或点击除自身外白板区域引发原生失焦事件（onBlur）时提交修改
- 注：原生 Input/InputNumber 不受全局弹窗点击注销拦截，保障了失焦自动保存不丢失
- 空值提交时清除该字段

#### InputNumber 类（planDuration）
- 单击后显示 `<InputNumber autoFocus />` 并预填当前工期值
- 按 Enter 或失焦时提交修改
- 提交后根据计划开始日期 + 工期（中国工作日）自动计算并更新计划结束日期

#### Select 类（phase、type、status、assignee）
- 单击后通过 `AutoOpenSelect` 组件模拟点击展开下拉列表
- 选择选项后立即提交（`onChange`）
- 点击空白处关闭下拉列表（document mousedown 监听 → 退出编辑态）
- 负责人为多选模式，关闭下拉列表时提交已选值

#### DatePicker.RangePicker 类（planDates、actualDates）
- 计划时间与实际时间均单击后显示 `<RangePicker />` 并自动弹出日历面板
- 选完开始和结束日期后自动提交
- 点击空白处触发全局 `mousedown` 监听关闭日历面板并退出编辑态（组件卸载）
- *附设增强*：实际时间（`actualDates`）非编辑态展示时会自动基于开始与结束计算并附带展示工期（如：`3天`灰色小字）

### 3.3 特殊规则

| 规则 | 描述 |
|------|------|
| **前置依赖锁定计划时间** | 当活动设置了前置依赖（`dependencies` 非空），单击计划时间列时显示提示 `"已设置前置依赖，计划时间由系统自动计算"` 而非进入编辑 |
| **前置依赖文本格式** | 格式为 `{序号}[类型][±延迟]`，多个用逗号分隔，如 `3FS+2, 5`。类型默认 FS，延迟默认 0 |
| **前置依赖级联** | 修改前置依赖后触发 `loadActivities()` 重新加载，因为后端会级联更新下游任务日期 |
| **计划时间自算工期** | 修改计划开始/结束日期后自动计算工期 `planDuration = calcWorkdays(start, end)` |
| **计划工期自算结束日期** | 修改计划工期后，根据计划开始日期 + 工期自动计算计划结束日期 `planEndDate = addWorkdays(planStartDate, dur)` |

## 4. 内联新增活动

### 4.1 触发方式
- 点击首列的 **+** 按钮

### 4.2 行为
1. 调用 `activitiesApi.create()` 在对应位置创建一条默认活动（name=`新活动`，type=`TASK`，status=`NOT_STARTED`）
2. `sortOrder` 取上下相邻活动的中间值
3. 创建成功后重新加载活动列表
4. 自动进入新行「活动名称」列的内联编辑态，用户可直接输入名称

### 4.3 权限
- 仅具备 `activity:create` 权限的用户可见 **+** 按钮

## 5. 数据流

```
单击 → setInlineEditing({ id, field })
  → 渲染编辑器组件（Input / InputNumber / Select / RangePicker）
    → 用户操作（输入/选择/选日期）
      → commit 函数调用 activitiesApi.update()
        → 成功: 更新本地 state 或 loadActivities()
        → 失败: Message.error('更新失败')
  → 退出编辑态: setInlineEditing(null)

点击 + → activitiesApi.create() → loadActivities()
  → setInlineEditing({ id: newId, field: 'name' })
```

## 6. 权限模型

- 编辑检查: `hasPermission('activity', 'update') && isProjectManager(project?.managerId, project?.id)`
- 创建检查: `hasPermission('activity', 'create')`
- 无权限时：单元格 cursor 为 default，单击不响应；+ 按钮不显示
- 有权限时：单元格 cursor 为 pointer，单击进入编辑态；+ 按钮可见

## 7. 列设置

### 7.1 新增列自动可见与位置锁定
当系统新增列后，用户已保存的列偏好会自动将新列设为可见。判断逻辑：若列 key 不存在于用户已保存的 `order` 列表中，则视为新增列，自动加入 `visible`。
此外，`notes`（备注）列将被强制作为最后一列兜底，所有新加入的列均在备注列之前插入。

### 7.2 恢复默认
点击列设置面板中的「恢复默认」按钮，重置为系统默认的列顺序和可见性。

## 8. 不支持内联编辑的字段

| 字段 | 原因 |
|------|------|
| ID（序号） | 系统自动生成 |
| 操作列 | 按钮区域，非数据字段 |
