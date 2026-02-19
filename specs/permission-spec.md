# 权限管理模块规格说明书

## 1. 模块概述

权限管理模块实现基于角色的访问控制（RBAC）。系统通过"用户 → 角色 → 权限"三级结构控制功能访问。权限以"资源:操作"的粒度定义，支持通配符（`*`）表示全部。

## 2. 数据模型

### Role（角色表 `roles`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 角色唯一标识 |
| name | String | UNIQUE, NOT NULL | 角色名称 |
| description | String | NULLABLE | 角色描述 |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 创建时间 |

### Permission（权限表 `permissions`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 权限唯一标识 |
| resource | String | NOT NULL | 资源名称 |
| action | String | NOT NULL | 操作名称 |

**联合唯一约束：** `[resource, action]`

### UserRole（用户-角色关联表 `user_roles`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| userId | UUID | FK → users.id, CASCADE | 用户ID |
| roleId | UUID | FK → roles.id, CASCADE | 角色ID |

**联合主键：** `[userId, roleId]`

### RolePermission（角色-权限关联表 `role_permissions`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| roleId | UUID | FK → roles.id, CASCADE | 角色ID |
| permissionId | UUID | FK → permissions.id, CASCADE | 权限ID |

**联合主键：** `[roleId, permissionId]`

## 3. 权限定义

### 资源（Resource）

| 值 | 显示名 |
|----|--------|
| project | 项目 |
| activity | 活动 |
| product | 产品 |
| weekly_report | 周报 |
| user | 用户 |
| role | 角色 |
| * | 全部 |

### 操作（Action）

| 值 | 显示名 |
|----|--------|
| create | 创建 |
| read | 查看 |
| update | 编辑 |
| delete | 删除 |
| * | 全部 |

### 项目管理权限（所有权检查）

除 RBAC 权限外，项目相关的写操作（编辑项目、管理活动、管理周报）还需通过所有权检查。以下三类用户拥有项目管理权限：

1. **系统管理员**：拥有 `*:*` 权限
2. **项目经理**：`project.managerId === currentUserId`
3. **项目协作者**：`project_members` 表中存在 `[projectId, userId]` 记录

后端通过 `canManageProject(req, managerId, projectId)` 统一判断，前端通过 `isProjectManager(managerId, projectId?)` 统一判断。

**协作者管理**：仅项目经理和管理员可以添加/移除协作者，协作者本身不能管理协作者列表。

### 权限格式
权限以 `resource:action` 字符串表示，例如：
- `project:create` - 创建项目
- `product:read` - 查看产品
- `*:*` - 全部权限（超级管理员）

### 权限匹配规则
用户具有某个权限，当其任一角色包含以下任一权限时：
1. 精确匹配：`resource:action`
2. 资源通配：`*:action`
3. 操作通配：`resource:*`
4. 全通配：`*:*`

## 4. 预设角色

| 角色名称 | 权限 | 说明 |
|----------|------|------|
| 系统管理员 | `*:*` | 拥有所有权限 |
| 项目经理 | `project:*`, `activity:*`, `weekly_report:*` | 管理项目、活动和周报 |
| 产品经理 | `product:*`, `project:read` | 管理产品，查看项目 |
| 只读成员 | `project:read`, `activity:read`, `product:read`, `weekly_report:read`, `user:read`, `role:read` | 只读查看 |

## 5. API 接口

### 5.1 角色管理

#### 获取角色列表
```
GET /api/roles
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**响应（200）：**
```json
[
  {
    "id": "uuid",
    "name": "系统管理员",
    "description": "拥有所有权限",
    "createdAt": "...",
    "rolePermissions": [
      {
        "roleId": "uuid",
        "permissionId": "uuid",
        "permission": { "id": "uuid", "resource": "*", "action": "*" }
      }
    ],
    "_count": { "userRoles": 1 }
  }
]
```

#### 获取所有权限列表
```
GET /api/roles/permissions
```
**认证：** Bearer Token
**权限：** 无（已认证即可）

**响应（200）：**
```json
[
  { "id": "uuid", "resource": "activity", "action": "create" },
  { "id": "uuid", "resource": "activity", "action": "delete" },
  ...
]
```

#### 创建角色
```
POST /api/roles
```
**认证：** Bearer Token
**权限：** `role:create`

**请求体：**
```json
{
  "name": "测试工程师",
  "description": "负责测试验证",
  "permissionIds": ["uuid1", "uuid2"]
}
```

**响应（201）：** 创建的角色对象（含 rolePermissions）

#### 更新角色
```
PUT /api/roles/:id
```
**认证：** Bearer Token
**权限：** `role:update`

**请求体：**
```json
{
  "name": "测试工程师",
  "description": "负责测试验证和报告",
  "permissionIds": ["uuid1", "uuid2", "uuid3"]
}
```
- 更新权限时先删除旧关联再创建新关联（全量替换）

#### 删除角色
```
DELETE /api/roles/:id
```
**认证：** Bearer Token
**权限：** `role:delete`

**安全检查：**
- 删除前检查角色是否已分配给用户
- 若是则返回 400：`该角色已分配给 N 个用户，请先取消分配后再删除`

**响应：** `{ "success": true }`

### 5.2 用户管理

#### 获取用户列表
```
GET /api/users?page=1&pageSize=20&keyword=张
```
**认证：** Bearer Token
**权限：** `user:read`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | Number | 页码，默认 1 |
| pageSize | Number | 每页数量，默认 20 |
| keyword | String | 按用户名/姓名/邮箱模糊搜索（不区分大小写） |

**响应（200）：**
```json
{
  "data": [
    {
      "id": "uuid",
      "username": "zhangsan",
      "email": "zhangsan@hwsystem.com",
      "realName": "张三",
      "phone": "13800138001",
      "status": "ACTIVE",
      "createdAt": "...",
      "roles": [{ "id": "uuid", "name": "项目经理", "description": "..." }]
    }
  ],
  "total": 3,
  "page": 1,
  "pageSize": 20
}
```

#### 创建用户
```
POST /api/users
```
**认证：** Bearer Token
**权限：** `user:create`

**请求体：**
```json
{
  "username": "wangwu",
  "email": "wangwu@hwsystem.com",
  "password": "123456",
  "realName": "王五",
  "phone": "13800138003",
  "roleIds": ["uuid1", "uuid2"]
}
```

**错误响应：**
- `400` - 用户名或邮箱已存在

#### 更新用户
```
PUT /api/users/:id
```
**认证：** Bearer Token
**权限：** `user:update`

**请求体：**
```json
{
  "email": "new@hwsystem.com",
  "realName": "王五五",
  "phone": "13900139000",
  "status": "DISABLED",
  "roleIds": ["uuid1"],
  "password": "newpassword（可选，留空不修改）"
}
```
- 更新角色时先删除旧关联再创建新关联（全量替换）

#### 删除用户
```
DELETE /api/users/:id
```
**认证：** Bearer Token
**权限：** `user:delete`

**安全检查：**
- 删除前检查用户是否为任何项目的项目经理
- 若是则返回 400：`该用户是 N 个项目的项目经理，请先转移项目经理后再删除`

**响应：** `{ "success": true }`

## 6. 权限检查中间件

权限检查通过 `requirePermission(resource, action)` 中间件实现：

1. 从 JWT 中获取 `userId`
2. 查询该用户所有角色的所有权限
3. 检查是否存在匹配的权限（支持通配符）
4. 无权限返回 `403 { "error": "权限不足" }`

### 各接口权限要求汇总

| 接口 | 权限 |
|------|------|
| GET /api/projects | 已认证 |
| POST /api/projects | project:create |
| PUT /api/projects/:id | project:update |
| DELETE /api/projects/:id | project:delete |
| GET /api/activities/project/:id | 已认证 |
| POST /api/activities | activity:create |
| PUT /api/activities/:id | activity:update |
| DELETE /api/activities/:id | activity:delete |
| GET /api/products | 已认证 |
| POST /api/products | product:create |
| PUT /api/products/:id | product:update |
| DELETE /api/products/:id | product:delete |
| GET /api/users | user:read |
| POST /api/users | user:create |
| PUT /api/users/:id | user:update |
| DELETE /api/users/:id | user:delete |
| GET /api/roles | 已认证 |
| POST /api/roles | role:create |
| PUT /api/roles/:id | role:update |
| DELETE /api/roles/:id | role:delete |
| GET /api/weekly-reports | 已认证 |
| POST /api/weekly-reports | weekly_report:create |
| PUT /api/weekly-reports/:id | weekly_report:update |
| DELETE /api/weekly-reports/:id | weekly_report:delete |
| POST /api/weekly-reports/:id/submit | 已认证 |
| GET /api/projects/:id/members | 已认证 |
| POST /api/projects/:id/members | project:update（仅项目经理或管理员） |
| DELETE /api/projects/:id/members/:userId | project:update（仅项目经理或管理员） |
| GET /api/ai-config | user:read |
| POST /api/ai-config | user:update |
| PUT /api/ai-config/:id | user:update |
| DELETE /api/ai-config/:id | user:update |
| POST /api/ai-config/test-connection | user:update |
| GET /api/ai-config/usage-stats | user:read |

### 5.3 AI 配置管理

#### 获取配置列表
```
GET /api/ai-config
```
**认证：** Bearer Token
**权限：** `user:read`

**响应（200）：** AI 配置数组，apiKey 脱敏显示（`****` + 末4位）

#### 创建配置
```
POST /api/ai-config
```
**认证：** Bearer Token
**权限：** `user:update`

**请求体：**
```json
{
  "name": "GPT-4o 风险评估",
  "apiKey": "sk-...",
  "apiUrl": "https://api.openai.com/v1/chat/completions",
  "modelName": "gpt-4o-mini",
  "features": "risk,weekly_report"
}
```
- `features` 为逗号分隔字符串，可选值：`risk`（风险评估）、`weekly_report`（周报建议）
- 创建时自动从其他配置中移除已绑定的功能（每个功能只绑定一个配置）

#### 更新配置
```
PUT /api/ai-config/:id
```
**认证：** Bearer Token
**权限：** `user:update`
- apiKey 字段若以 `****` 开头则忽略（不覆盖）

#### 删除配置
```
DELETE /api/ai-config/:id
```
**认证：** Bearer Token
**权限：** `user:update`

#### 验证连接
```
POST /api/ai-config/test-connection
```
**认证：** Bearer Token
**权限：** `user:update`

**请求体：** `{ apiUrl, apiKey, modelName, configId? }`
- 发送最小请求（`max_tokens: 5`）验证 API 连接
- 编辑模式下 apiKey 为掩码时，传 `configId` 从数据库读取真实 key

#### 获取使用统计
```
GET /api/ai-config/usage-stats?startDate=2025-01-01&endDate=2025-12-31
```
**认证：** Bearer Token
**权限：** `user:read`

**响应（200）：**
```json
{
  "totals": { "callCount": 10, "promptTokens": 5000, "completionTokens": 2000, "totalTokens": 7000 },
  "dailyStats": [{ "date": "2025-01-15", "feature": "risk", "callCount": 2, "promptTokens": 1000, ... }],
  "recentLogs": [{ "id": "uuid", "feature": "risk", "project": { "id": "uuid", "name": "项目A" }, "modelName": "gpt-4o-mini", ... }]
}
```

## 7. 前端页面

### 7.1 账号管理页 `/admin`

Tab 切换三个子页面：

#### 用户管理 Tab
- 用户列表表格：用户名、姓名、邮箱、手机、角色标签、状态标签、创建时间
- 搜索框
- 新建用户按钮
- 编辑/删除按钮
- 创建/编辑抽屉（Drawer，宽度 600px）：用户名（编辑时不可改）、姓名、邮箱、密码（编辑时可选）、手机号、角色多选、状态，底部取消/确定按钮

#### 角色管理 Tab
- 角色列表表格：角色名称、描述、权限标签列表、用户数
- 新建角色按钮
- 编辑/删除按钮
- 创建/编辑抽屉（Drawer，宽度 700px）：角色名称、描述、权限配置（按资源分组的 Checkbox 列表），底部取消/确定按钮

#### AI管理 Tab
- **API 配置** Card：配置列表表格（配置名称、API URL、API Key 脱敏显示、模型、关联功能 Tag），右上角"新建配置"按钮；编辑/删除按钮
- **Token 使用统计** Card：顶部四列统计（总调用次数、Prompt Tokens、Completion Tokens、Total Tokens）；下方明细表格（时间、功能 Tag、项目、模型、Prompt/Completion/Total Tokens），分页 10 条/页
- 创建/编辑 Drawer（宽度 480px）：服务商下拉选择（预设 OpenAI、Anthropic Claude、DeepSeek、智谱 GLM、通义千问、豆包、Moonshot、MiniMax、零一万物、百川智能、硅基流动、自定义）→ 自动填充 API URL 和模型；配置名称、API URL、API Key（密码框）、模型名称、"验证连接"按钮、关联功能多选（风险评估/周报建议）
- **功能绑定规则**：每个功能（risk/weekly_report）只能绑定一个配置，绑定新配置时自动从旧配置移除

### 7.2 导航栏权限控制
- "账号管理"菜单项仅对拥有 `user:read` 权限的用户显示
- 各页面中的"新建""编辑""删除"按钮根据对应权限控制显示/隐藏

## 8. 预设种子数据

### 用户
| 用户名 | 密码 | 姓名 | 角色 |
|--------|------|------|------|
| admin | admin123 | 系统管理员 | 系统管理员 |
| zhangsan | 123456 | 张三 | 项目经理 |
| lisi | 123456 | 李四 | 产品经理 |

### 权限数据
6 个资源（project, activity, product, weekly_report, user, role）× 4 个操作 = 24 条精确权限 + 1 条全通配权限（`*:*`），共 25 条。
