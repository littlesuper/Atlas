# 认证模块规格说明书

## 1. 模块概述

认证模块负责用户登录、令牌管理和身份验证。采用 JWT 双令牌机制（Access Token + Refresh Token），Access Token 有效期 8 小时，Refresh Token 有效期 7 天。

## 2. 数据模型

### User（用户表 `users`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 用户唯一标识 |
| username | String | UNIQUE, NOT NULL | 用户名（登录账号） |
| email | String | UNIQUE, NOT NULL | 邮箱 |
| password | String | NOT NULL | 密码（bcrypt 哈希） |
| realName | String | NOT NULL | 真实姓名 |
| phone | String | NULLABLE | 手机号 |
| status | Enum | NOT NULL, DEFAULT: ACTIVE | 账号状态 |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 创建时间 |
| updatedAt | DateTime | NOT NULL, AUTO | 更新时间 |

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
    "email": "admin@hwsystem.com",
    "realName": "系统管理员",
    "roles": ["系统管理员"],
    "permissions": ["*:*"],
    "collaboratingProjectIds": ["project-uuid-1", "project-uuid-2"]
  }
}
```

**错误响应：**
- `401` - 用户名或密码错误
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
  "email": "admin@hwsystem.com",
  "realName": "系统管理员",
  "phone": null,
  "roles": ["系统管理员"],
  "permissions": ["*:*"],
  "collaboratingProjectIds": ["project-uuid-1", "project-uuid-2"]
}
```

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
- 用户名输入框
- 密码输入框
- 登录按钮
- 登录成功后跳转至 `/projects`（项目列表首页）
- 未登录状态下访问其他页面自动跳转至登录页
