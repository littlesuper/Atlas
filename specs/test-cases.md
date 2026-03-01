# Atlas 系统测试用例

> 根据需求规格文档撰写，覆盖 认证、权限、项目、产品、系统 五个模块。

---

## 一、认证模块（auth-spec）

### 1.1 登录

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| AUTH-001 | 正常登录 | 存在用户 admin/admin123 | POST `/api/auth/login` `{"username":"admin","password":"admin123"}` | 200，返回 accessToken、refreshToken、user 对象 |
| AUTH-002 | 用户名错误 | — | POST `/api/auth/login` `{"username":"notexist","password":"123"}` | 401，`"用户名或密码错误"` |
| AUTH-003 | 密码错误 | 存在用户 admin | POST `/api/auth/login` `{"username":"admin","password":"wrong"}` | 401，`"用户名或密码错误"` |
| AUTH-004 | 禁用账号登录 | 用户 status=DISABLED | POST `/api/auth/login` 使用该用户凭据 | 403，`"账号已被禁用"` |
| AUTH-005 | 缺少用户名 | — | POST `/api/auth/login` `{"password":"123"}` | 400 |
| AUTH-006 | 缺少密码 | — | POST `/api/auth/login` `{"username":"admin"}` | 400 |
| AUTH-007 | 空请求体 | — | POST `/api/auth/login` `{}` | 400 |
| AUTH-008 | canLogin=false 用户登录 | 用户 canLogin=false | POST `/api/auth/login` | 401，无法登录 |

### 1.2 Token 刷新

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| AUTH-010 | 正常刷新 | 持有有效 refreshToken | POST `/api/auth/refresh` `{"refreshToken":"..."}` | 200，返回新 accessToken |
| AUTH-011 | 无效 refreshToken | — | POST `/api/auth/refresh` `{"refreshToken":"invalid"}` | 401，`"刷新令牌无效"` |
| AUTH-012 | 缺少 refreshToken | — | POST `/api/auth/refresh` `{}` | 401 |

### 1.3 获取当前用户

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| AUTH-020 | 正常获取 | 持有有效 accessToken | GET `/api/auth/me` | 200，返回 id、username、realName、roles、permissions |
| AUTH-021 | 未携带 Token | — | GET `/api/auth/me` 无 Authorization 头 | 401 |
| AUTH-022 | 过期 Token | — | GET `/api/auth/me` 使用过期 Token | 401 |

---

## 二、权限管理模块（permission-spec）

### 2.1 角色管理

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| ROLE-001 | 获取角色列表 | admin 登录 | GET `/api/roles` | 200，返回角色数组，包含预置角色 |
| ROLE-002 | 获取权限列表 | admin 登录 | GET `/api/roles/permissions` | 200，返回所有 resource:action 组合 |
| ROLE-003 | 创建角色 | admin 登录 | POST `/api/roles` `{"name":"测试角色","permissionIds":[...]}` | 201，返回新角色 |
| ROLE-004 | 创建重名角色 | 已存在同名角色 | POST `/api/roles` `{"name":"系统管理员"}` | 400 |
| ROLE-005 | 更新角色权限 | 角色已存在 | PUT `/api/roles/:id` `{"permissionIds":[...]}` | 200，权限全量替换 |
| ROLE-006 | 删除无用户角色 | 角色未分配给任何用户 | DELETE `/api/roles/:id` | 200 |
| ROLE-007 | 删除已分配角色 | 角色已分配给 N 个用户 | DELETE `/api/roles/:id` | 400，`"该角色已分配给 N 个用户，请先取消分配后再删除"` |
| ROLE-008 | 无权限创建角色 | 普通用户登录 | POST `/api/roles` | 403，`"权限不足"` |

### 2.2 用户管理

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| USER-001 | 获取用户列表 | admin 登录 | GET `/api/users` | 200，返回分页用户列表 |
| USER-002 | 创建可登录用户 | admin 登录 | POST `/api/users` `{"realName":"王五","canLogin":true,"password":"123456","roleIds":[...]}` | 201，username 自动生成拼音 |
| USER-003 | 创建仅联系人 | admin 登录 | POST `/api/users` `{"realName":"赵六","canLogin":false}` | 201，无需 username/password |
| USER-004 | 用户名唯一性 | 已存在同名用户 | POST `/api/users` 重复 username | 400 |
| USER-005 | 更新用户状态 | 用户存在 | PUT `/api/users/:id` `{"status":"DISABLED"}` | 200，用户被禁用 |
| USER-006 | 更新用户角色 | 用户存在 | PUT `/api/users/:id` `{"roleIds":[...]}` | 200，角色全量替换 |
| USER-007 | 删除普通用户 | 用户不是任何项目经理 | DELETE `/api/users/:id` | 200 |
| USER-008 | 删除项目经理 | 用户是 N 个项目的经理 | DELETE `/api/users/:id` | 400，`"该用户是 N 个项目的项目经理，请先转移项目经理后再删除"` |
| USER-009 | 无权限操作 | 只读用户登录 | POST `/api/users` | 403 |

### 2.3 权限匹配

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| PERM-001 | 精确匹配 | 用户拥有 `project:read` | 访问需要 `project:read` 的接口 | 允许 |
| PERM-002 | 资源通配 | 用户拥有 `project:*` | 访问需要 `project:delete` 的接口 | 允许 |
| PERM-003 | 动作通配 | 用户拥有 `*:read` | 访问需要 `product:read` 的接口 | 允许 |
| PERM-004 | 全通配 | 用户拥有 `*:*` | 访问任意接口 | 允许 |
| PERM-005 | 无匹配 | 用户仅有 `project:read` | 访问需要 `project:delete` 的接口 | 403 |

---

## 三、项目管理模块（project-spec）

### 3.1 项目 CRUD

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| PROJ-001 | 获取项目列表 | 登录 | GET `/api/projects` | 200，返回 data、total、stats（all/inProgress/completed/onHold） |
| PROJ-002 | 按关键字筛选 | 存在项目 | GET `/api/projects?keyword=传感器` | 200，模糊匹配 name 或 description |
| PROJ-003 | 按状态筛选 | 存在项目 | GET `/api/projects?status=IN_PROGRESS` | 200，仅返回进行中项目 |
| PROJ-004 | 创建项目 | admin 登录 | POST `/api/projects` `{"name":"新项目","managerId":"uuid","status":"IN_PROGRESS"}` | 201，默认状态 IN_PROGRESS |
| PROJ-005 | 创建项目缺必填字段 | admin 登录 | POST `/api/projects` `{"description":"无名"}` | 400 |
| PROJ-006 | 更新项目 | 项目经理登录 | PUT `/api/projects/:id` `{"name":"改名"}` | 200 |
| PROJ-007 | 非管理者更新 | 非项目经理/协作者 | PUT `/api/projects/:id` | 403 |
| PROJ-008 | 删除项目 | admin 登录 | DELETE `/api/projects/:id` | 200，级联删除活动 |
| PROJ-009 | 无效状态值 | — | POST `/api/projects` `{"status":"INVALID"}` | 400 |
| PROJ-010 | 结束日期早于开始日期 | — | POST `/api/projects` `{"startDate":"2026-06-01","endDate":"2026-01-01"}` | 400 |
| PROJ-011 | 项目状态为 IN_PROGRESS/COMPLETED/ON_HOLD | — | 分别创建 3 种状态的项目 | 均成功，不再支持 PLANNING |

### 3.2 项目协作者

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| MEMB-001 | 获取协作者列表 | 项目存在 | GET `/api/projects/:id/members` | 200，返回协作者数组 |
| MEMB-002 | 添加协作者 | 项目经理登录 | POST `/api/projects/:id/members` `{"userId":"uuid"}` | 200 |
| MEMB-003 | 重复添加协作者 | 用户已是协作者 | POST `/api/projects/:id/members` | 400，`"用户已是协作者"` |
| MEMB-004 | 添加项目经理为协作者 | — | POST `/api/projects/:id/members` userId=managerId | 400，`"用户是项目经理"` |
| MEMB-005 | 移除协作者 | 协作者存在 | DELETE `/api/projects/:id/members/:userId` | 200 |
| MEMB-006 | 协作者无权管理协作者 | 协作者登录 | POST `/api/projects/:id/members` | 403 |

### 3.3 活动管理

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| ACT-001 | 获取活动树 | 项目有活动 | GET `/api/activities/project/:projectId` | 200，返回树形结构含 children |
| ACT-002 | 获取甘特图数据 | 项目有活动 | GET `/api/activities/project/:projectId/gantt` | 200，返回 tasks + links |
| ACT-003 | 创建任务 | 项目管理者登录 | POST `/api/activities` `{"projectId":"uuid","name":"设计","type":"TASK"}` | 201 |
| ACT-004 | 创建里程碑 | 项目管理者登录 | POST `/api/activities` `{"type":"MILESTONE","name":"EVT评审"}` | 201 |
| ACT-005 | 更新活动状态 | 活动存在 | PUT `/api/activities/:id` `{"status":"COMPLETED"}` | 200，项目进度自动重算 |
| ACT-006 | 删除父活动 | 父活动含子活动 | DELETE `/api/activities/:id` | 200，级联删除所有子活动 |
| ACT-007 | 设置前置依赖 | 存在多个活动 | PUT `/api/activities/:id` `{"dependencies":[{"id":"uuid","type":"0"}]}` | 200，FS 依赖建立 |
| ACT-008 | 批量排序 | 项目有多个活动 | PUT `/api/activities/project/:projectId/reorder` | 200，sortOrder 更新 |
| ACT-009 | 自动计算工期 | — | 创建活动带 planStartDate + planEndDate，不传 planDuration | 201，自动计算工作日 |
| ACT-010 | 非管理者创建 | 非项目经理/协作者 | POST `/api/activities` | 403 |
| ACT-011 | 活动类型枚举 | — | 分别创建 TASK/MILESTONE/PHASE 类型 | 均成功 |
| ACT-012 | 活动状态枚举 | — | 分别设置 NOT_STARTED/IN_PROGRESS/COMPLETED/CANCELLED | 均成功 |

### 3.4 批量导入活动

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| IMP-001 | 导入 Excel 活动 | 项目存在，有权限 | POST `/api/activities/project/:projectId/import-excel` 上传 xlsx | 200，批量创建活动，count 等于新建行数 |
| IMP-002 | 自动创建联系人 | Excel 含不存在的负责人 | 同上 | 200，自动创建 canLogin=false 用户，createdUsers 列出新建姓名，username 为拼音（重复时加数字后缀） |
| IMP-003 | 阶段自动识别 | Excel 阶段列含 "1EVT阶段" | 同上 | 活动 phase 为 "EVT" |
| IMP-004 | 多负责人解析 | 负责人列含 "张三(昵称), 李四(昵称)" | 同上 | 活动关联两个负责人 |
| IMP-005 | 空文件 | 上传空 Excel | 同上 | 200，count=0 |
| IMP-006 | 无权限导入 | 非项目经理/协作者 | 同上 | 403 |
| IMP-007 | 非 Excel 文件 | 上传 .txt 文件 | 同上 | 400，仅支持 xlsx/xls |
| IMP-008 | 重复行跳过 | 再次导入相同 xlsx | 同上 | 200，skipped 等于重复行数，count 仅含新增行 |
| IMP-009 | 撤回导入 | 导入成功后撤回栈非空 | 点击工具栏撤回按钮，确认弹窗中确认 | 已导入的活动全部删除，页面刷新 |
| IMP-010 | 撤回删除单条活动 | 删除单条活动后撤回栈非空 | 点击工具栏撤回按钮，确认弹窗中确认 | 活动恢复，可在列表中找到 |
| IMP-011 | 撤回批量删除 | 批量删除多条活动后撤回栈非空 | 点击工具栏撤回按钮，确认弹窗中确认 | 所有活动快速批量恢复 |
| IMP-012 | 撤回按钮无操作时置灰 | 页面刚加载，无任何操作 | 检查撤回按钮状态 | 按钮 disabled，Tooltip 提示"没有可撤回的操作" |
| IMP-013 | 撤回内联编辑 | 内联编辑活动名称后 | 点击工具栏撤回按钮，确认弹窗中确认 | 活动名称恢复原值 |
| IMP-014 | 撤回批量修改状态 | 批量修改活动状态后 | 点击工具栏撤回按钮，确认弹窗中确认 | 活动状态恢复为修改前的值 |
| IMP-015 | 撤回拖拽排序 | 拖拽调整活动顺序后 | 点击工具栏撤回按钮，确认弹窗中确认 | 活动恢复原顺序 |
| IMP-016 | 连续撤回多次操作 | 执行多次编辑操作后 | 连续多次点击撤回按钮并确认 | 按后进先出顺序逐一撤回 |

### 3.6 项目快照

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| SNAP-001 | 创建项目快照 | 项目有活动 | POST `/api/projects/:id/snapshot` | 200，snapshot 含项目全量数据（活动、产品、周报、风险评估） |
| SNAP-002 | 创建带备注的快照 | 项目存在 | POST `/api/projects/:id/snapshot` body: `{ remark: "EVT完成" }` | 200，remark 字段保存 |
| SNAP-003 | 获取快照列表 | 已有快照 | GET `/api/projects/:id/archives` | 200，按时间倒序，含创建人信息，不含 snapshot 详情 |
| SNAP-004 | 获取快照详情 | 快照存在 | GET `/api/projects/archives/:archiveId` | 200，含完整 snapshot 数据 |
| SNAP-005 | 查看快照只读页面 | 快照存在 | 访问 `/projects/:id/snapshot/:snapshotId` | 复用项目详情页，所有内容只读，隐藏排期工具和项目快照 Tab |
| SNAP-006 | 快照返回导航 | 在快照页面 | 点击"返回项目" | 跳转到项目详情的快照 Tab |

### 3.7 风险评估

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| RISK-001 | 发起风险评估 | 项目有活动 | POST `/api/risk/project/:projectId/assess` | 200，返回 riskLevel + riskFactors + suggestions |
| RISK-002 | 低风险项目 | 所有活动按时进行 | POST assess | riskLevel=LOW（得分 < 2） |
| RISK-003 | 高风险项目 | 多个活动逾期 | POST assess | riskLevel=HIGH 或 CRITICAL |
| RISK-004 | 获取评估历史 | 已有评估记录 | GET `/api/risk/project/:projectId` | 200，历史记录列表 |
| RISK-005 | 空状态展示 | 项目无评估记录 | 打开 AI 风险评估 Tab | 页面仅显示一条 Empty 提示，工具栏计数区域为空，无重复文字 |
| RISK-006 | 风险趋势图显示 | 已有 ≥ 2 条评估记录 | 打开 AI 风险评估 Tab | 评估卡片上方显示折线趋势图 |

### 3.8 周报管理

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| WR-001 | 创建周报 | 项目管理者登录 | POST `/api/weekly-reports` | 201，status=DRAFT |
| WR-002 | 同周重复创建 | 该项目该周已有周报 | POST `/api/weekly-reports` 相同 projectId+weekStart | 400，`"该项目该周已有周报"` |
| WR-003 | 提交周报 | 草稿存在 | POST `/api/weekly-reports/:id/submit` | 200，status→SUBMITTED |
| WR-004 | 更新草稿 | 草稿存在 | PUT `/api/weekly-reports/:id` | 200 |
| WR-005 | 删除周报 | 周报存在 | DELETE `/api/weekly-reports/:id` | 200 |
| WR-006 | 获取项目周报列表 | 项目有周报 | GET `/api/weekly-reports/project/:projectId` | 200 |
| WR-007 | 获取所有草稿 | 系统存在草稿周报 | GET `/api/weekly-reports/drafts` | 200，返回所有草稿（不限创建者） |
| WR-008 | 按周汇总 | 该周有周报 | GET `/api/weekly-reports/week/:year/:weekNumber` | 200 |
| WR-009 | AI 建议 | 项目有活动数据 | POST `/api/weekly-reports/project/:projectId/ai-suggestions` | 200，返回 keyProgress/nextWeekPlan/riskWarning |
| WR-010 | progressStatus 枚举 | — | 分别设置 ON_TRACK/MINOR_ISSUE/MAJOR_ISSUE | 均成功 |
| WR-011 | 草稿箱列与已提交一致 | 存在草稿周报 | 切换到草稿箱 Tab | 表格列与已提交周报一致（项目名称、产品线、状态、变更概述、需求研判、本周进展、下周计划、风险预警、操作） |

### 3.9 资源看板

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| RES-001 | 资源看板 API | 登录，有活动数据 | GET `/api/activities/workload` | 200，返回 `{ summary, members, issues }` 三段式结构 |
| RES-002 | 项目筛选 | 登录 | GET `/api/activities/workload?projectId=xxx` | 200，仅返回该项目的资源数据 |
| RES-003 | 统计卡片 | 有逾期/无负责人活动 | 打开 /workload 页面 | 显示 3 个统计卡片：逾期任务（红色）、无人负责（橙色）、超载人员（深红） |
| RES-004 | 人员负载条形图 | 有分配了负责人的活动 | 打开 /workload 页面 | 每人一行堆叠条形图（蓝=进行中、灰=未开始、红=逾期），Tooltip 显示具体数字 |
| RES-005 | 超载标记 | 某人进行中活动 ≥ 5 | 打开 /workload 页面 | 该行红色浅背景 + 红色"超载"Tag |
| RES-006 | 需关注表格-逾期 | 有逾期活动 | 打开 /workload 页面 | 需关注表格显示红点 + "逾期 N 天"（红字） |
| RES-007 | 需关注表格-无人负责 | 有未分配负责人的活动 | 打开 /workload 页面 | 需关注表格显示橙点 + 计划时间范围 |
| RES-008 | 需关注空状态 | 无逾期、无未分配活动 | 打开 /workload 页面 | 显示绿色 "✓ 暂无需关注事项" |

---

## 四、产品管理模块（product-spec）

### 4.1 产品 CRUD

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| PROD-001 | 获取产品列表 | 登录 | GET `/api/products` | 200，返回 data + stats（all/developing/production/discontinued） |
| PROD-002 | 按状态筛选 | 有产品 | GET `/api/products?status=DEVELOPING` | 200，仅返回研发中产品 |
| PROD-003 | 按类别筛选 | 有产品 | GET `/api/products?category=ROUTER` | 200，仅返回路由器类别 |
| PROD-004 | 关键字搜索 | 有产品 | GET `/api/products?keyword=智能` | 200，模糊匹配 name |
| PROD-005 | 规格搜索 | 产品有规格数据 | GET `/api/products?specKeyword=3.3V` | 200，匹配规格 key/value |
| PROD-006 | 创建产品 | 有 product:create 权限 | POST `/api/products` `{"name":"传感器","model":"XYZ-100","revision":"V1.0","category":"ROUTER"}` | 201，默认 status=DEVELOPING |
| PROD-007 | 型号+版本唯一性 | 已存在 XYZ-100 V1.0 | POST `/api/products` 相同 model+revision | 409 |
| PROD-008 | 获取单个产品 | 产品存在 | GET `/api/products/:id` | 200 |
| PROD-009 | 更新产品 | 有 product:update 权限 | PUT `/api/products/:id` `{"name":"改名"}` | 200，自动记录变更日志 |
| PROD-010 | 删除产品 | 有 product:delete 权限 | DELETE `/api/products/:id` | 200 |

### 4.2 产品状态流转

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| PROD-020 | DEVELOPING → PRODUCTION | 产品为研发中 | PUT `{"status":"PRODUCTION"}` | 200 |
| PROD-021 | PRODUCTION → DISCONTINUED | 产品为量产中 | PUT `{"status":"DISCONTINUED"}` | 200 |
| PROD-022 | DISCONTINUED → PRODUCTION（逆向） | 产品为已停产 | PUT `{"status":"PRODUCTION"}` | 400，不可逆转 |
| PROD-023 | DEVELOPING → DISCONTINUED（跳级） | 产品为研发中 | PUT `{"status":"DISCONTINUED"}` | 400，不可跳级 |
| PROD-024 | PRODUCTION → DEVELOPING（回退） | 产品为量产中 | PUT `{"status":"DEVELOPING"}` | 400，不可回退 |

### 4.3 产品复制

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| PROD-030 | 正常复制 | 产品存在 | POST `/api/products/:id/copy` `{"revision":"V2.0"}` | 201，复制 name/model/category/specs/performance，新 revision，status 强制 DEVELOPING |
| PROD-031 | 复制不含文件 | 原产品有图片/文档 | POST copy | 201，images/documents 为空 |
| PROD-032 | 复制版本冲突 | 目标 model+revision 已存在 | POST copy | 409 |

### 4.4 变更日志

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| PROD-040 | 创建记录日志 | — | 创建产品后查日志 | action=CREATE |
| PROD-041 | 更新记录日志 | — | 更新产品后查日志 | action=UPDATE，changes 含 diff |
| PROD-042 | 删除记录日志 | — | 删除产品后查日志 | action=DELETE |
| PROD-043 | 复制记录日志 | — | 复制产品后查日志 | action=COPY |
| PROD-044 | 获取变更日志 | 有日志 | GET `/api/products/:id/changelog` | 200，最多 50 条 |

### 4.5 CSV 导出

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| PROD-050 | 全量导出 | 有产品 | GET `/api/products/export` | 200，UTF-8 BOM CSV |
| PROD-051 | 筛选后导出 | 有产品 | GET `/api/products/export?status=DEVELOPING` | 200，仅导出研发中产品 |

---

## 五、系统与文件模块（system-spec）

### 5.1 文件上传

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| FILE-001 | 上传图片 | 登录 | POST `/api/uploads` multipart（png 文件） | 200，返回 name/url/size/mimetype |
| FILE-002 | 上传文档 | 登录 | POST `/api/uploads` multipart（pdf 文件） | 200 |
| FILE-003 | 不支持的文件类型 | — | POST `/api/uploads` multipart（.exe 文件） | 400，`"Unsupported file type"` |
| FILE-004 | 超过 10MB | — | POST `/api/uploads` > 10MB 文件 | 413 |
| FILE-005 | 删除文件 | 文件存在 | DELETE `/api/uploads/:filename` | 200 |

### 5.2 审计日志

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| AUDIT-001 | 获取审计日志 | admin 登录 | GET `/api/audit-logs` | 200，返回操作记录 |

### 5.3 通知系统

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| NOTIF-001 | 获取通知列表 | 登录 | GET `/api/notifications` | 200 |

### 5.4 路由鉴权

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| NAV-001 | 未登录访问 /projects | 未登录 | 浏览器访问 /projects | 重定向到 /login |
| NAV-002 | 登录后访问 / | 已登录 | 浏览器访问 / | 重定向到 /projects |
| NAV-003 | 无权限访问 /admin | 只读用户 | 浏览器访问 /admin | 403 或隐藏入口 |

### 5.5 版本号与健康检查

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| VER-001 | 健康检查返回版本号 | 服务运行中 | GET `/api/health` | 200，返回 `version` 字段格式为 `x.y.z` |
| VER-002 | 版本号与 package.json 一致 | — | GET `/api/health`，对比 package.json version | 两者一致 |
| VER-003 | 前端动态获取版本号 | 已登录 | 点击右上角用户头像下拉菜单 | 底部显示 `vx.y.z`，与 `/api/health` 返回值一致 |
| VER-004 | commit 后版本自动递增 | version=1.1.3 | 执行 git commit | package.json version 变为 1.1.4 |
| VER-005 | 修改大版本后 z 重置 | version=1.1.5，手动改为 2.0.5 | 执行 git commit | version 变为 2.0.1（z 重置为 1） |
| VER-006 | 修改小版本后 z 重置 | version=1.1.5，手动改为 1.2.5 | 执行 git commit | version 变为 1.2.1（z 重置为 1） |

### 5.6 AI 配置

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| AI-001 | 获取 AI 配置列表 | admin 登录 | GET `/api/ai-config` | 200 |
| AI-002 | 创建 AI 配置 | admin 登录 | POST `/api/ai-config` `{"name":"GPT-4o","apiKey":"sk-...","apiUrl":"...","modelName":"gpt-4o-mini","features":"risk"}` | 201 |
| AI-003 | API Key 脱敏 | 配置已存在 | GET `/api/ai-config` | apiKey 显示为 `****` + 末 4 位 |
| AI-004 | 测试连接 | 配置已存在 | POST `/api/ai-config/test-connection` | 200，发送 max_tokens=5 的最小请求 |
| AI-005 | 功能绑定唯一性 | 已有 risk 绑定 | 创建新配置绑定 risk | 旧配置自动解绑 risk |
| AI-006 | 删除 AI 配置 | 配置存在 | DELETE `/api/ai-config/:id` | 200 |

---

## 六、项目模板模块

### 6.1 模板 CRUD

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| TPL-001 | 获取模板列表 | 登录 | GET `/api/templates` | 200，返回模板数组含 _count.activities |
| TPL-002 | 创建模板 | 登录 | POST `/api/templates` `{"name":"标准模板","activities":[...]}` | 201 |
| TPL-003 | 获取模板详情 | 模板存在 | GET `/api/templates/:id` | 200，含 activities 数组 |
| TPL-004 | 更新模板 | 模板存在 | PUT `/api/templates/:id` | 200 |
| TPL-005 | 删除模板 | 模板存在 | DELETE `/api/templates/:id` | 200 |
| TPL-006 | 复制模板 | 模板存在 | 前端执行复制逻辑（获取 → 重映射 ID → 创建） | 新模板名为 "原名 (副本)" |

### 6.2 模板活动

| 编号 | 用例名称 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| TPL-010 | 添加活动 | 编辑模板中 | 点击"添加活动" | 新增一行，默认类型 TASK |
| TPL-011 | 插入活动 | 活动列表有行 | 点击行间 + 号 | 在指定位置插入，sortOrder 重排 |
| TPL-012 | 编辑活动名称 | 活动行存在 | 直接在 Input 中输入 | 即时更新 |
| TPL-013 | 设置活动类型 | 活动行存在 | Select 选择 MILESTONE | 即时更新 |
| TPL-014 | 设置阶段 | 活动行存在 | Select 选择 EVT/DVT/PVT/MP | 即时更新 |
| TPL-015 | 设置工期 | 活动行存在 | InputNumber 输入天数 | 即时更新 |
| TPL-016 | 设置前置依赖 | 至少 2 个活动 | 输入 "001FS" 或 "002SS+3" | 解析为依赖数组 |
| TPL-017 | 删除活动 | 活动行存在 | 点击删除按钮 | 行移除，其他活动的依赖中该 ID 也被清理 |
| TPL-018 | 拖拽排序 | 多个活动 | 拖拽 handle 移动行 | sortOrder 更新，ID 序号重排 |
| TPL-019 | ID 列显示 | 有活动 | 查看 ID 列 | 显示 3 位补零序号（001, 002, 003） |
