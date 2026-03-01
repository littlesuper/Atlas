# 项目管理模块规格说明书

## 1. 模块概述

项目管理是系统核心模块，供项目经理日常使用。提供项目全生命周期管理，包含：项目列表（系统首页）、项目详情、活动/任务树形管理、甘特图可视化、AI 风险评估。整体参考微软 Project 工具的功能理念。

## 2. 数据模型

### Project（项目表 `projects`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 项目唯一标识 |
| name | String | NOT NULL | 项目名称（必填） |
| description | String | NULLABLE | 项目描述 |
| productLine | String | NOT NULL | 产品线（必填，DANDELION=蒲公英, SUNFLOWER=向日葵） |
| status | ProjectStatus | NOT NULL, DEFAULT: PLANNING | 项目状态（必填） |
| priority | Priority | NOT NULL, DEFAULT: MEDIUM | 优先级（必填） |
| startDate | DateTime | NULLABLE | 计划开始日期 |
| endDate | DateTime | NULLABLE | 计划结束日期 |
| progress | Float | NOT NULL, DEFAULT: 0 | 整体进度（0-100%，基于活动状态自动计算） |
| managerId | UUID | NOT NULL, FK → users.id | 项目经理（必填） |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 创建时间 |
| updatedAt | DateTime | NOT NULL, AUTO | 更新时间 |

### ProjectMember（项目协作者表 `project_members`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| projectId | UUID | FK → projects.id, CASCADE | 项目ID |
| userId | UUID | FK → users.id, CASCADE | 用户ID |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 添加时间 |

**联合主键：** `[projectId, userId]`

**说明：** 项目协作者拥有与项目经理相同的项目管理权限（编辑项目、管理活动、管理周报）。仅项目经理和系统管理员可以添加/移除协作者。

### Activity（活动/任务表 `activities`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 活动唯一标识 |
| projectId | UUID | FK → projects.id, CASCADE | 所属项目 |
| parentId | UUID | FK → activities.id, NULLABLE | 父活动（支持层级嵌套） |
| name | String | NOT NULL | 活动名称 |
| description | String | NULLABLE | 描述 |
| type | ActivityType | NOT NULL, DEFAULT: TASK | 活动类型 |
| phase | String | NULLABLE | 阶段标识：EVT/DVT/PVT/MP |
| assignees | User[] | N:N 关联（通过 `_ActivityAssignees` 中间表） | 负责人（多对多） |
| status | ActivityStatus | NOT NULL, DEFAULT: NOT_STARTED | 状态 |
| priority | Priority | NOT NULL, DEFAULT: MEDIUM | 优先级 |
| planStartDate | DateTime | NULLABLE | 计划开始日期 |
| planEndDate | DateTime | NULLABLE | 计划结束日期 |
| planDuration | Int | NULLABLE | 计划工期（工作日，自动计算，排除周末） |
| startDate | DateTime | NULLABLE | 实际开始日期 |
| endDate | DateTime | NULLABLE | 实际结束日期 |
| duration | Int | NULLABLE | 实际工期（工作日，自动计算，排除周末） |
| dependencies | JSON | NULLABLE | 前置任务依赖关系 |
| notes | String | NULLABLE | 备注 |
| sortOrder | Int | NOT NULL, DEFAULT: 0 | 排序序号 |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 创建时间 |
| updatedAt | DateTime | NOT NULL, AUTO | 更新时间 |

### 工期计算规则

- **工作日计算：** 后端自动计算工作日数量，排除周末（周六、周日），包含起止日期
- **节假日支持：** 系统提供两种计算方式：
  - `calculateWorkdays()`: 仅排除周末（默认使用）
  - `calculateWorkdaysWithHolidays()`: 排除周末 + 中国法定节假日，包含调休补班日（可选）
- **最小单位：** 开始日期与结束日期为同一天时，工期最小为 1 个工作日
- **自动计算：**
  - 后端：创建/更新活动时，如有开始和结束日期，自动计算工期
  - 前端：选择时间范围时实时计算并显示工期
- **反向调整：** 前端支持手动修改工期数值时，自动调整对应时间范围的结束日期
- **节假日数据：** 前端内置中国法定节假日及调休数据（2026年），可按年度更新

### ProjectArchive（项目快照表 `project_archives`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 快照唯一标识 |
| projectId | UUID | FK → projects.id, CASCADE | 所属项目 |
| snapshot | JSON | NOT NULL | 项目完整快照（含活动、产品、周报、风险评估等） |
| archivedBy | String | NOT NULL | 创建者用户 ID |
| archivedAt | DateTime | NOT NULL, DEFAULT: now() | 创建时间 |
| remark | String | 可选 | 快照备注（如"EVT阶段完成"） |

**索引：** `[projectId]`

**说明：** 项目快照功能，类似在线文档的版本管理。每次创建快照将项目当前全量数据保存为只读版本。snapshot JSON 包含：`project`（项目基本信息及成员列表）、`activities`（所有活动及负责人）、`products`（所有产品）、`weeklyReports`（所有周报）、`riskAssessments`（所有风险评估）。查看快照时通过独立路由 `/projects/:id/snapshot/:snapshotId` 复用项目详情页，以只读模式展示快照数据。

### RiskAssessment（风险评估表 `risk_assessments`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 评估唯一标识 |
| projectId | UUID | FK → projects.id, CASCADE | 所属项目 |
| riskLevel | String | NOT NULL | 风险等级：LOW/MEDIUM/HIGH/CRITICAL |
| riskFactors | JSON | NOT NULL | 风险因素列表 |
| suggestions | JSON | NOT NULL | 改进建议列表 |
| assessedAt | DateTime | NOT NULL, DEFAULT: now() | 评估时间 |

### WeeklyReport（项目周报表 `weekly_reports`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 周报唯一标识 |
| projectId | UUID | FK → projects.id, CASCADE | 所属项目 |
| weekStart | DateTime | NOT NULL | 周开始日期（周一） |
| weekEnd | DateTime | NOT NULL | 周结束日期（周日） |
| year | Int | NOT NULL | 年份 |
| weekNumber | Int | NOT NULL | 第几周 |
| changeOverview | Text | NULLABLE | 变更信息概述 |
| demandAnalysis | Text | NULLABLE | 需求确认与研判 |
| keyProgress | Text | NULLABLE | 本周重要进展（HTML格式） |
| nextWeekPlan | Text | NULLABLE | 下周工作计划（HTML格式） |
| riskWarning | Text | NULLABLE | 风险预警（HTML格式） |
| risks | JSON | NULLABLE | 风险/问题列表 |
| phaseProgress | JSON | NULLABLE | 阶段进展（EVT/DVT/PVT/MP） |
| attachments | JSON | NULLABLE | 附件列表 [{id, name, url, uploadedAt, section}] |
| status | ReportStatus | NOT NULL, DEFAULT: DRAFT | 周报状态 |
| progressStatus | ProgressStatus | NOT NULL, DEFAULT: ON_TRACK | 项目状态 |
| submittedAt | DateTime | NULLABLE | 提交时间 |
| createdBy | UUID | NOT NULL, FK → users.id | 创建人 |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 创建时间 |
| updatedAt | DateTime | NOT NULL, AUTO | 更新时间 |

**唯一约束：** `[projectId, year, weekNumber]` - 每个项目每周只能有一份周报
**索引：** `[weekStart, weekEnd]`

### 枚举定义

**ProductLine（产品线，非枚举，字符串常量）：**
| 值 | 显示名 | 颜色 |
|----|--------|------|
| DANDELION | 蒲公英 | 蓝色 |
| SUNFLOWER | 向日葵 | 橙色 |

**ProjectStatus：**
| 值 | 说明 |
|----|------|
| PLANNING | 规划中 |
| IN_PROGRESS | 进行中 |
| COMPLETED | 已完成 |
| ON_HOLD | 已搁置 |

**ActivityType：**
| 值 | 说明 |
|----|------|
| TASK | 任务 |
| MILESTONE | 里程碑 |
| PHASE | 阶段（可包含子任务） |

**ActivityStatus：**
| 值 | 说明 |
|----|------|
| NOT_STARTED | 未开始 |
| IN_PROGRESS | 进行中 |
| COMPLETED | 已完成 |
| CANCELLED | 已取消 |

**Priority：**
| 值 | 说明 |
|----|------|
| LOW | 低 |
| MEDIUM | 中 |
| HIGH | 高 |
| CRITICAL | 紧急 |

**ReportStatus（周报状态）：**
| 值 | 说明 |
|----|------|
| DRAFT | 草稿 |
| SUBMITTED | 已提交 |
| ARCHIVED | 已归档 |

**ProgressStatus（项目状态）：**
| 值 | 图标 | 颜色 | 说明 |
|----|------|------|------|
| ON_TRACK | ✓ | 绿色 | 顺利进行 |
| MINOR_ISSUE | ⚠️ | 黄色 | 轻度阻碍 |
| MAJOR_ISSUE | ✕ | 红色 | 严重阻碍 |

### dependencies JSON 结构
```json
[
  { "id": "前置任务UUID", "type": "0" }
]
```
type 定义：`0`=完成-开始(FS), `1`=开始-开始(SS), `2`=完成-完成(FF), `3`=开始-完成(SF)

### riskFactors JSON 结构
```json
[
  { "factor": "进度严重滞后", "severity": "高", "description": "时间进度65%，实际进度35%，差距超过30%" }
]
```

### suggestions JSON 结构
```json
["建议召开项目紧急评审会议", "优先处理逾期任务"]
```

### attachments JSON 结构
```json
[
  {
    "id": "1708012345678",
    "name": "20260216_100035_0821.png",
    "url": "/uploads/20260216_100035_0821.png",
    "uploadedAt": "2026-02-16T10:00:00.000Z",
    "section": "keyProgress"
  }
]
```
- `name`: 时间戳重命名后的文件名（格式 `yyyyMMdd_HHmmss_NNNN.ext`），非原始文件名
- `section`: 附件所属区域，值为 `keyProgress`（本周重要进展）、`nextWeekPlan`（下周工作计划）、`riskWarning`（风险预警）

### phaseProgress JSON 结构
```json
{
  "EVT": {
    "progress": "完成原理图设计，正在进行PCB布局",
    "risks": "元器件供应周期较长，需提前备货",
    "schedule": "2026-02-10 ~ 2026-02-28"
  },
  "DVT": { "progress": "", "risks": "", "schedule": "" },
  "PVT": { "progress": "", "risks": "", "schedule": "" },
  "MP": { "progress": "", "risks": "", "schedule": "" }
}
```

## 3. API 接口

### 3.1 项目 CRUD

#### 获取项目列表
```
GET /api/projects?page=1&pageSize=20&status=IN_PROGRESS&keyword=传感器&productLine=DANDELION,SUNFLOWER
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | Number | 页码，默认 1 |
| pageSize | Number | 每页数量，默认 20 |
| status | String | 按状态筛选 |
| keyword | String | 按名称/描述模糊搜索 |
| productLine | String | 按产品线筛选，逗号分隔多值（如 `DANDELION,SUNFLOWER`）；筛选时同时包含 productLine 为 null 的项目 |

**后端筛选逻辑：**
- 多个筛选条件使用 `AND` 组合
- `productLine` 筛选：`OR: [{ productLine: { in: lines } }, { productLine: null }]`，即选中的产品线 + 未分配产品线的项目
- `keyword` 筛选：`OR: [{ name: contains }, { description: contains }]`

**排序规则：**
- 按 `startDate` 升序排列（从远到近，最早开始的项目在上）

**响应（200）：**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "智能传感器模组 V2.0",
      "description": "...",
      "productLine": "DANDELION",
      "status": "IN_PROGRESS",
      "priority": "HIGH",
      "startDate": "2026-01-15T00:00:00.000Z",
      "endDate": "2026-06-30T00:00:00.000Z",
      "progress": 35,
      "managerId": "uuid",
      "manager": { "id": "uuid", "realName": "张三", "username": "zhangsan" },
      "members": [
        { "user": { "id": "uuid", "realName": "李四", "username": "lisi" } }
      ],
      "_count": { "activities": 7, "products": 1 },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 2,
  "page": 1,
  "pageSize": 20,
  "stats": { "all": 10, "inProgress": 4, "completed": 3, "onHold": 1 }
}
```

**stats 统计说明：** 统计数据不受 `status` 和分页参数影响，仅受 `productLine` 和 `keyword` 筛选，确保统计卡片始终显示全量数据。

#### 获取单个项目
```
GET /api/projects/:id
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

#### 创建项目
```
POST /api/projects
```
**认证：** Bearer Token
**权限：** `project:create`

**请求体：**
```json
{
  "name": "智能传感器模组 V2.0",
  "description": "新一代智能传感器模组开发项目",
  "productLine": "DANDELION",
  "status": "PLANNING",
  "priority": "HIGH",
  "startDate": "2026-01-15",
  "endDate": "2026-06-30",
  "managerId": "uuid"
}
```

**必填字段：**
- `name`: 项目名称
- `productLine`: 产品线，值为 `DANDELION`（蒲公英）或 `SUNFLOWER`（向日葵）
- `status`: 项目状态（前端提供默认值 PLANNING）
- `priority`: 优先级（前端提供默认值 MEDIUM）
- `managerId`: 项目经理

**后端验证：** 创建时验证所有必填字段，缺失返回 400 错误

**服务端校验：**
- `status` 必须为 `PLANNING` / `IN_PROGRESS` / `COMPLETED` / `ON_HOLD`，否则返回 400
- `priority` 必须为 `LOW` / `MEDIUM` / `HIGH` / `CRITICAL`，否则返回 400
- 若同时提供 `startDate` 和 `endDate`，`endDate` 不得早于 `startDate`，否则返回 400

#### 更新项目
```
PUT /api/projects/:id
```
**认证：** Bearer Token
**权限：** `project:update` + 项目管理权限（管理员、负责人或协作者）
**请求体：** 同创建（所有字段可选，额外支持 `progress`、`productLine`）

**服务端校验：**
- `progress` 必须为 0–100 的数值，否则返回 400
- `status` 枚举校验（同创建接口）
- `priority` 枚举校验（同创建接口）
- 日期区间校验（同创建接口）

#### 删除项目
```
DELETE /api/projects/:id
```
**认证：** Bearer Token
**权限：** `project:delete` + 项目管理权限（管理员、负责人或协作者）
**响应：** `{ "success": true }`

### 3.2 项目协作者管理

#### 获取协作者列表
```
GET /api/projects/:id/members
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**响应（200）：**
```json
[
  {
    "projectId": "uuid",
    "userId": "uuid",
    "createdAt": "...",
    "user": { "id": "uuid", "realName": "李四", "username": "lisi" }
  }
]
```

#### 添加协作者
```
POST /api/projects/:id/members
```
**认证：** Bearer Token
**权限：** `project:update`（仅项目经理或管理员）

**请求体：**
```json
{
  "userId": "uuid"
}
```

**验证规则：**
- 用户必须存在
- 用户不能已是该项目的协作者
- 用户不能是该项目的负责人（负责人无需添加为协作者）

**响应（201）：** 创建的协作者记录（含 user 信息）

**错误响应：**
- `400` - 用户已是协作者 / 用户是项目经理
- `404` - 用户不存在

#### 移除协作者
```
DELETE /api/projects/:id/members/:userId
```
**认证：** Bearer Token
**权限：** `project:update`（仅项目经理或管理员）

**响应（200）：** `{ "success": true }`

### 3.3 活动/任务 CRUD

#### 获取项目所有活动（树形结构 / 分页列表）
```
GET /api/activities/project/:projectId?page=1&pageSize=20
```
**认证：** Bearer Token

**查询参数（可选）：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | Number | 页码（携带时启用分页模式） |
| pageSize | Number | 每页数量，默认 20 |

**响应模式：**
- **不携带分页参数**（默认）：返回树形结构数组（向后兼容）
- **携带分页参数**：返回 `{ data, total, page, pageSize }` 扁平列表

**树形响应（200）：** 返回树形结构数组，`children` 字段包含子活动
```json
[
  {
    "id": "uuid",
    "name": "需求分析阶段",
    "type": "PHASE",
    "status": "COMPLETED",
    "progress": 100,
    "children": [
      { "id": "uuid", "name": "市场需求调研", "type": "TASK", "children": [] }
    ]
  }
]
```

#### 获取甘特图数据
```
GET /api/activities/project/:projectId/gantt
```
**认证：** Bearer Token

**响应（200）：**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "text": "需求分析阶段",
      "plan_start_date": "2026-01-10T00:00:00.000Z",
      "plan_end_date": "2026-02-10T00:00:00.000Z",
      "plan_duration": 23,
      "start_date": "2026-01-15T00:00:00.000Z",
      "end_date": "2026-02-15T00:00:00.000Z",
      "duration": 24,
      "parent": "0",
      "type": "project",
      "assignee": "张三",
      "status": "COMPLETED",
      "priority": "MEDIUM"
    }
  ],
  "links": [
    { "id": "src-tgt", "source": "uuid1", "target": "uuid2", "type": "0" }
  ]
}
```

**注意：** 甘特图进度条填充基于 `status` 字段计算（COMPLETED=100%, IN_PROGRESS=50%, 其他=0%）

#### 创建活动
```
POST /api/activities
```
**认证：** Bearer Token
**权限：** `activity:create` + 项目管理权限（管理员、负责人或协作者）

**请求体：**
```json
{
  "projectId": "uuid",
  "parentId": "uuid（可选）",
  "name": "原理图设计",
  "description": "完成整体原理图",
  "type": "TASK",
  "phase": "EVT",
  "assigneeIds": ["uuid1", "uuid2"],
  "status": "NOT_STARTED",
  "priority": "HIGH",
  "planStartDate": "2026-02-10",
  "planEndDate": "2026-02-28",
  "planDuration": 15,
  "startDate": "2026-02-15",
  "endDate": "2026-03-01",
  "duration": 11,
  "dependencies": [{ "id": "前置任务UUID", "type": "0" }],
  "notes": "需要先完成需求评审",
  "sortOrder": 1
}
```

**工期自动计算：**
- 当提供 `planStartDate` 和 `planEndDate` 但未提供 `planDuration` 时，后端自动计算计划工期
- 当提供 `startDate` 和 `endDate` 但未提供 `duration` 时，后端自动计算实际工期
- 工期计算规则：排除周末（周六、周日），包含起止日期
- 前端可以手动指定工期，后端会优先使用手动指定的值

**循环依赖检测：** 当请求包含 `dependencies` 字段时，后端检测依赖图是否成环（同更新活动接口）

**副作用：** 自动重新计算所属项目的整体进度（基于活动状态加权计算）

#### 更新活动
```
PUT /api/activities/:id
```
**认证：** Bearer Token
**权限：** `activity:update` + 项目管理权限（管理员、负责人或协作者）
**请求体：** 同创建（所有字段可选）

**循环依赖检测：** 当请求包含 `dependencies` 字段时，后端使用 DFS 三色标记法（WHITE/GRAY/BLACK）检测依赖图是否成环。检测到循环依赖时返回 `400 { error: '存在循环依赖，无法保存' }`。实现文件：`server/src/utils/dependencyValidator.ts`

**副作用：** 自动重新计算所属项目的整体进度

#### 删除活动
```
DELETE /api/activities/:id
```
**认证：** Bearer Token
**权限：** `activity:delete` + 项目管理权限（管理员、负责人或协作者）
**副作用：** 自动重新计算所属项目的整体进度

#### 批量导入活动（Excel）
```
POST /api/activities/project/:projectId/import-excel
```
**认证：** Bearer Token
**权限：** `activity:create` + 项目管理权限（管理员、负责人或协作者）
**Content-Type：** `multipart/form-data`
**请求体：** `file` 字段，`.xlsx` / `.xls` 文件（最大 5MB）

**Excel 列识别策略（按表头关键词自动匹配）：**
- 名称：`任务描述` / `活动名称` / `任务名称`
- 阶段：`阶段` / `phase`（格式如 `1EVT阶段` → 提取 `EVT`）
- 负责人：`负责人` / `assignee`（格式如 `张三(昵称), 李四(昵称)` → 取姓名部分）
- 工期：`工期` / `duration`
- 计划开始：`计划开始` / `开始时间` / `开始日期`
- 计划结束：`计划结束` / `结束时间` / `完成时间` / `完成日期`
- 状态：`任务状态` / `状态`（已完成→COMPLETED、进行中→IN_PROGRESS、未开始→NOT_STARTED）
- 备注：`备注` / `notes`

**处理逻辑：**
- 跳过无名称的空行
- 负责人不存在时自动创建 `canLogin: false` 联系人账号
- 日期支持 Excel 序列号和中文字符串（`2026年2月2日`）两种格式
- 未提供工期但有起止日期时自动计算工期（排除周末）
- 活动 `sortOrder` 在项目现有活动之后递增

**副作用：** 自动重新计算所属项目的整体进度

**响应（200）：**
```json
{
  "success": true,
  "count": 15,
  "skipped": 0,
  "createdUsers": ["张三", "李四"],
  "activities": [...]
}
```

#### 批量排序
```
PUT /api/activities/project/:projectId/reorder
```
**认证：** Bearer Token

**请求体：**
```json
{
  "items": [
    { "id": "uuid", "sortOrder": 1, "parentId": "uuid或null" }
  ]
}
```

### 3.4 项目快照

#### 创建项目快照
```
POST /api/projects/:id/snapshot
```
**认证：** Bearer Token
**权限：** `project:update` + 项目管理权限

**请求体（可选）：**
```json
{
  "remark": "EVT阶段完成"
}
```

**操作：** 查询项目全量数据（项目信息、成员、活动及负责人、产品、周报、风险评估），将完整数据存入 snapshot JSON 字段。

**响应（200）：**
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "snapshot": { ... },
  "archivedBy": "userId",
  "archivedAt": "2026-03-01T10:00:00.000Z",
  "remark": "EVT阶段完成"
}
```

#### 获取项目快照列表
```
GET /api/projects/:id/archives
```
**认证：** Bearer Token

**响应（200）：** 按创建时间倒序，不含 snapshot 详情，含创建人信息
```json
[
  {
    "id": "uuid",
    "archivedBy": "userId",
    "archivedAt": "2026-03-01T10:00:00.000Z",
    "remark": "EVT阶段完成",
    "creator": { "id": "userId", "realName": "管理员", "username": "admin" }
  }
]
```

#### 获取快照详情
```
GET /api/projects/archives/:archiveId
```
**认证：** Bearer Token

**响应（200）：** 含完整 snapshot 数据
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "snapshot": {
    "project": { "name": "...", "status": "IN_PROGRESS", "managerId": "...", ... },
    "activities": [ { "id": "...", "name": "原理图设计", "status": "COMPLETED", "assignees": [...], ... } ],
    "products": [ ... ],
    "weeklyReports": [ ... ],
    "riskAssessments": [ ... ]
  },
  "archivedBy": "userId",
  "archivedAt": "2026-03-01T10:00:00.000Z",
  "remark": "EVT阶段完成"
}
```

### 3.5 AI 风险评估

#### 获取评估历史
```
GET /api/risk/project/:projectId
```
**认证：** Bearer Token
**响应：** 最近 10 条评估记录，按时间倒序

#### 发起风险评估
```
POST /api/risk/project/:projectId/assess
```
**认证：** Bearer Token
**请求体：** 无

**评估逻辑：**
1. 若配置了 `AI_API_KEY` 和 `AI_API_URL`，调用外部 AI（默认 gpt-4o-mini）进行分析
2. 若 AI 调用失败或未配置，回退到内置规则引擎

**规则引擎评估因素：**
| 因素 | 条件 | 风险分值 |
|------|------|----------|
| 进度严重滞后 | 时间进度 - 实际进度 > 30% | +3 |
| 进度滞后 | 时间进度 - 实际进度 > 15% | +2 |
| 大量任务延期 | 延期率 > 30% | +3 |
| 部分任务延期 | 延期率 > 10% | +1 |
| 存在逾期任务 | 逾期数 > 3 | +3 |
| 存在逾期任务 | 逾期数 > 0 | +1 |
| 资源分配不足 | 未分配负责人率 > 30%（基于 assignees 多对多关系） | +2 |

**风险等级判定：**
| 分值 | 等级（枚举值） | 中文显示 |
|------|--------------|----------|
| ≥ 7 | CRITICAL | 极高风险 |
| ≥ 4 | HIGH | 高风险 |
| ≥ 2 | MEDIUM | 中风险 |
| < 2 | LOW | 低风险 |

**严重程度枚举：** `LOW`（低）、`MEDIUM`（中）、`HIGH`（高）

**响应（200）：**
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "riskLevel": "MEDIUM",
  "riskFactors": [
    { "factor": "进度滞后", "severity": "MEDIUM", "description": "时间进度50%，实际进度35%" }
  ],
  "suggestions": ["分析延期任务原因，制定追赶计划"],
  "assessedAt": "2026-02-14T04:21:26.824Z"
}
```

### 3.6 项目周报

#### 获取周报列表
```
GET /api/weekly-reports?page=1&pageSize=20&projectId=uuid&year=2026&weekNumber=7&status=SUBMITTED
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | Number | 页码，默认 1 |
| pageSize | Number | 每页数量，默认 20 |
| projectId | String | 按项目筛选 |
| year | Number | 按年份筛选 |
| weekNumber | Number | 按周数筛选 |
| status | String | 按状态筛选 |

**排序规则：** 按年份、周数倒序（最新周报在前）

#### 获取所有草稿列表
```
GET /api/weekly-reports/drafts
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**说明：** 返回所有草稿周报（`status = DRAFT`），按更新时间倒序。不按用户过滤，所有已登录用户可查看全部草稿。

#### 获取项目的所有周报
```
GET /api/weekly-reports/project/:projectId
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**响应（200）：** 返回该项目所有周报，按年份和周数倒序

#### 获取项目最新周报
```
GET /api/weekly-reports/project/:projectId/latest
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

#### 获取单个周报
```
GET /api/weekly-reports/:id
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

#### 创建周报
```
POST /api/weekly-reports
```
**认证：** Bearer Token
**权限：** `weekly_report:create` + 项目管理权限（管理员、负责人或协作者）

**请求体：**
```json
{
  "projectId": "uuid",
  "weekStart": "2026-02-10",
  "weekEnd": "2026-02-16",
  "progressStatus": "ON_TRACK",
  "keyProgress": "<ul><li>完成原理图设计</li></ul>",
  "nextWeekPlan": "<ul><li>开始PCB布局</li></ul>",
  "riskWarning": "<ul><li>元器件供应周期较长</li></ul>",
  "phaseProgress": {
    "EVT": {
      "progress": "完成原理图设计",
      "risks": "元器件供应周期较长",
      "schedule": "2026-02-10 ~ 2026-02-28"
    }
  },
  "attachments": [
    { "id": "1708012345678", "name": "20260216_100035_0821.png", "url": "/uploads/20260216_100035_0821.png", "uploadedAt": "2026-02-16T10:00:00.000Z", "section": "keyProgress" }
  ]
}
```

**必填字段：**
- `projectId`: 所属项目
- `weekStart`: 周开始日期（系统自动计算年份和周数）
- `weekEnd`: 周结束日期

**自动计算：** 后端根据 `weekStart` 自动计算 `year` 和 `weekNumber`

**唯一性检查：** 同一项目同一周只能有一份周报，重复创建返回 400 错误

#### 更新周报
```
PUT /api/weekly-reports/:id
```
**认证：** Bearer Token
**权限：** `weekly_report:update`
**请求体：** 同创建（所有字段可选，支持修改周次）

**周次修改检查：** 如果修改 `weekStart` 和 `weekEnd`，系统会检查新周次是否已存在周报

#### 提交周报
```
POST /api/weekly-reports/:id/submit
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**操作：**
- 将状态从 `DRAFT` 改为 `SUBMITTED`
- 设置 `submittedAt` 为当前时间

#### 删除周报
```
DELETE /api/weekly-reports/:id
```
**认证：** Bearer Token
**权限：** `weekly_report:delete`

#### AI 智能建议
```
POST /api/weekly-reports/project/:projectId/ai-suggestions
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**请求体：**
```json
{
  "weekStart": "2026-02-10",
  "weekEnd": "2026-02-16"
}
```

**分析逻辑：**
1. 若配置了 `AI_API_KEY` 和 `AI_API_URL`，调用外部 AI（默认 gpt-4o-mini）生成周报建议
2. 若 AI 调用失败或未配置，使用基于规则的智能生成

**数据来源：**
- 本周已完成的活动（endDate 在本周范围内且状态为 COMPLETED）
- 进行中的活动（status = IN_PROGRESS）
- 未开始的活动（status = NOT_STARTED）
- 延期的活动（status = DELAYED）
- 逾期未完成的活动（planEndDate < 当前日期 且 status ≠ COMPLETED）

**规则引擎生成逻辑：**

**本周重要进展：**
- 列出本周已完成的活动（带负责人）
- 列出前3个进行中的活动
- 如无进展则提示"本周暂无重大进展"

**下周工作计划：**
- 列出进行中和未开始的活动（最多5个）
- 进行中的显示"继续推进"，未开始的显示"计划启动"

**风险预警：**
- 如有逾期任务，标红提示逾期数量和任务名称
- 如有延期任务，标黄提示延期数量
- 如无风险则返回空字符串

**响应（200）：**
```json
{
  "keyProgress": "<ul><li><strong>原理图设计</strong>已完成（负责人：张三）</li></ul>",
  "nextWeekPlan": "<ul><li>继续推进<strong>PCB布局</strong>（负责人：李四）</li></ul>",
  "riskWarning": "<ul><li><span style=\"color: #ff4d4f;\">⚠️ 存在2个逾期任务</span>：元器件选型、供应商评估</li></ul>"
}
```

### 3.7 文件上传

#### 上传文件
```
POST /api/uploads
```
**认证：** Bearer Token
**Content-Type：** multipart/form-data
**字段名：** `file`

**文件限制：**
- 最大大小：10MB
- 允许类型：图片（png/jpeg/gif/webp/svg）、PDF、Word（doc/docx）、Excel（xls/xlsx）、ZIP、TXT

**文件重命名：** 上传后文件以时间戳重命名，格式为 `yyyyMMdd_HHmmss_NNNN.ext`（如 `20260216_100035_0821.png`），`NNNN` 为4位随机数。

**响应（200）：**
```json
{
  "name": "20260216_100035_0821.png",
  "url": "/uploads/20260216_100035_0821.png",
  "size": 102400,
  "mimetype": "image/png"
}
```
- `name`: 时间戳重命名后的文件名（非原始文件名）

#### 删除文件
```
DELETE /api/uploads/:filename
```
**认证：** Bearer Token
**说明：** 删除附件时同步清理服务器存储文件，释放磁盘空间。`filename` 使用 `path.basename` 安全处理防止路径遍历。

**响应（200）：**
```json
{ "message": "文件已删除" }
```

## 4. 项目进度自动计算

当活动被创建、更新或删除时，系统自动重新计算项目进度：
- 取项目下所有活动的状态
- 基于状态计算进度：
  - COMPLETED（已完成）= 100%
  - IN_PROGRESS（进行中）= 50%
  - 其他状态（未开始/已取消）= 0%
- **按 planDuration（计划工期）加权平均**：
  - 每个活动的权重 = `planDuration`（工作日数）
  - 无 `planDuration` 的活动 fallback 权重为 1
  - 最终进度 = Σ(活动进度 × 权重) / Σ(权重)
- 四舍五入到小数点后两位
- 自动更新 Project.progress 字段

**实现文件：** `server/src/utils/projectProgress.ts`

**说明：** 活动表不再包含 progress 字段，进度完全基于状态和工期加权自动计算，工期长的活动对整体进度影响更大

## 5. 前端页面

### 5.1 项目列表页 `/projects`（系统首页）

- **顶部统计卡片：** 全部项目、进行中、已完成、已搁置。数据来自后端接口（不受分页影响），点击卡片可筛选对应状态（再次点击取消筛选），选中卡片高亮显示蓝色边框和投影。"全部项目"卡片点击清除状态筛选。
- **表格展示：** 项目名称（可点击进入详情，无排序）、产品线标签（蒲公英=蓝色、向日葵=橙色）、状态标签（无排序）、优先级标签（可排序）、进度条（可排序）、负责人（纯文字姓名）、时间（可排序）、活动数。表格使用 Arco 默认间距（非紧凑模式）
- **排序：** 默认按开始时间升序排列（从远到近，最早的项目在上），优先级/进度/时间列支持点击表头排序
- **项目搜索：** 表格标题栏右侧搜索框，按项目名称模糊搜索，300ms 防抖。
- **产品线快速筛选：** 表格标题栏右侧显示产品线 Toggle 标签（蒲公英/向日葵），`size="medium"` + `fontSize: 14` + `padding: 3px 12px`，默认全部选中，点击切换选中状态，至少保留一个。全部选中时不传筛选参数，部分选中时传逗号分隔值。筛选结果包含选中产品线 + 未分配产品线的项目。
- **新建项目按钮**（需 `project:create` 权限）
- **编辑/删除按钮**（需对应权限）
- **新建/编辑表单**：以右侧抽屉（Drawer，宽度 600px）方式展现，表单字段：
  - 项目名称（必填）
  - 项目描述（TextArea，3行）
  - 产品线（必填）/ 状态（必填，默认PLANNING）/ 优先级（必填，默认MEDIUM）一行三列
  - 时间（RangePicker，独占一行）
  - 项目经理（必填）/ 协作者（多选，可选，maxTagCount=2）一行两列。协作者下拉选项实时排除当前选中的项目经理；切换项目经理时，若新经理已在协作者中则自动移除
- **分页：** 每页 20 条

### 5.2 项目详情页 `/projects/:id`

- **统计卡片区域：** 时间、整体进度、活动数量、项目经理、协作者（5 卡片等高 88px）
  - **协作者卡片：** 显示协作者姓名 Tag 列表，底部"管理"按钮（仅项目经理和管理员可见）。点击"管理"打开 Modal：
    - 当前协作者列表（带移除按钮）
    - 用户搜索 Select 下拉框添加新协作者（排除已有协作者和项目经理）
- **顶部区域：** 返回按钮、项目名称、状态标签、基本信息（负责人、优先级、时间、进度条、描述）
- **Tab 切换：**
  - **活动列表：** 扁平表格（无树形展开），使用紧凑样式（`.compact-table` wrapper，cell padding `6px`），支持拖拽排序（通过拖拽手柄上下拖动行，松手后自动保存排序至数据库）。列依次为：拖拽手柄、ID（3位序号如001/002/003，按活动顺序自动生成）、前置（前置活动的3位序号，宽度100px）、阶段（EVT/DVT/PVT/MP Tag，宽度80px）、活动名称（宽度240px）、类型（宽度80px）、状态（宽度100px）、负责人（宽度120px）、工期（宽度70px）、计划开始（格式 `YY年MM月DD日`，宽度140px）、计划结束（格式 `YY年MM月DD日`，宽度140px）、实际开始（格式 `YY年MM月DD日`，宽度140px，实际开始晚于计划开始时文字标红 `rgb(var(--danger-6))`）、实际结束（格式 `YY年MM月DD日`，宽度140px，实际结束晚于计划结束时文字标红 `rgb(var(--danger-6))`）、实际工期（宽度80px）、备注（宽度240px，文本 `maxWidth: 100%` 自适应列宽）、操作（宽度100px，`fixed: 'right'`，居左对齐，编辑/删除图标间距2px）。工具栏右侧提供一个蓝色的\"活动\"（IconNav图标）下拉组按钮，点击/悬停展示三个子菜单：\"新建活动\"（IconPlus 图标）、\"批量导入\"（IconUpload 图标）和\"导出活动\"（IconDownload 图标）。\"活动\"按钮右侧为\"撤回\"按钮（IconUndo 图标），无可撤回操作时置灰（disabled），有可撤回操作时可点击；hover 显示 Tooltip（最近一次操作描述或"没有可撤回的操作"）；点击后弹出 `Modal.confirm` 确认弹窗，显示即将撤回的操作描述（如"撤回对活动「XX」的编辑"），用户确认后执行撤回。撤回栈支持以下操作类型：活动编辑（抽屉表单/内联编辑）、活动删除、批量删除、批量导入、批量状态/阶段/负责人修改、拖拽排序。新建/编辑以右侧抽屉（Drawer）方式展现，表单布局：第一行为阶段（必选）和活动名称；描述；类型/状态/优先级一行三列；「时间」分隔区下计划时间和实际时间上下排列（各含时间范围选择器和工期输入框，支持双向自动计算）；负责人（仅显示姓名）；前置依赖；备注。**日期校验：** 计划时间和实际时间区域中，如果输入的结束时间早于开始时间，弹出 `Message.error('结束时间不能早于开始时间')` 提示并阻止保存。抽屉底部按钮行：左侧为\"批量导入\"按钮（仅新建时显示），右侧为\"取消\"和\"创建/保存\"按钮。
    - **批量导入活动：** 有两个入口：① 活动下拉菜单中的\"批量导入\"子菜单，点击后弹出导入 Modal（宽度640px）；② 新建活动抽屉底部的\"批量导入\"按钮，点击后弹出文件选择器。Modal 中央为虚线边框+灰色背景的拖拽区域（`margin: 0 32px`），支持拖拽文件或点击选择文件（`.xlsx/.xls`，最大5MB）。上传后系统自动识别列并批量创建活动。成功后提示"导入成功，共 N 条活动（跳过 M 条重复）"，并将撤回操作压入撤回栈（可通过工具栏撤回按钮撤回）。若有自动创建的联系人账号则另行提示。导入完成后自动关闭弹窗，并刷新活动列表和项目数据。Modal 底部显示提示文字：支持的列名（活动名称/任务描述、阶段、负责人、工期、计划开始/结束、状态、备注）和去重规则。
    - **删除活动：** 删除父活动时自动级联删除所有子孙活动，确认弹窗提示"确定要删除活动及其所有子活动吗？"。删除成功后提示"已删除活动「XX」"，并将撤回操作压入撤回栈。
    - **批量删除：** 勾选多行后点击批量删除按钮，确认后删除所有选中活动。删除成功后提示"已删除 N 个活动"，并将撤回操作压入撤回栈。
    - **工具栏筛选区域（表格右上方）：**
      - **阶段工期合计标签：** 按 EVT/DVT/PVT/MP 分组统计计划工期总天数，以彩色 Tag 显示（颜色与阶段列一致：EVT=蓝、DVT=青、PVT=紫、MP=橙）。工期为 0 的阶段自动隐藏。点击标签可筛选该阶段活动（再次点击取消筛选），未选中时标签变灰色半透明。
      - **状态快速筛选：** "未开始 N" / "进行中 N"，点击筛选对应状态（再次点击取消）。
      - 阶段筛选和状态筛选可叠加使用。
    - **负责人选择器搜索：** 内联编辑负责人下拉框支持 `showSearch` + `filterOption`，输入关键字自动联想匹配姓名。

    **单击快速编辑功能：**
    - **支持字段：** 活动名称、阶段、类型、状态、负责人、计划时间、工期、实际开始、实际结束、前置依赖、备注
    - **交互方式：** 单击单元格进入编辑模式，失焦或按Enter保存，按Esc退出编辑。全局 click-outside 监听器自动关闭编辑（忽略弹出层内的点击）
    - **编辑器类型：**
      - 活动名称 / 备注：Input 输入框（autoFocus，onBlur/onPressEnter 提交）
      - 阶段 / 类型 / 状态：AutoOpenSelect（自动弹出下拉，选择后自动保存）
      - 负责人：AutoOpenSelect（支持搜索 showSearch，选择后自动保存）
      - 计划时间：AutoOpenRangePicker（受控 popupVisible 保持弹窗打开，选完开始和结束日期后 onChange 触发保存并关闭）
      - 实际开始 / 实际结束：DatePicker（受控 popupVisible，选择日期后 API 更新完成再关闭）
      - 工期：InputNumber 数值输入框（suffix="天"）
      - 前置依赖：Input 文本输入框（MS Project 格式，如 `3FS+2, 5`）
    - **日期校验（内联编辑）：** 修改计划开始/结束、实际开始/结束日期时，如果结果导致结束时间早于开始时间，弹出 `Message.error` 提示并取消编辑
    - **前置依赖 Tooltip：** 鼠标悬停前置依赖列中的序号时，显示 Tooltip 内容为依赖活动的名称 + 依赖类型（FS/SS/FF/SF）+ Lag 天数
    - **智能保存：**
      - 内容无变更时静默退出编辑，不显示提示
      - 内容有变更时显示"更新成功"提示，并将撤回操作压入撤回栈
      - 可通过工具栏撤回按钮恢复原值
    - **本地更新：** 保存后调用 API 更新并刷新活动列表
    - **权限检查：** 需要 `activity:update` 权限且为项目经理，有权限的字段鼠标悬停显示 pointer 光标
    - **自动计算：** 修改计划时间时自动计算工期，更新时同步更新工期字段
    - **依赖限制：** 已设置前置依赖的活动，计划时间不可手动编辑（点击提示"已设置前置依赖，计划时间由系统自动计算"）

    **导出功能：**
    - **入口：** 活动列表工具栏 \"活动\" 下拉按钮中的 \"导出活动\" 子菜单
    - **方式：** 客户端生成 CSV 文件（BOM 头 + UTF-8 编码，兼容 WPS/Excel）
    - **列：** ID序号、前置依赖、阶段、活动名称、类型、状态、负责人、计划工期、计划开始、计划结束、实际开始、实际结束、备注
    - **文件名：** `{项目名}_活动列表_{YYYY-MM-DD}.csv`
    - **备注：** 服务端 ExcelJS 导出端点 `GET /api/activities/project/:projectId/export-excel` 保留可用，但前端默认使用客户端 CSV 导出（避免 Chrome HTTP 页面下载 xlsx 被阻止）

    **前端架构：** 项目详情页代码已模块化拆分，主要 hooks 和组件：

    | 模块 | 文件路径 | 职责 |
    |------|---------|------|
    | `useUndoStack` | `client/src/hooks/useUndoStack.ts` | undo 栈管理、pushUndo、handleUndo |
    | `useProjectData` | `client/src/hooks/useProjectData.ts` | 项目/活动/用户数据加载、刷新 |
    | `useColumnPrefs` | `client/src/hooks/useColumnPrefs.ts` | 列偏好持久化（localStorage） |
    | `useInlineEdit` | `client/src/hooks/useInlineEdit.ts` | 内联编辑状态、startEdit、commitEdit、click-outside |
    | `useDragReorder` | `client/src/hooks/useDragReorder.ts` | 拖拽排序逻辑 |
    | `useActivityColumns` | `client/src/hooks/useActivityColumns.tsx` | 列定义 + 渲染逻辑（含日期校验、红色高亮、Tooltip） |
    | `useDebouncedCallback` | `client/src/hooks/useDebouncedCallback.ts` | 通用防抖 hook（300ms 延迟） |
    | `ActivityDrawer` | `client/src/pages/Project/Detail/ActivityDrawer.tsx` | 新建/编辑活动抽屉 |
    | `MembersModal` | `client/src/pages/Project/Detail/MembersModal.tsx` | 项目成员管理弹窗 |

  - **项目快照（`SnapshotsTab` 组件，独立 Tab）：**
    - **概念：** 类似在线文档的版本管理，保存项目某一时刻的全量数据快照
    - **快照列表：** 顶部显示快照数量统计 + "创建快照"按钮（需 `project:update` 权限 + 项目管理权限）。使用 Timeline 组件展示快照历史，每条显示时间、创建人姓名、备注 Tag、"查看"按钮
    - **创建快照：** 点击"创建快照"弹出 Modal，含备注输入框（TextArea，可选，200 字限制）。提交后保存项目全量数据（活动、产品、周报、风险评估）
    - **查看快照：** 点击"查看"通过路由 `/projects/:id/snapshot/:snapshotId` 导航，复用项目详情页以只读模式展示快照数据。页面顶部显示蓝色信息横幅（Alert），包含"返回项目"按钮、快照时间和备注。排期工具和项目快照 Tab 在快照模式下隐藏
    - **快照模式下默认选中活动列表 Tab**（因排期工具和项目快照 Tab 被隐藏）
    - **空状态：** 无快照时显示 Empty 组件，提示"暂无快照，点击「创建快照」保存项目当前状态"

  - **甘特图：** 横向时间轴，支持多视图模式。每个任务显示双条：上方细虚线条为计划时间，下方粗实线条为实际时间（带进度填充和状态颜色）。里程碑用渐变菱形标记，红色竖线标记今天。
    - **图例显示：**
      - 计划条：浅灰色虚线框
      - 里程碑：橙色菱形
      - 状态颜色：已完成（绿色）、进行中（蓝色）、未开始（灰色）、已延期（红色）、已取消（深灰）
    - **进度填充：** 基于活动状态自动计算（已完成=100%，进行中=50%，其他=0%）
    - **悬停信息：** 显示活动名称、计划时间、实际时间、工期对比、状态、负责人
    - **视图模式切换：** 支持日/周/月/季度/年五种粒度，默认"月"视图。不同模式对应不同 dayWidth（日=36, 周=20, 月=6, 季度=2, 年=0.5），头部按对应粒度分组显示。
    - **时间范围选择：** RangePicker 可手动限定显示的日期区间，默认自动从任务数据中取 min/max（前后各扩展3天）。重置按钮恢复自动范围。
    - **时间轴冻结（sticky header）：** 甘特图时间轴表头在页面纵向滚动时保持固定在导航栏下方（`position: sticky; top: 56px`）。实现采用 header/body 分离方案——表头独立于可横向滚动的 body 区域，通过 JS `onScroll` 将 body 的 `scrollLeft` 同步到 header。由于 Ant Design Card/Tabs 内部设置了 `overflow: hidden`，需在 `global.css` 中通过 `.gantt-card` 类对 Card → card-body → tabs-content → active tabpane 添加 `overflow: visible !important` 覆盖，使 sticky 能穿透祖先容器生效。该 className 仅在甘特图 Tab 激活时添加到 Card 上。
  - **AI风险评估（`RiskAssessmentTab` 组件）：**
    - **顶部工具栏：** 左侧评估记录计数（有记录时显示"共 N 次评估记录"，无记录时为空），右侧"发起评估"主按钮（闪电图标，loading 状态）
    - **最新评估卡片（`RiskCard`）：** 左侧 4px 彩色边框（低=绿色、中=橙色、高=红色、极高=深红），标题行显示"最新评估"标签 + 风险等级 Tag + 评估来源 Tag + 评估时间；风险因素列表（灰色背景条目，每条含严重程度 Tag + 因素名 + 描述，可点击展开关联任务列表）；改进建议（有序列表）
    - **历史记录区域：** 历史评估卡片列表（样式更紧凑，无左侧彩色边框高亮，每条右侧有删除按钮）
    - **风险趋势图：** 当历史记录 ≥ 2 条时，在最新评估卡片上方展示折线趋势图（ECharts），X 轴为评估时间，Y 轴为风险等级（低/中/高/严重），悬浮提示显示时间 + 等级 + 来源
    - **空状态：** 无评估记录时，工具栏计数区域为空，页面主体显示单一 Empty 组件（提示："暂无评估记录，点击「发起评估」开始"）
  - **项目周报：** 周报列表、创建/编辑周报、AI 智能分析。

### 5.3 项目周报页面（项目详情 Tab）

**周报列表：**
- **顶部操作栏：**
  - 左侧：显示"共 X 份周报"统计
  - 右侧："创建周报"按钮（需 `weekly_report:create` 权限 + 项目管理权限，点击时自动检测本周是否已有周报，如有则跳转编辑）
- **卡片展示：** 使用 Card 组件展示每份周报
  - **卡片标题：**
    - 左侧：进展状态图标（ON_TRACK=绿色✓ / MINOR_ISSUE=黄色⚠️ / MAJOR_ISSUE=红色✕）
    - 周次：如"2026 年第 7 周"
    - 日期范围：如"02-10 ~ 02-16"
    - 状态标签：草稿（灰色）/ 已提交（绿色）/ 已归档（橙色）
    - 进展状态文字：顺利进行 / 轻度阻碍 / 严重阻碍
  - **卡片内容（三列布局 Row/Col span=8）：**
    - 本周重要进展（HTML渲染）+ 该区域附件标签
    - 下周工作计划（HTML渲染，左边框分隔）+ 该区域附件标签
    - 风险预警（HTML渲染，红色标题，左边框分隔；无风险显示绿色"✓ 无风险"）+ 该区域附件标签
    - **附件显示：** 按 section 字段筛选各区域附件，同行 flex-wrap 排列（图片附件绿色图标 + 点击遮罩层预览，非图片附件蓝色图标 + 点击新窗口打开）
  - **卡片底部：**
    - 左侧：创建人姓名
    - 右侧：提交时间（已提交才显示）
  - **卡片操作（仅创建人、项目经理、协作者或管理员可见）：**
    - 编辑按钮（所有周报都可编辑）
    - 提交按钮（仅草稿状态显示，需确认）
    - 删除按钮（需 `weekly_report:delete` 权限，需确认）
- **空状态：** 无周报时显示 Empty 组件

**创建/编辑周报表单：**
- **布局：** 全屏页面，非抽屉模式
- **头部区域：**
  - 返回箭头 + "创建周报"/"编辑周报"标题
  - 右侧："AI 智能分析"按钮（灯泡图标，主色调虚线样式）
  - 周次选择器（DatePicker week 模式，支持选择任意周）
  - 日期范围显示（只读，如"02-10 ~ 02-16"）
  - 项目状态选择（Radio.Group，三个选项带图标和颜色）
- **进展与计划区域：**
    - **本周重要进展**（左右分栏 Grid 布局，`alignItems: stretch`）
      - 左侧：RichTextEditor（wangEditor，minHeight 150px）+ AttachmentList 组件
      - 右侧（仅在 AI 分析后显示，固定宽度 400px）：AI 建议卡片（`height: 100%`, `overflow: auto`，高度与左侧保持一致）
        - 卡片标题区域显示"AI 建议："文字 + "采用"按钮（点击将建议 HTML 填入编辑器）
        - 卡片内容：HTML 渲染的 AI 建议
    - **下周工作计划**（同上布局，含附件功能）
    - **风险预警**（选填，同上布局，minHeight 120px）
      - AI 建议卡片特殊处理：如无风险显示绿色"✓ 未发现明显风险"提示
    - **附件功能（内联于各编辑区）：**
      - 每个编辑区（keyProgress / nextWeekPlan / riskWarning）独立管理附件
      - **上传方式：**
        1. 点击 AttachmentList 的"上传附件"按钮：Arco Upload 组件，支持 png/jpg/gif/webp/pdf/doc/docx/xls/xlsx/zip/txt
        2. 拖拽文件到 AttachmentList 区域：视觉反馈（蓝色虚线边框 + 蓝色背景）
        3. 在 RichTextEditor 内 Ctrl+V / Cmd+V 粘贴：通过 monkey-patch `editor.insertData`（Slate 层面）拦截所有粘贴文件（包括图片），调用 `onPasteFiles` 回调上传为附件，阻止 wangEditor 默认的内联图片处理
      - **上传处理：** 调用 `POST /api/uploads` 上传文件，返回时间戳重命名的文件名
      - **附件列表（AttachmentList）：** 编辑器下方显示已上传附件
        - 多个附件同行排列（`flex-wrap` 布局），每个附件为紧凑 chip 样式（图标 + 文件名 + 删除按钮，`maxWidth: 260px`）
        - 图片附件：绿色 IconImage 图标，点击文件名弹出全屏遮罩层预览（`position: fixed`, `zIndex: 9999`），按 ESC 或点击遮罩层关闭
        - 非图片附件：蓝色 IconFile 图标，点击文件名新窗口打开链接
        - 删除按钮：IconDelete，调用 `DELETE /api/uploads/:filename` 清理服务器文件后从列表移除
- **阶段进展区域：**
    - Collapse 折叠面板，四个阶段（EVT/DVT/PVT/MP）
    - 每个阶段包含：
      - 工程周期（Input，如"2026-02-10 ~ 2026-02-16"）
      - 进展描述（TextArea，3行）
      - 风险管理（TextArea，3行）
- **底部操作栏：**
  - 取消按钮
  - 保存草稿按钮（SaveOutlined图标）
  - 提交周报按钮（SendOutlined图标，主按钮样式）

**AI 智能分析功能：**
- **触发方式：** 点击头部"AI 智能分析"按钮
- **分析过程：** 显示 loading 状态
- **结果展示：**
  - 在三个输入框右侧显示 AI 建议卡片
  - 卡片宽度固定400px，支持滚动
  - 每个卡片独立的"采用"按钮
- **采用建议：**
  - 点击"采用"按钮将 AI 建议内容填入对应的编辑器
  - 显示成功提示"已采用 AI 建议"
- **建议内容：**
  - 基于项目活动数据自动分析生成
  - HTML 格式，使用 `<ul><li>` 标签组织
  - 风险预警如无风险则显示绿色提示图标

## 6. 项目周报汇总页面

**路由：** `/weekly-reports`

**入口：** 项目列表页面头部"项目周报"按钮（FileTextOutlined 图标）

### 6.1 页面功能

**页面标题：** 项目周报汇总

**筛选功能：**
- **周次选择器：**
  - 融合设计：[< 按钮] [周次选择器] [> 按钮]
  - 浅灰色背景（#fafafa），圆角 6px，内边距 4px
  - 上一周按钮：LeftOutlined 图标，Tooltip 提示"上一周"
  - 下一周按钮：RightOutlined 图标，Tooltip 提示"下一周"
  - DatePicker：week 模式，无边框，无后缀图标，宽度 180px
  - 默认值：当前周
- **日期范围显示：** MM-DD ~ MM-DD 格式（灰色文字）
- **产品线筛选：** Select 下拉框，支持清除，宽度 180px
  - 选项：全部 / 各产品线选项
  - 默认：全部

**Tab 切换：** 已提交周报 | 草稿箱

#### 已提交周报 Tab

- 按周次分组展示，每组显示"YYYY 年第 N 周 · MM-DD ~ MM-DD"标题
- 筛选功能（周次选择器、产品线筛选）仅在已提交 Tab 显示

**数据表格列：**

| 列名 | 字段 | 宽度 | 说明 |
|------|------|------|------|
| 项目名称 | project.name | 200px | 链接，点击跳转到项目周报详情页（带 tab=weekly 参数） |
| 产品线 | project.productLine | 120px | 显示中文标签 |
| 状态 | progressStatus | 80px | 图标显示（✓ / ⚠️ / ✕），Tooltip 显示文字说明 |
| 变更概述 | changeOverview | 180px | HTML 富文本渲染，maxHeight 80px 溢出隐藏 |
| 需求研判 | demandAnalysis | 180px | HTML 富文本渲染，maxHeight 80px 溢出隐藏 |
| 本周重要进展 | keyProgress | - | HTML 富文本渲染，maxHeight 80px；下方显示该区域附件（readOnly 模式），单元格 overflow: hidden 防止附件名溢出 |
| 下周工作计划 | nextWeekPlan | - | HTML 富文本渲染，maxHeight 80px；下方显示该区域附件（readOnly 模式），单元格 overflow: hidden |
| 风险预警 | riskWarning | 200px | HTML 富文本渲染，无风险显示绿色"无"；下方显示该区域附件（readOnly 模式），单元格 overflow: hidden |
| 操作 | - | 100px | 编辑、删除按钮（权限控制） |

**空状态：** 显示"该周暂无周报"

#### 草稿箱 Tab

- 显示所有草稿周报（不限创建者），分页 20 条/页
- 表格列与已提交 Tab 完全一致（复用 submittedColumns），仅操作列替换为：编辑、提交、删除按钮

**表格设置：**
- 横向滚动（最小宽度 1200px）
- HTML 内容类名：`html-content`

### 6.2 API 接口

**获取指定周次的周报：**
```
GET /api/weekly-reports/week/:year/:weekNumber
Query: productLine (可选)
Response: WeeklyReport[]
```

### 6.3 前端组件

**文件位置：** `/client/src/pages/WeeklyReports/index.tsx`

**主要功能：**
- 周次切换（上一周/下一周/选择器）
- 产品线筛选
- 周报数据表格展示
- 点击项目名称跳转到项目详情

**样式规范：**
- 周次选择器容器：background: #fafafa, borderRadius: 6px, padding: 4px
- 按钮：type="text", size="small", height: 28px
- 图标大小：12px
- DatePicker：size="small", bordered={false}, suffixIcon={null}

## 7. 项目资源看板页面

**路由：** `/workload`
**文件位置：** `/client/src/pages/Workload/index.tsx`

### 7.1 页面布局（从上到下）

**A. 统计卡片（3 列 CSS Grid）**

3 个只读卡片（高度 88px）：
| 卡片 | 颜色 | 数据来源 |
|------|------|----------|
| 逾期任务 | `--status-danger`（红） | `summary.totalOverdue` |
| 无人负责 | `--status-warning`（橙） | `summary.totalUnassigned` |
| 超载人员 | `--status-danger-dark`（深红） | `summary.overloadedCount`（进行中 ≥ 5） |

**B. 人员负载（Card）**

- 标题行：左侧"人员负载"，右侧项目筛选 Select（240px，可搜索、可清除）
- 每人一行：姓名（80px，粗体）+ CSS 堆叠条形图 + 数字标签
  - 条形图（3 段 flex，带 Tooltip）：蓝色=进行中、灰色=未开始、红色=逾期
  - 右侧标签："N进行中 N逾期"
  - 超载人员（inProgress ≥ 5）：红色浅背景 `rgba(245, 63, 63, 0.06)` + 红色 Tag "超载"
- 空状态：Empty 组件

**C. 需关注（Card + Table）**

| 列名 | 宽度 | 说明 |
|------|------|------|
| 类型 | 120px | 圆点图标（红=逾期、橙=无人负责）+ 文字 |
| 活动名称 | - | 可点击，跳转到所属项目详情页 |
| 所属项目 | 180px | 蓝色链接，跳转项目详情 |
| 负责人 | 120px | 姓名列表，无负责人显示"-" |
| 详情 | 160px | 逾期：红色"逾期 N 天"；无人负责：计划时间范围 |

- 排序：逾期在前（天数降序），无人负责在后（开始时间升序）
- 空状态：绿色 "✓ 暂无需关注事项"

### 7.2 API 接口

```
GET /api/activities/workload
Query: projectId (可选)
```

**响应结构：**
```json
{
  "summary": { "totalOverdue": 3, "totalUnassigned": 2, "overloadedCount": 1 },
  "members": [{ "userId", "realName", "username", "totalActivities", "inProgress", "notStarted", "overdue", "totalDuration" }],
  "issues": [{ "type", "activityId", "activityName", "projectId", "projectName", "assigneeNames", "planStartDate", "planEndDate", "overdueDays" }]
}
```

- `members` 按 `(inProgress + overdue)` 降序排列
- `issues` 中逾期按天数降序，无人负责按开始时间升序
- `overloadedCount` = members 中 inProgress ≥ 5 的人数

## 8. 统一搜索框组件

**文件位置：** `/client/src/components/SearchInput.tsx`

**设计规范：**
- 浅灰色背景（#fafafa）
- 无边框设计
- 圆角 6px
- 搜索图标：14px，灰色（#bfbfbf）
- 支持清除按钮
- 默认宽度：200px（可自定义）

**Props：**
```typescript
interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  style?: CSSProperties;
  width?: number;
}
```

**使用页面：**
- 项目列表页
- 产品管理页
- 用户管理页
- 活动列表页

## 9. 富文本编辑器组件

**文件位置：** `/client/src/components/RichTextEditor.tsx`

**基于 wangEditor v5（`@wangeditor/editor` + `@wangeditor/editor-for-react`）的富文本编辑器，用于周报各内容区域。**

**Ref 方法：**
```typescript
interface RichTextEditorRef {
  setHtml: (html: string) => void;  // 外部设置 HTML 内容（如 AI"采用"按钮）
}
```

**Props：**
```typescript
interface RichTextEditorProps {
  value: string;            // HTML 内容
  onChange: (html: string) => void;
  placeholder?: string;     // 默认"请输入内容..."
  minHeight?: number;       // 编辑区最小高度，默认 150px
  onPasteFiles?: (files: File[]) => void;  // 粘贴文件时的回调（所有文件类型，包括图片）
}
```

**工具栏功能：** 加粗、斜体、下划线、字体颜色、背景色 | 标题选择、无序列表、有序列表 | 插入链接、上传图片 | 撤销、重做

**图片上传：** 通过 `editorConfig.MENU_CONF.uploadImage.customUpload` 委托给 `uploadApi.upload()`，上传后内联插入编辑器。

**粘贴拦截：** 通过 monkey-patch `editor.insertData`（Slate 层面），拦截所有粘贴的文件（包括图片），调用 `onPasteFiles` 回调处理上传为附件。当剪贴板只有文件（无文本/HTML）时，阻止 wangEditor 的默认处理（不会内联插入图片）。使用 `patchedRef` 避免重复 patch。

**内容规范化：** `onChange` 回调中将空内容 `<p><br></p>` 规范化为空字符串。

**生命周期：** `useEffect` cleanup 调用 `editor.destroy()` 防止内存泄漏。

## 9.1 附件列表组件

**文件位置：** `/client/src/components/AttachmentList.tsx`

**Props：**
```typescript
interface AttachmentListProps {
  attachments: ReportAttachment[];  // 当前区域的附件列表
  onChange?: (attachments: ReportAttachment[]) => void;  // readOnly 模式下可省略
  section: string;  // keyProgress | nextWeekPlan | riskWarning
  readOnly?: boolean;  // 只读模式（默认 false）
}
```

**readOnly 模式（查看页面）：**
- 仅展示附件列表，无上传按钮、拖拽区域和删除按钮
- 附件为空时返回 null（不渲染任何内容）
- 图片附件点击弹出全屏遮罩层预览，非图片附件点击新窗口打开
- 用于周报卡片视图（ProjectWeeklyTab）和周报汇总表格（WeeklyReportsSummary）

**编辑模式（默认）：**

**上传方式：**
1. 点击"上传附件"按钮（Arco Upload 组件，`autoUpload: false`）
2. 拖拽文件到组件区域（`onDragEnter/Leave/Over/Drop` + `dragCounter` ref 处理嵌套元素）
3. 在 RichTextEditor 内粘贴（通过 `onPasteFiles` prop 传递）

**附件展示：**
- 多个附件同行排列（`flex-wrap` 布局，`gap: 6px`）
- 每个附件为紧凑 chip（图标 + 文件名 + 删除按钮），`maxWidth: 260px`，文件名超长时 `text-overflow: ellipsis`
- 图片附件：绿色 IconImage 图标，点击弹出全屏遮罩层预览（`position: fixed`, `zIndex: 9999`, `background: rgba(0,0,0,0.72)`），右上角关闭按钮，按 ESC 或点击遮罩背景关闭
- 非图片附件：蓝色 IconFile 图标，点击新窗口打开

**图片判断：** 根据 URL 后缀判断 `/\.(png|jpe?g|gif|webp|svg)(\?|$)/i`

**删除：** 调用 `uploadApi.delete(filename)` 清理服务器文件（静默处理失败），然后从列表移除。

## 10. 环境变量

| 变量 | 说明 |
|------|------|
| AI_API_KEY | 外部 AI API 密钥（为空则使用规则引擎） |
| AI_API_URL | 外部 AI API 地址（为空则使用规则引擎） |
