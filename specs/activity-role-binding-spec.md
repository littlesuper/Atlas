# Activity Role Binding 模块规格文档

> **目的**：将活动的"执行人"绑定方式从「直接选具体用户」改造为「先绑定 RBAC 角色，再按全局角色映射自动填入对应人员」。角色与执行人**并存**且都持久化，执行人在创建时按映射自动填全员、用户可手删，缺映射时软提示但允许留空，老数据完全迁移。
>
> **版本**: v1.0
> **状态**: 待实施
> **预估工时**: 15 工作日 ≈ 3 周
> **影响范围**: 后端 schema / API / 业务逻辑 + 前端活动管理 / 系统管理 + 数据迁移

---

## 目录

1. [业务背景与目标](#1-业务背景与目标)
2. [核心概念定义](#2-核心概念定义)
3. [数据模型](#3-数据模型)
4. [API 设计](#4-api-设计)
5. [前端交互设计](#5-前端交互设计)
6. [业务规则与自动填充](#6-业务规则与自动填充)
7. [边界场景处理](#7-边界场景处理)
8. [数据迁移策略](#8-数据迁移策略)
9. [影响面清单](#9-影响面清单)
10. [测试覆盖要求](#10-测试覆盖要求)
11. [权限与缓存](#11-权限与缓存)
12. [实施清单](#12-实施清单)

---

## 1. 业务背景与目标

### 1.1 当前状态

目前 Atlas 中的 `Activity` 实体直接绑定单个用户作为执行人（`executorId` → `User`）。每次新建活动或复制项目模板时，需要手动选择具体的人员。

### 1.2 痛点

- **跨项目人员复用低效**：相同性质的工作（如"硬件工程师负责的 PCB 打样"）在不同项目里需要重复指派。
- **人员变动管理困难**：员工离职或调岗时，无系统化方式批量更新其在多个活动中的指派。
- **职责语义缺失**：活动只记录"谁做了"，没记录"应该哪类人做"——历史复盘时难以分析角色级工作量。

### 1.3 目标

1. 活动绑定 **RBAC 角色**（如"硬件工程师"），而不仅是具体的人。
2. 通过**全局角色 → 人员映射**，创建活动时自动填入该角色下的成员作为执行人。
3. 保留手动调整执行人的能力（删除、补充）。
4. 角色和执行人**并存持久化**：角色 = "应该谁做"，执行人 = "实际谁做"，便于审计追溯。
5. 老数据通过迁移脚本完全迁移到新模型，不保留"直接选人"的旧路径。

### 1.4 非目标（明确不做）

- ❌ 不引入"项目级"或"项目模板级"的角色映射（仅全局级一份）。
- ❌ 不新建独立的"项目分工角色"实体（复用现有 RBAC 角色）。
- ❌ 不实现"映射变化级联同步进行中活动"（默认隔离，仅在显式删除时询问级联）。
- ❌ 不在本版本支持"多角色并存的活动"（一个活动只绑一个角色）。

---

## 2. 核心概念定义

| 概念 | 定义 |
|---|---|
| **角色（Role）** | 复用现有 RBAC 系统中的角色实体，无新表 |
| **角色成员（RoleMember）** | 全局配置的"角色 → 用户"映射记录 |
| **活动角色（Activity.role）** | 活动绑定的"应由哪类人执行"的角色，可空 |
| **活动执行人（ActivityExecutor）** | 活动的实际执行人，与活动是多对多关系 |
| **执行人来源（ExecutorSource）** | 区分执行人是"角色映射自动填入"还是"用户手动操作"的标记 |
| **角色快照（snapshotRoleId）** | 执行人加入活动时所属角色的快照，用于审计追溯 |
| **软删除（isActive）** | 角色成员被移除时不物理删除，标记为非活跃，保留历史 |

---

## 3. 数据模型

### 3.1 Prisma Schema 改动

#### 3.1.1 新增模型：`RoleMember`

```prisma
/// 全局"角色 → 人员"映射。配置在哪个角色下挂哪些人，
/// 创建活动时按角色自动填入执行人的依据。
model RoleMember {
  id        String   @id @default(cuid())
  roleId    String
  userId    String

  /// 同一角色内的排序，影响 UI 展示和"主负责人"识别（sortOrder 最小者为主负责人）
  sortOrder Int      @default(0)

  /// 软删除标记。离职/调岗时设为 false，不物理删除，保留历史关联
  isActive  Boolean  @default(true)

  createdAt DateTime @default(now())
  createdBy String?
  updatedAt DateTime @updatedAt

  role    Role  @relation(fields: [roleId], references: [id], onDelete: Cascade)
  user    User  @relation("RoleMemberUser", fields: [userId], references: [id], onDelete: Cascade)
  creator User? @relation("RoleMemberCreator", fields: [createdBy], references: [id])

  @@unique([roleId, userId])
  @@index([roleId, isActive, sortOrder])
  @@index([userId, isActive])
}
```

#### 3.1.2 新增模型：`ActivityExecutor`

```prisma
/// 活动执行人（多对多）。一个活动可有多个执行人，
/// 一个用户可在多个活动里担任执行人。
model ActivityExecutor {
  id         String @id @default(cuid())
  activityId String
  userId     String

  /// 执行人的来源标记：
  /// - ROLE_AUTO    创建时按角色映射自动填入
  /// - MANUAL_KEEP  用户主动保留（映射变更时不被自动同步清理）
  /// - MANUAL_ADD   用户手动追加（不在当前角色映射内）
  source ExecutorSource @default(ROLE_AUTO)

  /// 加入时的角色快照。即使全局映射改了，这条记录还能追溯当时是按哪个角色入的
  snapshotRoleId String?

  assignedAt DateTime @default(now())
  assignedBy String?

  activity Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  user     User     @relation("ActivityExecutorUser", fields: [userId], references: [id], onDelete: Cascade)
  assigner User?    @relation("ActivityExecutorAssigner", fields: [assignedBy], references: [id])

  @@unique([activityId, userId])
  @@index([activityId])
  @@index([userId])
}

enum ExecutorSource {
  ROLE_AUTO
  MANUAL_KEEP
  MANUAL_ADD
}
```

#### 3.1.3 修改模型：`Activity`

```prisma
model Activity {
  // ... 现有字段保留 ...

  // ❌ 删除字段
  // executorId  String?
  // executor    User?    @relation(...)

  // ✅ 新增字段
  /// 活动绑定的角色（"应由哪类人执行"）。可空——支持无角色的临时活动
  roleId String?
  role   Role?   @relation("ActivityRole", fields: [roleId], references: [id], onDelete: SetNull)

  /// 活动执行人列表（多对多）
  executors ActivityExecutor[]

  // ... 其他保留 ...

  @@index([roleId])
}
```

#### 3.1.4 修改模型：`User`

新增反向关系字段：

```prisma
model User {
  // ... 现有字段 ...

  // 新增反向关系
  roleMembers          RoleMember[]       @relation("RoleMemberUser")
  createdRoleMembers   RoleMember[]       @relation("RoleMemberCreator")
  activityExecutors    ActivityExecutor[] @relation("ActivityExecutorUser")
  assignedActivities   ActivityExecutor[] @relation("ActivityExecutorAssigner")
}
```

#### 3.1.5 修改模型：`Role`

新增反向关系字段：

```prisma
model Role {
  // ... 现有字段 ...

  // 新增反向关系
  members    RoleMember[]
  activities Activity[]   @relation("ActivityRole")
}
```

### 3.2 关系总览

```
       Role
      /    \
     /      \
RoleMember   Activity
     \         |
      \        |
       \   ActivityExecutor
        \   /
         \ /
         User
```

### 3.3 索引策略说明

- `RoleMember(roleId, isActive, sortOrder)`：自动填充查询主键，覆盖"按角色查活跃成员并排序"。
- `RoleMember(userId, isActive)`：反查"某人属于哪些角色"，用户详情页和离职处理用。
- `ActivityExecutor(userId)`：周报、个人工作台"我的活动"查询。
- `ActivityExecutor(activityId)`：活动详情拉取执行人列表。

---

## 4. API 设计

### 4.1 新增端点：角色成员管理

#### `GET /api/role-members`

列出所有角色映射（按角色分组）。

**权限**: `role:read`
**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `roleId` | string | 否 | 过滤特定角色 |
| `userId` | string | 否 | 反查"某人属于哪些角色" |
| `includeInactive` | boolean | 否 | 是否包含软删除的（默认 false） |

**响应**:
```json
{
  "data": [
    {
      "id": "rm_xxx",
      "roleId": "role_hw_engineer",
      "role": { "id": "...", "name": "硬件工程师" },
      "userId": "user_xxx",
      "user": { "id": "...", "realName": "张三", "canLogin": true },
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "..."
    }
  ]
}
```

---

#### `POST /api/role-members`

添加角色成员。

**权限**: `role:update`
**请求体**:
```json
{
  "roleId": "role_xxx",
  "userId": "user_xxx",
  "sortOrder": 0
}
```

**校验**:
- `roleId` 必须存在
- `userId` 必须存在
- 同一 `(roleId, userId)` 已存在时：
  - 若 `isActive=false`，则恢复为 active（更新而非新增）
  - 若 `isActive=true`，则返回 409 Conflict

**响应**: 201 Created + 创建的记录

---

#### `PATCH /api/role-members/:id`

修改角色成员（排序 / 启用状态）。

**权限**: `role:update`
**请求体**:
```json
{
  "sortOrder": 1,
  "isActive": true
}
```

---

#### `DELETE /api/role-members/:id`

**软删除**角色成员（设为 `isActive=false`）。

**权限**: `role:update`
**Query 参数**:
| 参数 | 类型 | 说明 |
|---|---|---|
| `cascadeMode` | enum | `keep` / `removeAll` / `selective`，默认 `keep` |
| `cascadeActivityIds` | string[] | `cascadeMode=selective` 时指定要级联清理的活动 ID |

**行为**:
- `keep`：仅设 `isActive=false`，活动里的执行人记录不动
- `removeAll`：同时从该用户参与的**所有非归档项目**的进行中活动里移除其 `ActivityExecutor` 记录
- `selective`：仅从指定的活动里移除

**响应**:
```json
{
  "deleted": { "id": "rm_xxx" },
  "cascadedActivityCount": 12,
  "remainingEmptyActivities": [{ "id": "act_xxx", "name": "..." }]
}
```

注意：归档项目里的 `ActivityExecutor` **永远不被级联清理**（数据冻结原则）。

---

#### `POST /api/role-members/batch-set`

批量设置某角色的所有成员（用于"角色管理页保存"操作）。

**权限**: `role:update`
**请求体**:
```json
{
  "roleId": "role_xxx",
  "members": [
    { "userId": "user_a", "sortOrder": 0 },
    { "userId": "user_b", "sortOrder": 1 }
  ]
}
```

**行为**（事务执行）:
1. 该角色现有 `RoleMember` 中不在 `members` 列表的 → 软删除（`isActive=false`）
2. 列表中已存在的 → 更新 `sortOrder`、确保 `isActive=true`
3. 列表中新增的 → 新建记录

**响应**: 操作后的完整成员列表。

---

#### `GET /api/role-members/preview/:roleId`

预览某角色当前会自动填入哪些用户（创建活动时调用，纯查询不写入）。

**权限**: `role:read`
**响应**:
```json
{
  "roleId": "role_xxx",
  "role": { "name": "硬件工程师" },
  "members": [
    { "userId": "user_a", "realName": "张三", "sortOrder": 0, "canLogin": true },
    { "userId": "user_b", "realName": "李四", "sortOrder": 1, "canLogin": true }
  ],
  "isEmpty": false
}
```

---

### 4.2 修改端点：活动 CRUD

#### `POST /api/activities` 改动

**入参变化**:
- ❌ 移除 `executorId`
- ✅ 新增 `roleId: string | null`（可空）
- ✅ 新增 `executorIds?: string[]`（可选）

**行为**:
- 若 `roleId` 提供且 `executorIds` 未提供 → 自动按角色映射填入全员，`source=ROLE_AUTO`
- 若 `roleId` 提供且 `executorIds` 提供 → 仅写入 `executorIds` 指定的人；其中属于该角色映射的记 `ROLE_AUTO`，不属于的记 `MANUAL_ADD`
- 若 `roleId` 为 null 但 `executorIds` 提供 → 全部记 `MANUAL_ADD`，`snapshotRoleId=null`
- 若 `roleId` 提供但映射为空 → `executors` 为空数组（软提示由前端展示）

**Zod schema** (`server/src/schemas/activity.ts`):
```typescript
export const createActivitySchema = z.object({
  // ... 其他字段 ...
  roleId: z.string().nullable().optional(),
  executorIds: z.array(z.string()).optional(),
});
```

---

#### `PATCH /api/activities/:id` 改动

支持以下三种修改组合：

| 入参 | 行为 |
|---|---|
| 仅 `roleId` 变化 | 仅更新 `Activity.roleId`，**不**自动重置 `executors` |
| 仅 `executorIds` 变化 | 替换 `executors` 数组（来源标记按当前 `roleId` 推断） |
| 两者都变 | 先更新 `roleId`，再用新 `executorIds` 替换 `executors` |
| 提供 `resetExecutorsByRole: true` | 显式按新角色映射重置执行人列表（前端切换角色后用户确认时调用） |

**Zod schema**:
```typescript
export const updateActivitySchema = z.object({
  // ...
  roleId: z.string().nullable().optional(),
  executorIds: z.array(z.string()).optional(),
  resetExecutorsByRole: z.boolean().optional(),
});
```

---

#### `GET /api/activities/:id` 与列表接口响应变化

**返回值**:
- ❌ 移除 `executor: { ... }`
- ✅ 新增 `role: { id, name } | null`
- ✅ 新增 `executors: [{ userId, realName, canLogin, source, snapshotRoleId }]`

**列表过滤参数变化**:
- `executorId` 参数语义改为"过滤包含该用户作为执行人的活动"
- 新增 `roleId` 参数过滤特定角色的活动

---

### 4.3 业务工具模块

新增 `server/src/utils/roleMembershipResolver.ts`，提供以下函数：

```typescript
/**
 * 查询某角色当前所有 active 的成员（按 sortOrder 排序）
 */
export async function resolveRoleMembers(roleId: string): Promise<User[]>;

/**
 * 创建活动时调用，返回应自动填入的 userId 列表
 */
export async function autoAssignByRole(roleId: string): Promise<string[]>;

/**
 * 反查某用户属于哪些角色（包括 isActive 标记）
 */
export async function findRolesByUser(
  userId: string,
  options?: { includeInactive?: boolean }
): Promise<Array<{ roleId: string; isActive: boolean }>>;

/**
 * 查询某用户在哪些进行中（非归档、非已完成）活动里担任执行人
 * 用于离职处理时的级联询问
 */
export async function findActiveActivitiesByExecutor(
  userId: string
): Promise<Array<{ activityId: string; activityName: string; projectId: string; projectName: string }>>;
```

---

## 5. 前端交互设计

### 5.1 创建/编辑活动表单

#### 5.1.1 表单结构

```
┌─ 活动名称 * ──────────────────────────────────┐
│ [_______________________________________]    │
└──────────────────────────────────────────────┘

┌─ 角色 ────────────────────────────────────────┐
│ [▼ 选择角色（如：硬件工程师）            ]    │
└──────────────────────────────────────────────┘

┌─ 执行人（按角色自动填入，可调整） ─────────────┐
│ ✓ 张三 (主负责人)                  [×]       │
│ ✓ 李四                              [×]       │
│ ✓ 王五                              [×]       │
│ [+ 添加成员 ▼]                                │
└──────────────────────────────────────────────┘

┌─ 计划开始 / 结束 / 工期 / 状态 / ...（不变） ──┐
└──────────────────────────────────────────────┘
```

#### 5.1.2 关键交互逻辑

| 场景 | 行为 |
|---|---|
| 选择角色 | 调用 `GET /api/role-members/preview/:roleId`，**自动填入**全员到执行人区 |
| 切换角色（已自动填了人）| 弹确认 Modal："切换角色将重置执行人列表，是否继续？"。确认后清空 + 重新填入 |
| 切换角色（用户已手动改过执行人） | 弹**强警告 Modal**：警告手动调整将丢失。确认才重置 |
| 删除某执行人（点 × ） | 仅从前端 state 移除（保存时提交） |
| 添加成员（点 [+]） | 弹下拉：上半部分"该角色下未添加的成员"，下半部分"从其他角色添加"折叠区 |
| 角色映射为空 | 执行人区显示红字：「该角色尚未配置成员」+ 链接「→ 去配置」（仅对有 `role:update` 权限的用户显示） |
| 设置主负责人 | 主负责人 = 列表第一项（`sortOrder` 最小）。允许拖拽调整顺序，列表第一项自动获"主负责人"标签 |

#### 5.1.3 状态管理

前端表单 state 结构：

```typescript
interface ActivityFormState {
  roleId: string | null;
  executors: Array<{
    userId: string;
    realName: string;
    canLogin: boolean;
    source: 'ROLE_AUTO' | 'MANUAL_KEEP' | 'MANUAL_ADD';
    snapshotRoleId: string | null;
  }>;
  /** 标记用户是否手动改动过执行人列表（用于切换角色时的警告判断） */
  executorsManuallyEdited: boolean;
}
```

切换角色时：
- 若 `executorsManuallyEdited = false` → 直接重置（弹普通确认）
- 若 `executorsManuallyEdited = true` → 弹强警告

### 5.2 活动列表显示

原"执行人"列改造为**两列**（响应式宽度下可合并）：

```
┌──────────┬────────────┬─────────────────┬─────┐
│ 活动名称   │ 角色       │ 执行人           │ 状态 │
├──────────┼────────────┼─────────────────┼─────┤
│ PCB 打样  │ 硬件工程师 │ 张三 +2          │进行中│
│ 软件烧录  │ 软件工程师 │ ⚠️ 未配置        │待开始│
│ 协调会议  │ —          │ 李四             │进行中│
└──────────┴────────────┴─────────────────┴─────┘
```

**显示规则**:
- 角色为 null：显示「—」
- 执行人为 1 人：显示姓名
- 执行人为多人：显示「{首位姓名} +{N-1}」，hover 展开 tooltip 列全部姓名
- 执行人为 0：显示红色「⚠️ 未配置」

### 5.3 活动列表内联编辑

延续现有 `activity-list-inline-edit.md` 的"单例编辑"约束：

| 单元格 | 单击行为 |
|---|---|
| 角色 | 弹出角色单选下拉，确认后调用 PATCH（仅改 `roleId`，**不**联动 executors） |
| 执行人 | 弹出当前角色下成员的多选列表，可勾选/取消，确认后 PATCH |
| 切换角色后想同步重置执行人 | 通过角色单元格旁的「⟳」按钮显式触发（调用 PATCH `resetExecutorsByRole: true`） |

**约束保留**:
- 一次只能一个单元格在编辑态
- 已设置前置依赖的活动**不影响**这两列的编辑（依赖锁定仅针对计划时间）

### 5.4 全局角色成员管理页

挂载位置：`/admin` 路径下新增 Tab「角色成员」（在「角色管理」之后）。

#### 5.4.1 页面结构

```
┌─ 系统管理 ───────────────────────────────────────────┐
│ [用户管理] [角色管理] [👥 角色成员] [AI管理] [...]    │
├─────────────────────────────────────────────────────┤
│  ┌─ 项目经理 (3 人)                              ┐  │
│  │ [≡] 张三 (主负责人)                       [×] │  │
│  │ [≡] 李四                                  [×] │  │
│  │ [≡] 王五 [📧 仅联系人]                    [×] │  │
│  │ [+ 添加成员 ▼]                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ 硬件工程师 (4 人)                            ┐  │
│  │ ...                                            │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  [+ 配置新角色映射]                                 │
└─────────────────────────────────────────────────────┘
```

#### 5.4.2 功能要点

| 功能 | 说明 |
|---|---|
| 拖拽排序 | 使用 `@dnd-kit`（Atlas 已引入），影响 `sortOrder`，进而影响"主负责人"和创建活动时的默认顺序 |
| 添加成员 | 点 [+] 弹出可登录用户 + 联系人列表，多选 |
| 移除成员 | 点 [×] 触发软删除流程（见 5.4.3） |
| 联系人标签 | `canLogin=false` 的用户显示「📧 仅联系人」标签 |
| 配置新角色映射 | 跳转角色管理页或弹出选角色入口（具体路径待定，**实施时按现有"角色管理"风格保持一致**） |

#### 5.4.3 软删除流程（核心：张三离职 case）

点击成员的 [×] 后：

**Step 1 弹窗**:
```
┌────────────────────────────────────────────────┐
│ 确认从「硬件工程师」角色移除张三?              │
├────────────────────────────────────────────────┤
│ 该用户当前在 12 个进行中的活动里担任执行人:    │
│   • 项目 A：PCB 打样、SMT 调试 (2)            │
│   • 项目 B：版本验证、外壳测试 (2)            │
│   • 项目 C：...                                │
│                                                │
│ 是否同时从这些活动中移除张三？                │
│                                                │
│ ○ 全部保留 → 仅停止以后的自动指派              │
│ ● 全部移除 → 离职场景常用                      │
│ ○ 选择性处理 → 列表勾选哪些移除                │
│                                                │
│           [取消]    [确认]                     │
└────────────────────────────────────────────────┘
```

**Step 2（仅"全部移除"时）二次确认**:
```
将从 12 个进行中活动里移除张三。其中：
  • 8 个活动移除后仍有其他执行人 ✓
  • 4 个活动移除后将变为"无执行人"⚠️
    [展开]
    - 项目 X / 活动 Y
    - 项目 X / 活动 Z
    ...
```

**归档项目里的活动**: **永远不级联清理**（前端不显示这部分活动，后端 API 也强制过滤 ARCHIVED 项目）。

---

## 6. 业务规则与自动填充

### 6.1 自动填充触发时机

`autoAssignByRole(roleId)` 函数在以下场景被调用：

| 场景 | 触发点 | 调用方 |
|---|---|---|
| 创建活动选择角色后 | 前端调用预览接口 | `POST /api/role-members/preview/:roleId` |
| 创建活动提交（未指定 executorIds） | 后端自动填入 | `POST /api/activities` |
| 编辑活动显式重置执行人 | 后端按新角色重填 | `PATCH /api/activities/:id` with `resetExecutorsByRole: true` |
| Excel 导入活动（执行人列空） | 导入逻辑按角色填 | `utils/activityImporter.ts` |
| 项目复制 | 复制时按当前映射重填 | 项目复制服务 |

### 6.2 自动填充规则

```
function autoAssignByRole(roleId):
  members = RoleMember
    .where(roleId, isActive=true)
    .orderBy(sortOrder ASC, createdAt ASC)
    .select(userId)
  return members
```

填入活动时：
- 全部记 `source = ROLE_AUTO`
- 全部记 `snapshotRoleId = roleId`
- `assignedAt = now()`, `assignedBy = currentUser`

### 6.3 来源标记 (`ExecutorSource`) 转换规则

| 操作 | 当前 source | 操作后 source |
|---|---|---|
| 创建活动自动填入 | (新建) | `ROLE_AUTO` |
| 用户手动添加（在该角色映射内） | (新建) | `ROLE_AUTO` |
| 用户手动添加（不在该角色映射内） | (新建) | `MANUAL_ADD` |
| 用户在编辑界面"保留某人"（即映射变了但该人仍在列表中） | `ROLE_AUTO` | `MANUAL_KEEP` |
| 用户重置执行人按角色重填 | 任意 | 全部清空，重新按 `ROLE_AUTO` 填入 |

### 6.4 主负责人识别

主负责人 = `executors` 列表中 `sortOrder` 最小者。
若多人 `sortOrder` 相同，取 `assignedAt` 最早者。

主负责人用于：
- UI 展示「主负责人」标签
- 通知策略（见第 9.7 节）：活动创建只通知主负责人

### 6.5 角色映射为空的处理

| 场景 | 系统行为 |
|---|---|
| 创建活动选了角色但映射空 | 允许保存；`executors` 为空数组；前端列表红字「⚠️ 未配置」 |
| 风险评估对该活动 | 计入"无执行人活动"风险加分（见 9.4） |

---

## 7. 边界场景处理

### 7.1 用户离职/调岗（"张三离职"完整推演）

**操作路径**: 系统管理 → 角色成员 → 找到「硬件工程师」组 → 张三 → [×]

**系统行为**:

1. 调用 `findActiveActivitiesByExecutor(zhangsanUserId)` 查询张三在哪些进行中活动里担任执行人
2. 弹两步确认对话框（见 5.4.3）
3. 用户选择后，后端在事务中执行：
   - `RoleMember` 表中张三的记录 `isActive = false`（软删，不物理删）
   - 根据用户选择级联清理 `ActivityExecutor`：
     - `keep` 模式：不清理任何 `ActivityExecutor`
     - `removeAll` 模式：清理所有非归档项目下的进行中活动
     - `selective` 模式：仅清理用户勾选的活动
4. 归档项目的 `ActivityExecutor` 记录 **永远不动**（数据冻结）
5. 已完成（`status=COMPLETED`）的活动 **不动**（追溯历史完整性）
6. 仅清理状态为 `IN_PROGRESS` / `NOT_STARTED` / `BLOCKED` 等"进行中或待开始"的活动

**审计**: 所有清理动作写 `AuditLog`，记录操作者、时间、影响活动数。

### 7.2 修改全局映射 → 是否同步刷新已有活动？

**默认**: **不同步**。`ActivityExecutor` 是独立持久化的记录，全局映射变化只影响"以后新创建的活动自动填谁"。

**理由**:
- 进行中活动的执行人是真实分工，不能因后台映射变化突然换人
- 历史可追溯性靠 `snapshotRoleId` 保证

**例外**: 软删除成员时显式询问级联（见 7.1）。

### 7.3 `canLogin=false` 联系人作为角色成员

**允许**——与现有"联系人可作为活动负责人"设计一致。

UI 处理:
- 角色成员列表显示「📧 仅联系人」标签
- 通知发送时跳过这部分（联系人无法登录系统接收通知）

### 7.4 用户拥有多个 RBAC 角色

**完全由管理员手动配置 `RoleMember`**，不从 RBAC 自动派生。

例: 用户 A 同时有"项目经理"和"硬件工程师"两个 RBAC 角色，但管理员只把他配进了"项目经理"的 `RoleMember`，那 A 在创建"硬件工程师"角色的活动时不会被自动填入。

### 7.5 角色被删除 / 停用

**Activity 表**: `Activity.role` 关系是 `onDelete: SetNull`，所以角色删除后活动的 `roleId` 变 null，`executors` 保留。前端列表显示「⚠️ 角色已删除」。

**RoleMember 表**: `onDelete: Cascade`，角色删了所有映射记录也清空。

### 7.6 用户被删除

**Activity 上的 ActivityExecutor**: `onDelete: Cascade` → 该用户从所有活动的执行人列表中物理移除。

**RoleMember**: `onDelete: Cascade` → 该用户从所有角色映射中物理移除。

⚠️ **建议**: 实际操作上禁止物理删除用户，应使用"停用"机制（这超出本规格范围，但实施时需注意此前提）。

### 7.7 创建活动时手动从其他角色加人

**允许**。`ActivityExecutor.source = MANUAL_ADD`，`snapshotRoleId = null`（因为不属于活动绑定的角色）。

### 7.8 切换活动角色时执行人列表的处理

| 场景 | 行为 |
|---|---|
| 用户未手动改过执行人（`executorsManuallyEdited=false`）| 弹普通确认；确认后清空并按新角色自动填入 |
| 用户已手动改过 | 弹强警告；确认才重置 |
| 取消 | `roleId` 变更也回滚 |

### 7.9 归档项目的所有读写

- 读：完全开放
- 写：被现有 `rejectIfArchived` 中间件拦截，所有针对该项目活动的执行人/角色修改返回 400
- 全局映射变化：归档项目里的 `ActivityExecutor` 永远不被影响

---

## 8. 数据迁移策略

### 8.1 迁移脚本: `migrations/<timestamp>_activity_role_binding.ts`

#### Step 1: 备份

在事务外执行：
```sql
CREATE TABLE _activity_executor_backup AS
SELECT id AS activityId, executorId
FROM Activity
WHERE executorId IS NOT NULL;
```

#### Step 2: 应用 Schema 变更

`prisma db push` 应用新 schema（添加 RoleMember / ActivityExecutor / Activity.roleId）。

注意：`Activity.executorId` 字段先**保留**，迁移完成后才删除。

#### Step 3: 倒推每条活动的 roleId 和 executor

伪代码：

```typescript
for (const activity of activities) {
  if (!activity.executorId) continue;

  const user = await prisma.user.findUnique({
    where: { id: activity.executorId },
    include: { roles: true } // 含 RBAC 角色
  });

  let roleId: string | null = null;
  let source: ExecutorSource;

  if (!user) {
    // 用户不存在（数据异常），跳过此条
    continue;
  }

  if (!user.canLogin) {
    // 联系人无角色
    roleId = null;
    source = ExecutorSource.MANUAL_ADD;
  } else if (user.roles.length === 0) {
    // 无角色用户
    roleId = null;
    source = ExecutorSource.MANUAL_ADD;
  } else if (user.roles.length === 1) {
    // 唯一角色
    roleId = user.roles[0].id;
    source = ExecutorSource.ROLE_AUTO;
  } else {
    // 多角色：取首个非"系统管理员"的角色
    const firstNonAdmin = user.roles.find(r => r.code !== 'SYSTEM_ADMIN');
    roleId = (firstNonAdmin || user.roles[0]).id;
    source = ExecutorSource.ROLE_AUTO;
  }

  await prisma.$transaction([
    prisma.activity.update({
      where: { id: activity.id },
      data: { roleId },
    }),
    prisma.activityExecutor.create({
      data: {
        activityId: activity.id,
        userId: user.id,
        source,
        snapshotRoleId: roleId,
        assignedAt: activity.createdAt,
      },
    }),
  ]);
}
```

#### Step 4: 反向构建 RoleMember 全局映射

```typescript
// 从已迁移的 ActivityExecutor 中聚合出"角色 → 用户"组合
const pairs = await prisma.activityExecutor.findMany({
  where: { source: 'ROLE_AUTO' },
  select: { snapshotRoleId: true, userId: true },
  distinct: ['snapshotRoleId', 'userId'],
});

for (const pair of pairs) {
  if (!pair.snapshotRoleId) continue;
  await prisma.roleMember.upsert({
    where: {
      roleId_userId: { roleId: pair.snapshotRoleId, userId: pair.userId }
    },
    create: {
      roleId: pair.snapshotRoleId,
      userId: pair.userId,
      isActive: true,
      sortOrder: 0,
    },
    update: { isActive: true },
  });
}
```

**关键说明**: 这一步让全局映射的初始化从老数据**自然推导**，不需要管理员从零配置。迁移结束后管理员看到的是基于历史使用的实际配置。

#### Step 5: 输出迁移报告

`logs/migration-<timestamp>.log` + `_migration_review.csv`:

```
=== Activity Role Binding 迁移报告 ===
迁移时间: 2026-XX-XX HH:MM:SS
总活动数: 1284
有 executorId 的活动数: 1067
  ├─ 成功映射到单一角色: 892
  ├─ 多角色用户(取首个非管理员): 89
  ├─ 联系人(无角色): 67
  └─ 无角色用户: 19

新建 ActivityExecutor 记录: 1067
新建 RoleMember 记录: 47

需要人工后续处理的活动: 86 条
（详见 _migration_review.csv，建议管理员逐条审阅是否补全角色）
```

#### Step 6: 完整性自检

`scripts/verify-role-binding-migration.ts`:

| 检查点 | 验证逻辑 |
|---|---|
| 1 | 备份表行数 === 新建 ActivityExecutor 行数 |
| 2 | 所有 ActivityExecutor.userId 都对应有效 User |
| 3 | source=ROLE_AUTO 的 ActivityExecutor 都有 snapshotRoleId |
| 4 | source=ROLE_AUTO 的 (snapshotRoleId, userId) 在 RoleMember 中都存在 |
| 5 | 每个 RoleMember 的 (roleId, userId) 唯一 |
| 6 | 没有任何 Activity.executorId 字段在新代码中被读取（grep 验证） |

#### Step 7: 删除老字段

仅在自检全通过后：
```prisma
model Activity {
  // executorId  String?    ← 删除此行
  // executor    User?      ← 删除关系
}
```

`prisma db push` 应用最终 schema。

### 8.2 迁移执行流程

```bash
# 1. 进入维护模式
systemctl stop atlas

# 2. 自动备份（deploy.sh 已有此机制）
cp data/atlas.db data/atlas.db.pre-role-binding.bak

# 3. Schema 变更
cd server && npx prisma db push

# 4. 跑迁移脚本
npx tsx scripts/migrate-role-binding.ts

# 5. 完整性自检
npx tsx scripts/verify-role-binding-migration.ts

# 6. （自检通过后）删除老字段
npx prisma db push  # 已更新 schema

# 7. 重启服务
systemctl start atlas
```

预计停机时间：< 1 分钟（基于现有数据规模）。

### 8.3 回滚方案

若迁移失败或上线后发现严重问题：

```bash
systemctl stop atlas
cp data/atlas.db.pre-role-binding.bak data/atlas.db
git revert <migration-commit>
npm run build
systemctl start atlas
```

---

## 9. 影响面清单

每一项都需要在实施时同步改动。

### 9.1 Excel 批量导入

**文件**: `server/src/utils/activityImporter.ts`（或对应实际路径）

**改动**:
- Excel 模板新增「角色」列（必填）
- 解析时按"角色名称"匹配 RBAC 角色，失败抛错（不允许导入未知角色）
- 若执行人姓名为空 → 按映射自动填全员（`source=ROLE_AUTO`）
- 若执行人列有姓名 → 按姓名匹配用户（保留原"找不到则建联系人"的逻辑）；不在该角色映射的姓名标 `MANUAL_ADD`
- **不**自动把导入时遇到的人加入 RoleMember 映射（避免污染）

### 9.2 项目复制 / 模板克隆

**文件**: 项目复制服务（路径以实际为准）

**改动**:
- 复制 `Activity.roleId`
- **不**复制具体 `ActivityExecutor` → 改为按当前全局映射重新填入
- 这天然支持"角色复用"：同一个项目模板克隆给不同时期使用，人员自动跟着变

### 9.3 活动列表内联编辑

**文件**: 客户端活动列表组件

**改动**:
- 原"执行人"单元格拆为「角色」+「执行人」两列
- 单例编辑约束保持
- 改"角色"时 **不**自动联动执行人；用户需点旁边「⟳」按钮显式重置
- 已设置前置依赖的活动**不影响**这两列编辑（原约束只针对计划时间）

### 9.4 风险评估规则引擎

**文件**: `server/src/utils/riskRuleEngine.ts`

**改动**:
- 原规则"无负责人活动 +X 分" → 改为"无角色 OR 执行人列表为空 +X 分"
- 两种空值含义对项目管理风险等价

### 9.5 资源看板

**文件**: 客户端资源看板页面 + 对应后端聚合接口

**改动**:
- 按 User 维度统计：原 `WHERE executorId = userId` → 改为 `WHERE EXISTS (ActivityExecutor WHERE userId = ?)`
- **新增可选视图**：按"角色"维度统计（同一角色在所有项目里的进行中活动数 / 工时分布）
  - 是否实施视图层由产品决定，但数据已具备
  - 推荐作为本次的免费增量

### 9.6 周报

**文件**: 周报相关查询

**改动**:
- "我本周负责的活动"查询从 `WHERE executorId = me` → 改为 `WHERE me IN (SELECT userId FROM ActivityExecutor WHERE activityId = ?)`
- Prisma: `where: { executors: { some: { userId: me } } }`
- 其他逻辑不变

### 9.7 通知（活动指派 / 截止提醒）

**文件**: 通知服务

**当前**: 发给 `executorId` 一个人。

**改造规则**:

| 通知场景 | 接收人 |
|---|---|
| 活动创建（执行人有 N 人）| 仅主负责人 + 抄送（站内消息）其他人 |
| 活动状态变更 | 所有执行人 |
| 截止日期临近 | 所有执行人 |
| 活动被指派给我 | 仅本人 |

**配置开关**: 添加系统设置 `notification.activityCreate.notifyAll`（默认 false），管理员可改为 true 让创建通知发给全部执行人。

### 9.8 权限缓存

**文件**: 现有认证缓存逻辑

**改动**:
- 修改 `RoleMember` **不影响** RBAC 权限定义，**无需**清缓存
- 修改 `Role` 本身（添加/删除 RBAC 角色或权限）保留现有清缓存逻辑

### 9.9 归档项目

**文件**: `server/src/middleware/rejectIfArchived.ts`

**改动**:
- 现有拦截逻辑覆盖所有 Activity 写操作 → 已自动覆盖新字段，**无需**额外改动
- 全局 `RoleMember` 修改不影响归档项目（数据隔离已由 `ActivityExecutor` 独立持久化保证）

### 9.10 撤回栈（`useUndoStack`）

**文件**: 客户端撤回栈实现

**改动**:
- 活动创建/编辑里改了执行人列表 → 把整个 `executors[]` 数组放进 undo 栈
- 不能只撤回单个执行人（执行人列表是整体语义）

### 9.11 项目归档快照

**文件**: 项目归档服务

**改动**:
- 归档时如果有"快照"机制（PROJECT_SUMMARY 中提到 ProjectArchive），快照内容应包含 `Activity.roleId` 和 `ActivityExecutor[]` 完整数据

### 9.12 审计日志

**文件**: `AuditLog` 服务

**新增需要记录的事件**:
- `RoleMember` 增 / 改 / 软删 / 物理删
- `Activity.roleId` 变更
- `ActivityExecutor` 批量变更（记录前后差异）

---

## 10. 测试覆盖要求

### 10.1 后端单测（Vitest）

`server/src/utils/__tests__/roleMembershipResolver.test.ts`:
- ✅ 单成员角色：`autoAssignByRole` 返回 1 人
- ✅ 多成员角色：返回所有 `isActive=true` 成员，按 `sortOrder` 排序
- ✅ 软删除成员：不被返回
- ✅ 空角色：返回空数组，不抛错
- ✅ 不存在的角色 ID：返回空数组（或抛错——按团队约定）
- ✅ `findRolesByUser` 反查正确性
- ✅ `findActiveActivitiesByExecutor` 仅返回非归档非完成活动

`server/src/routes/__tests__/roleMembers.test.ts`:
- ✅ POST 创建：成功 / 重复 409 / 已软删则恢复
- ✅ PATCH 修改 sortOrder / isActive
- ✅ DELETE 三种 cascadeMode 的行为
- ✅ DELETE 不影响归档项目活动
- ✅ batch-set 事务正确性（增删改混合）

`server/src/routes/__tests__/activities.test.ts` 增加：
- ✅ POST 活动 + roleId（无 executorIds）→ 自动填入全员
- ✅ POST 活动 + roleId + executorIds（子集）→ 仅指定的人，正确标记 source
- ✅ POST 活动 + roleId（映射为空）→ 创建成功，executors 为空
- ✅ PATCH 仅改 roleId → 不重置 executors
- ✅ PATCH 仅改 executorIds → roleId 不变
- ✅ PATCH `resetExecutorsByRole=true` → 完全重置
- ✅ 归档项目活动写入被拦截

### 10.2 数据迁移测试

`server/scripts/__tests__/migration.test.ts`:
- ✅ 准备 fixture 数据库（含各种 executorId case）
- ✅ 跑迁移脚本
- ✅ 验证迁移后：
  - 老 executorId 都进了 `ActivityExecutor`
  - 单角色用户的 `roleId` 正确推导
  - 联系人活动的 `roleId` 为 null，source=MANUAL_ADD
  - 多角色用户取首个非管理员
  - `RoleMember` 表自动构建出合理的初始映射
  - 备份表行数 == 新 ActivityExecutor 行数

### 10.3 E2E 测试（Playwright）

`e2e/specs/activity-role-binding.spec.ts`:

**场景 1: 创建活动自动填充**
- 管理员配置「硬件工程师」角色含 3 人（张三、李四、王五）
- 项目经理创建活动选「硬件工程师」→ 验证执行人列表自动出现 3 人
- 删除其中 1 人 → 保存 → 重开活动 → 验证只有 2 人

**场景 2: 切换角色重置**
- 创建活动选「硬件工程师」→ 显示 3 人
- 切换为「测试工程师」→ 弹确认 → 确认后变成测试组成员
- 重新选「硬件工程师」→ 弹确认 → 确认后回到 3 人

**场景 3: 缺映射软提示**
- 配置一个空角色「采购工程师」（无成员）
- 创建活动选此角色 → 执行人区显示「⚠️ 未配置」
- 仍可保存 → 列表里红字提示
- 风险评估对该活动加分

**场景 4: 张三离职**
- 张三在「硬件工程师」组，且是 5 个进行中活动的执行人
- 管理员从角色组移除张三 → 选「全部移除」
- 验证 5 个活动的 ActivityExecutor 里都没有张三
- 验证 RoleMember 里张三 `isActive=false`（软删）
- 创建一个归档项目下的活动里张三仍存在 → 确认未被清理

**场景 5: 内联编辑**
- 列表中点击「角色」单元格 → 弹下拉切换
- 验证执行人列**不**自动联动
- 点「⟳」按钮 → 执行人列重置为新角色映射

### 10.4 无障碍测试（axe-core）

延续 Atlas 现有 WCAG 2.0 AA 检查：
- 角色成员管理页 keyboard 导航完整
- 拖拽排序提供键盘替代方案
- 红字提示有 aria-live="polite"

---

## 11. 权限与缓存

### 11.1 新增权限

无需新增 resource，复用现有 `role` resource：

| 权限 | 含义 |
|---|---|
| `role:read` | 查看角色和角色成员 |
| `role:update` | 修改角色成员（增删改） |

### 11.2 默认权限矩阵更新

| RBAC 角色 | role:read | role:update |
|---|---|---|
| 系统管理员 | ✓ | ✓ |
| 项目经理 | ✓ | ✗ |
| 研发工程师 / 普通成员 | ✓ | ✗ |
| 只读 | ✓ | ✗ |

### 11.3 缓存

- 修改 `RoleMember` → **不**清认证缓存（不影响 RBAC 权限）
- 修改 `Role` 本身 → 沿用现有清缓存逻辑

---

## 12. 实施清单

按依赖顺序，建议实施步骤：

### Phase 1: 数据层（2 天）

- [ ] 修改 `prisma/schema.prisma` 添加 RoleMember / ActivityExecutor / 修改 Activity
- [ ] `prisma db push` + `prisma generate`
- [ ] 重启开发服务验证 schema 应用成功
- [ ] 编写 `utils/roleMembershipResolver.ts`
- [ ] 编写对应单测

### Phase 2: 后端 API（2 天）

- [ ] 新增 `routes/roleMembers.ts` + 挂载
- [ ] 新增 `schemas/roleMember.ts`
- [ ] 修改 `routes/activities.ts` + `schemas/activity.ts`
- [ ] 处理活动 CRUD 的来源标记逻辑
- [ ] 编写路由单测

### Phase 3: 数据迁移（1.5 天）

- [ ] 编写 `scripts/migrate-role-binding.ts`
- [ ] 编写 `scripts/verify-role-binding-migration.ts`
- [ ] 编写迁移测试（fixture + 期望结果）
- [ ] 在 dev 环境完整跑一遍迁移并验证

### Phase 4: 前端核心交互（3.5 天）

- [ ] 修改活动创建/编辑表单（角色选择 + 执行人区）
- [ ] 修改活动列表显示（两列改造）
- [ ] 修改活动列表内联编辑
- [ ] 添加 `/admin/role-members` 页面
- [ ] 实现拖拽排序、增删成员、软删除流程
- [ ] 修改 `client/src/types/index.ts` 类型
- [ ] 修改 `client/src/api/` 添加 roleMembers API 封装

### Phase 5: 影响面联动（2 天）

- [ ] Excel 导入适配
- [ ] 项目复制适配
- [ ] 风险评估规则更新
- [ ] 资源看板查询适配
- [ ] 周报查询适配
- [ ] 通知策略改造（含配置开关）
- [ ] 撤回栈适配
- [ ] 项目归档快照适配
- [ ] 审计日志记录新事件

### Phase 6: 测试与验收（2 天）

- [ ] 完成所有 E2E 测试
- [ ] 完成无障碍测试
- [ ] 全量回归测试运行
- [ ] 修复发现的问题

### Phase 7: 文档与上线（1 天）

- [ ] 更新 `docs/INDEX.md`，添加本规格文档索引
- [ ] 更新 `PROJECT_SUMMARY.md` 中"关键设计决策"章节
- [ ] 更新 `permission-spec.md` 权限矩阵
- [ ] 在 staging 环境完整演练迁移流程
- [ ] 上线 + 监控

### Phase 8: 缓冲（1 天）

预留处理上线后小问题。

---

## 附录 A: 字段命名约定

| 概念 | 字段名 | 说明 |
|---|---|---|
| 活动绑定的角色 ID | `Activity.roleId` | 单数；可为 null |
| 活动执行人列表 | `Activity.executors` | 复数；多对多关系 |
| 全局角色成员表 | `RoleMember` | 大驼峰 |
| 执行人来源 | `ActivityExecutor.source` | enum |
| 角色快照 | `ActivityExecutor.snapshotRoleId` | 加入时的 roleId 副本 |
| 软删除标记 | `RoleMember.isActive` | 默认 true |
| 主负责人 | （非字段，通过 sortOrder 派生）| 列表第一项 |

---

## 附录 B: 与现有规格文档的关系

本规格与以下现有文档存在交叉，实施时需同步检查：

| 文档 | 交叉点 |
|---|---|
| `activity-list-inline-edit.md` | 内联编辑约束（单例 + 依赖锁定）|
| `permission-spec.md` | role 资源的权限定义 |
| `auth-spec.md` | 认证缓存机制 |
| `risk-spec.md`（如存在）| 风险规则中的"无负责人活动"加分项 |

实施完成后，需要同步更新这些文档中的对应章节。

---

## 附录 C: 决策记录

本规格基于以下决策（已敲定，不再改动）：

| 决策点 | 选择 |
|---|---|
| 角色实体 | 复用 RBAC 角色，不新建独立实体 |
| 映射层 | 全局级（一份"角色 → 人员"全公司共用）|
| 执行人字段 | 角色 + 人 并存持久化 |
| 默认填充策略 | 自动填入全员，用户可手删（从宽默认）|
| 缺映射兜底 | 软性提示，允许创建活动并留空 |
| 老数据处理 | 完全替换（不保留"直接选人"路径）|
| 多项目并行下的全局映射 | 通过软删除 + 显式级联询问解决"一改动众"问题 |
| 通知策略 | 创建时仅通知主负责人 + 站内消息抄送其他人，可配置开关 |

---

**规格文档结束**

实施过程中如有任何不明确之处，请回到本文档对应章节核对；如发现规格本身有矛盾或遗漏，请记录后与规格作者讨论后再决定。
