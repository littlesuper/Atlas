# Atlas E2E 测试用例集（完整版）

> 基于 Playwright + Arco Design 的端到端测试套件
> 共 **33 个测试文件**，**163 个测试用例**（全部通过）

---

## 测试架构

```
e2e/
├── auth.setup.ts           # 登录态持久化（storageState）
├── global-teardown.ts      # 全局收尾：自动清理所有带时间戳后缀的测试数据
├── fixtures/
│   ├── auth.ts             # authedPage fixture + login helper
│   └── test-data.ts        # 测试账号、uniqueName 生成器
├── helpers/
│   └── arco.ts             # Arco Design 组件交互封装
└── specs/                  # 所有测试文件
    ├── ── 认证与权限 ──
    │   ├── auth.spec.ts                    # 登录/登出/鉴权重定向
    │   └── permission-access.spec.ts       # 非管理员权限访问控制 ★NEW
    │
    ├── ── 导航与布局 ──
    │   ├── navigation.spec.ts              # 侧边栏+Tab 导航
    │   └── responsive-layout.spec.ts       # 页面布局/Header/Avatar/铃铛 ★NEW
    │
    ├── ── 项目管理 ──
    │   ├── projects.spec.ts                # 项目 CRUD 基础
    │   ├── project-edit-search.spec.ts     # 项目编辑/搜索/状态/统计卡片 ★NEW
    │   ├── project-filters.spec.ts         # 产品线筛选
    │   └── project-detail-tabs.spec.ts     # 详情页多 Tab 切换 ★NEW
    │
    ├── ── 活动管理 ──
    │   ├── activities.spec.ts              # 活动 CRUD 基础
    │   ├── activity-filters.spec.ts        # 阶段/状态筛选 + Esc 退出
    │   ├── activity-inline-edit.spec.ts    # 内联编辑完整测试 ★NEW
    │   ├── activity-dependencies.spec.ts   # 活动依赖关系 ★NEW
    │   ├── activity-export.spec.ts         # 导入导出功能 ★NEW
    │   ├── column-settings.spec.ts         # 列设置/可见性切换 ★NEW
    │   ├── archives.spec.ts                # 归档管理
    │   └── comments.spec.ts                # 活动评论
    │
    ├── ── 全站 UI 质量 ──
    │   └── table-header-nowrap.spec.ts     # 全站表头禁止换行检测 ★NEW
    │
    ├── ── 甘特图 ──
    │   └── gantt-chart.spec.ts             # 甘特图视图/缩放 ★NEW
    │
    ├── ── 产品管理 ──
    │   ├── products.spec.ts                # 产品 CRUD 基础
    │   └── product-advanced.spec.ts        # 产品编辑/复制/类别/变更记录 ★NEW
    │
    ├── ── 周报管理 ──
    │   ├── weekly-reports.spec.ts          # 周报查看
    │   └── weekly-report-crud.spec.ts      # 周报创建/草稿/提交/筛选 ★NEW
    │
    ├── ── 资源负载 ──
    │   ├── workload.spec.ts                # 负载页面基础
    │   └── workload-advanced.spec.ts       # 负载筛选/统计/问题列表 ★NEW
    │
    ├── ── 系统管理 ──
    │   ├── admin.spec.ts                   # 系统管理 Tab 查看
    │   ├── user-management.spec.ts         # 用户 CRUD ★NEW
    │   ├── role-management.spec.ts         # 角色 CRUD + 权限 ★NEW
    │   ├── audit-log.spec.ts               # 审计日志查看/筛选/分页 ★NEW
    │   └── template-management.spec.ts     # 模板 CRUD + 活动 ★NEW
    │
    ├── ── 其他功能 ──
    │   ├── risk.spec.ts                    # 风险评估
    │   ├── scheduling-tools.spec.ts        # 排期工具
    │   ├── notifications.spec.ts           # 通知管理
    │   └── form-validation.spec.ts         # 表单验证错误处理 ★NEW
```

---

## 测试用例详细清单

### 1. 认证与权限 (auth.spec.ts + permission-access.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 1.1 | 正确凭据登录 | 重定向到 /projects |
| 1.2 | 错误密码登录 | 停留在 /login |
| 1.3 | 登出 | 重定向到 /login |
| 1.4 | 未认证访问受保护页面 | 重定向到 /login |
| 1.5 | 非管理员 zhangsan 登录 | 成功访问 /projects |
| 1.6 | 非管理员访问产品列表 | 可以查看 |
| 1.7 | 非管理员访问周报 | 可以查看 |
| 1.8 | 非管理员访问系统管理 | 权限限制或可访问 |
| 1.9 | 非管理员查看项目详情 | 可以查看 |
| 1.10 | lisi 账号登录 | 成功访问 |

### 2. 导航与布局 (navigation.spec.ts + responsive-layout.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 2.1 | 侧边栏导航到各模块 | URL 正确跳转 |
| 2.2 | 系统管理 Tab 切换 | 子 Tab 内容正确加载 |
| 2.3 | Header 显示 Logo/导航/头像 | 所有元素可见 |
| 2.4 | 侧边栏包含所有导航项 | 5 个导航项可见 |
| 2.5 | 点击头像显示下拉菜单 | 退出登录选项可见 |
| 2.6 | 通知铃铛图标存在 | 铃铛可见 |
| 2.7 | 项目表格结构正确 | 有表头和数据行 |
| 2.8 | 页面标题匹配路由 | 标题非空 |
| 2.9 | 表格水平溢出处理 | 不超出视口 |

### 3. 项目管理 (projects.spec.ts + project-edit-search.spec.ts + project-filters.spec.ts + project-detail-tabs.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 3.1 | 查看项目列表表格 | 表格可见 |
| 3.2 | 创建新项目 | 项目出现在列表中 |
| 3.3 | 点击进入项目详情 | URL 跳转到详情页 |
| 3.4 | 删除项目 | 项目从列表消失 |
| 3.5 | 统计卡片显示项目计数 | 卡片数量 ≥1 |
| 3.6 | 关键词搜索项目 | 匹配项可见，不匹配项消失 |
| 3.7 | 状态筛选项目 | 筛选后行数 ≤ 总数 |
| 3.8 | 编辑项目名称 | 更新后新名称可见 |
| 3.9 | 项目详情反映更新 | 详情页显示新名称 |
| 3.10 | 产品线筛选标签可见 | 蒲公英/向日葵标签可见 |
| 3.11 | 点击产品线标签切换筛选 | 行数变化后可恢复 |
| 3.12 | 不能取消最后一个产品线 | 至少保留一个选中 |
| 3.13 | 默认显示活动列表 Tab | 表格+新建活动按钮可见 |
| 3.14 | 切换到周报 Tab | 周报内容加载 |
| 3.15 | 切换到产品 Tab | 产品内容加载 |
| 3.16 | 切换到风险评估 Tab | 评估内容加载 |
| 3.17 | 切换到排期工具 Tab | 排期工具加载 |
| 3.18 | 切换到甘特图 Tab | 甘特图加载 |
| 3.19 | 切换回活动 Tab 保持数据 | 行数不变 |
| 3.20 | 快速切换 Tab 不崩溃 | 页面保持稳定 |

### 4. 活动管理 (activities.spec.ts + activity-filters.spec.ts + activity-inline-edit.spec.ts + activity-dependencies.spec.ts + activity-export.spec.ts + column-settings.spec.ts + archives.spec.ts + comments.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 4.1 | 创建活动 | 活动出现在表中 |
| 4.2 | 删除活动 | 活动从表中消失 |
| 4.3 | 阶段工期标签显示 | 至少一个阶段标签可见 |
| 4.4 | 点击阶段标签筛选 | 只显示匹配阶段的行 |
| 4.5 | 状态筛选"未开始" | 筛选结果 ≤ 总数 |
| 4.6 | 状态筛选"进行中" | 筛选结果 ≤ 总数 |
| 4.7 | Esc 退出内联编辑 | 编辑器消失 |
| 4.8 | 内联编辑活动名称 | API 调用成功，新名称显示 |
| 4.9 | 内联编辑活动状态 | 状态变更保存 |
| 4.10 | 内联编辑活动类型 | 类型变更保存 |
| 4.11 | Esc 不保存编辑 | 原始值保留 |
| 4.12 | Click-outside 关闭编辑 | 编辑器消失 |
| 4.13 | 活动 ID 三位补零 | 显示 001/002/003 |
| 4.14 | 内联编辑前置依赖 | 依赖保存并显示 |
| 4.15 | 设置带 Lag 的依赖 | FS+2 格式正确 |
| 4.16 | 导出按钮可见 | 按钮在工具栏 |
| 4.17 | CSV 导出触发下载 | 下载文件生成 |
| 4.18 | 批量导入弹窗打开 | Modal 显示拖拽上传区域 |
| 4.19 | 列设置弹窗打开 | 设置内容可见 |
| 4.20 | 切换列可见性 | 表头列数变化 |
| 4.21 | 列设置 Tab 切换后保持 | 列数不变 |
| 4.22 | 归档抽屉打开 | 归档管理可见 |
| 4.23 | 创建归档快照 | 归档数 +1 |
| 4.24 | 查看归档详情 | 表格显示活动 |
| 4.25 | 归档抽屉布局正确 | 高度和宽度合理 |
| 4.26 | 创建多个归档 | 归档数正确 |
| 4.27 | 切换归档 | 表格正常加载 |
| 4.28 | 删除归档 | 归档数 -1 |
| 4.29 | 删除所有归档空状态 | 显示空状态 |
| 4.30 | 添加活动评论 | 评论发送成功 |
| 4.31 | 查看变更历史 | 历史 Tab 切换 |

### 5. 甘特图 (gantt-chart.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 5.1 | 切换到甘特图 Tab | 甘特容器可见 |
| 5.2 | 缩放控件功能 | 日/周/月/季/年切换 |
| 5.3 | 甘特图显示活动条 | 活动名称可见 |

### 6. 产品管理 (products.spec.ts + product-advanced.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 6.1 | 查看产品列表 | 表格可见 |
| 6.2 | 创建新产品 | 产品出现在列表 |
| 6.3 | 删除产品 | 产品从列表消失 |
| 6.4 | 编辑产品名称和型号 | API 成功，新信息显示 |
| 6.5 | 复制产品 | 复制品出现 |
| 6.6 | 产品类别选择显示规格模板 | 类别切换正常 |
| 6.7 | 查看产品详情 | 详情抽屉/页面可见 |

### 7. 周报管理 (weekly-reports.spec.ts + weekly-report-crud.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 7.1 | 查看周报汇总页 | 表格可见 |
| 7.2 | 从项目详情进入周报 Tab | 周报内容可见 |
| 7.3 | 从项目 Tab 创建周报 | 跳转到表单页 |
| 7.4 | 保存草稿 | API 成功 |
| 7.5 | 查看已提交/草稿 Tab | 两个 Tab 可见 |
| 7.6 | 查看草稿列表 | 表格或空状态可见 |
| 7.7 | 周选择器筛选 | 筛选器可见 |

### 8. 资源负载 (workload.spec.ts + workload-advanced.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 8.1 | 导航到负载页 | 页面可见 |
| 8.2 | 项目筛选器存在 | 下拉框可见 |
| 8.3 | 表格列验证 | 姓名/活动总数/进行中/逾期/总工期 |
| 8.4 | 统计卡片显示 | 总人数卡片可见 |
| 8.5 | 按项目筛选 | 表格刷新 |
| 8.6 | 成员活动详情 | 行数据非空 |
| 8.7 | 问题列表显示 | 逾期/无人负责提示 |
| 8.8 | 负载条视觉显示 | 进度条可见 |

### 9. 系统管理 (admin.spec.ts + user-management.spec.ts + role-management.spec.ts + audit-log.spec.ts + template-management.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 9.1 | AI 管理 Tab 查看 | API 配置可见 |
| 9.2 | 用户列表 Tab 查看 | admin 用户可见 |
| 9.3 | 角色列表 Tab 查看 | 表格可见 |
| 9.4 | 审计日志 Tab 查看 | 表格可见 |
| 9.5 | 创建可登录用户 | 用户出现在列表 |
| 9.6 | 创建仅联系人用户 | 用户出现在列表 |
| 9.7 | 搜索用户 | 匹配结果显示 |
| 9.8 | 编辑用户姓名 | 更新后新名称显示 |
| 9.9 | 删除测试用户 | 用户从列表消失 |
| 9.10 | 创建角色并分配权限 | 角色出现在列表 |
| 9.11 | 编辑角色名称 | 更新后新名称显示 |
| 9.12 | 删除角色 | 角色从列表消失 |
| 9.13 | 审计日志含登录记录 | LOGIN 条目存在 |
| 9.14 | 审计日志分页 | 分页组件可见 |
| 9.15 | 审计日志筛选 | 筛选结果变化 |
| 9.16 | 查看模板列表 | 列表/空状态可见 |
| 9.17 | 创建模板 | 模板出现在列表 |
| 9.18 | 添加模板活动 | 活动行添加 |
| 9.19 | 模板活动表格列 | ID/名称/类型/阶段/工期列 |
| 9.20 | 复制模板 | 副本出现 |
| 9.21 | 删除模板 | 模板消失 |

### 10. 排期与风险 (scheduling-tools.spec.ts + risk.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 10.1 | 资源冲突范围切换 | 所有项目/仅当前项目按钮可见 |
| 10.2 | 所有项目范围检测 | 结果 Alert 可见 |
| 10.3 | 仅当前项目范围检测 | 结果 Alert 可见 |
| 10.4 | What-If 延期/提前切换 | 按钮可见 |
| 10.5 | 一键重排已移除 | 不可见 |
| 10.6 | 触发风险评估 | 评估结果显示 |

### 11. 通知 (notifications.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 11.1 | 通知铃铛可见 | 铃铛图标在 Header |
| 11.2 | 点击铃铛打开面板 | "通知" 标题可见 |
| 11.3 | API 生成通知 | 状态码 < 400 |
| 11.4 | 全部已读 | 标记成功 |
| 11.5 | 删除通知 | "已删除" 消息 |

### 12. 全站表头单行检测 (table-header-nowrap.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 12.1 | 项目列表表头无换行 | 所有 th 高度一致 |
| 12.2 | 活动列表表头无换行 | 所有 th 高度一致 |
| 12.3 | 产品列表表头无换行 | 所有 th 高度一致 |
| 12.4 | 周报汇总表头无换行 | 所有 th 高度一致 |
| 12.5 | 资源负荷表头无换行 | 所有 th 高度一致 |
| 12.6 | 系统管理表头无换行 | 所有 th 高度一致 |

### 13. 表单验证 (form-validation.spec.ts)

| # | 用例 | 预期结果 |
|---|------|----------|
| 13.1 | 空项目表单提交 | 验证错误提示 |
| 13.2 | 缺少项目名称提交 | 名称字段错误 |
| 13.3 | 空活动表单提交 | 验证错误提示 |
| 13.4 | 空产品表单提交 | 验证错误提示 |
| 13.5 | 取消按钮丢弃更改 | 数据不保存 |

---

## 运行方式

```bash
# 运行全部测试
npx playwright test

# 运行指定文件
npx playwright test e2e/specs/auth.spec.ts

# 运行指定 describe
npx playwright test --grep "Project Edit"

# 带 UI 运行
npx playwright test --ui

# 查看报告
npx playwright show-report
```

## 测试账号

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | 管理员 |
| zhangsan | 123456 | 普通用户 |
| lisi | 123456 | 普通用户 |

## 测试约定

1. **数据隔离**：每个 serial describe 创建独立测试数据，测试结束后清理
2. **uniqueName**：所有创建操作使用 `uniqueName()` 生成唯一名称（`前缀_时间戳`），便于识别和自动清理
3. **全局收尾**：`global-teardown.ts` 在所有测试完成后自动删除名称匹配 `*_\d{13}` 的测试数据（projects、templates、products、roles、users），即使单个 spec 的 cleanup 失败也能兜底
4. **API 验证**：关键操作等待 `waitForResponse` 验证 HTTP 状态码
5. **容错设计**：使用 `.catch(() => false)` 处理可选元素，避免硬性失败
6. **Arco Helper**：所有 Arco Design 组件交互封装在 `helpers/arco.ts`
