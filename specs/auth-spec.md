# 认证模块规格说明书

## 1. 模块概述

认证模块负责用户登录、令牌管理和身份验证。采用 JWT 双令牌机制（Access Token + Refresh Token），Access Token 有效期 8 小时，Refresh Token 有效期 7 天。

## 2. 数据模型

### User（用户表 `users`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 用户唯一标识 |
| username | String | UNIQUE, NULLABLE | 用户名（登录账号，创建时根据姓名自动生成拼音，创建后不可修改） |
| password | String | NULLABLE | 密码（bcrypt 哈希，仅 canLogin=true 的用户需要） |
| realName | String | NOT NULL | 真实姓名 |
| wecomUserId | String | UNIQUE, NULLABLE | 企业微信用户ID，用于企微扫码登录 |
| canLogin | Boolean | NOT NULL, DEFAULT: true | 是否允许登录（false 表示仅联系人，无法登录） |
| status | Enum | NOT NULL, DEFAULT: ACTIVE | 账号状态 |
| preferences | JSON | NULLABLE | 用户偏好（列设置、主题等） |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 创建时间 |
| updatedAt | DateTime | NOT NULL, AUTO | 更新时间 |

**两种用户类型：**
- **可登录用户**（`canLogin: true`）：需要 username + password，可分配角色和权限，可登录系统
- **仅联系人**（`canLogin: false`）：只需 realName，可被分配为活动负责人，但无法登录

### UserStatus 枚举

| 值 | 说明 |
|----|------|
| ACTIVE | 启用 |
| DISABLED | 禁用 |

## 3. API 接口

### 3.1 用户登录

```
POST /api/auth/login
```

**认证要求：** 无（公开接口）

**请求体：**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**成功响应（200）：**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "realName": "系统管理员",
    "canLogin": true,
    "roles": ["系统管理员"],
    "permissions": ["*:*"],
    "collaboratingProjectIds": ["project-uuid-1", "project-uuid-2"]
  }
}
```

**错误响应：**
- `401` - 用户名或密码错误，或用户 `canLogin: false`
- `403` - 账号已被禁用

### 3.2 刷新令牌

```
POST /api/auth/refresh
```

**认证要求：** 无（公开接口）

**请求体：**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**成功响应（200）：**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**错误响应：**
- `401` - 刷新令牌无效

### 3.3 获取当前用户信息

```
GET /api/auth/me
```

**认证要求：** Bearer Token

**成功响应（200）：**
```json
{
  "id": "uuid",
  "username": "admin",
  "realName": "系统管理员",
  "canLogin": true,
  "roles": ["系统管理员"],
  "permissions": ["*:*"],
  "collaboratingProjectIds": ["project-uuid-1", "project-uuid-2"]
}
```

### 3.4 更新个人资料

```
PUT /api/auth/profile
```

**认证要求：** Bearer Token

**请求体：**
```json
{
  "realName": "新姓名"
}
```

**成功响应（200）：** 更新后的用户对象

### 3.5 修改密码

```
POST /api/auth/change-password
```

**认证要求：** Bearer Token

**请求体：**
```json
{
  "currentPassword": "当前密码",
  "newPassword": "新密码"
}
```

**成功响应（200）：**
```json
{
  "success": true,
  "message": "密码修改成功"
}
```

**错误响应：**
- `400` - 当前密码不正确

### 3.6 获取用户偏好

```
GET /api/auth/preferences
```

**认证要求：** Bearer Token

**成功响应（200）：** 用户偏好 JSON 对象（如列设置、主题等），若无偏好返回 `{}`

### 3.7 更新用户偏好

```
PUT /api/auth/preferences
```

**认证要求：** Bearer Token

**请求体：** 偏好 JSON 对象（与已有偏好合并）
```json
{
  "columnPrefs": { "visible": [...], "order": [...] },
  "theme": "dark"
}
```

**成功响应（200）：** 合并后的完整偏好对象

### 3.8 获取企微登录配置

```
GET /api/auth/wecom/config
```

**认证要求：** 无（公开接口）

**成功响应（200）：**
```json
{
  "enabled": true,
  "corpId": "ww1234567890",
  "agentId": "1000001",
  "redirectUri": "https://example.com/login",
  "state": "随机字符串"
}
```

**说明：** 前端根据 `enabled` 判断是否显示企微登录 Tab。`corpId` 和 `agentId` 用于生成企微扫码登录 URL。

### 3.9 企微扫码登录

```
POST /api/auth/wecom/login
```

**认证要求：** 无（公开接口）

**请求体：**
```json
{
  "code": "企微OAuth回调code"
}
```

**成功响应（200）：**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": null,
    "realName": "张三",
    "canLogin": false,
    "roles": [],
    "permissions": [],
    "collaboratingProjectIds": []
  }
}
```

**处理逻辑：**
1. 使用 `code` 向企微 API 换取 `userId`
2. 按 `wecomUserId` 查找已有用户
3. 若用户不存在，自动创建 `canLogin: false` 的联系人用户（realName 从企微获取）
4. 生成 JWT 令牌对返回

**错误响应：**
- `401` - OAuth code 无效
- `403` - 用户已被禁用
- `500` - 企微配置未设置或 API 调用失败

## 4. 认证机制

### JWT Payload 结构
```json
{
  "userId": "uuid",
  "username": "admin",
  "iat": 1771042890,
  "exp": 1771071690
}
```

### 请求头格式
```
Authorization: Bearer <accessToken>
```

### 令牌刷新流程
1. 前端检测到 401 响应
2. 使用 Refresh Token 调用 `/api/auth/refresh` 获取新 Access Token
3. 重试原始请求
4. 若 Refresh Token 也过期，跳转登录页

## 5. 认证缓存

`authenticate` 中间件使用 5 分钟 TTL 的内存缓存（`Map<userId, CachedUser>`），减少重复数据库查询：

- JWT 验证通过后先查缓存，命中且未过期则跳过数据库查询，直接使用缓存的用户信息
- 缓存未命中时从数据库查询用户信息（含角色、权限、协作项目），并写入缓存
- 导出 `invalidateUserCache(userId)` 清除指定用户缓存
- 导出 `invalidateAllUserCache()` 清除所有用户缓存

**缓存失效触发点：**
- 用户角色/状态变更（`PUT /api/users/:id`）
- 角色权限变更（`PUT /api/roles/:id`）
- 项目协作者变更（`POST/DELETE /api/projects/:id/members`）

**安全保障：**
- 被禁用用户（`status: DISABLED`）立即驱逐缓存并返回 403

## 6. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| JWT_SECRET | Access Token 签名密钥 | hw-system-jwt-secret |
| JWT_REFRESH_SECRET | Refresh Token 签名密钥 | hw-system-refresh-secret |

## 7. 前端页面

### 登录页 `/login`
- **Tab 切换：** 账号密码登录 / 企微扫码登录（URL 含 `code` 参数时自动切换到企微 Tab）
- **账号密码 Tab：**
  - 用户名输入框
  - 密码输入框
  - 登录按钮
- **企微扫码 Tab：**
  - 根据 `GET /api/auth/wecom/config` 返回的 `corpId`、`agentId`、`redirectUri` 渲染企微扫码二维码
  - 扫码成功后企微回调携带 `code` 参数，前端调用 `POST /api/auth/wecom/login` 完成登录
  - 若企微配置未启用（`enabled: false`），不显示企微 Tab
- 登录成功后跳转至 `/projects`（项目列表首页）
- 未登录状态下访问其他页面自动跳转至登录页
