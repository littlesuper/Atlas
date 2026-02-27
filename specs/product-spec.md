# 产品管理模块规格说明书

## 1. 模块概述

产品管理模块用于记录硬件产品信息，包括产品基本信息、规格参数、性能指标、文档附件等。产品可关联到项目，由产品经理维护。规格参数和性能指标采用动态键值对形式，可灵活适配不同品类的硬件产品。

核心能力：
- 完整的 CRUD + 版本复制
- 枚举校验 + 状态机生命周期管理
- 型号+版本唯一约束
- 文档管理（PDF/Word/Excel/ZIP 等）
- 统计仪表盘 + 产品对比
- CSV 导出 + 增强搜索
- 变更日志审计

## 2. 数据模型

### Product（产品表 `products`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 产品唯一标识 |
| name | String | NOT NULL | 产品名称 |
| model | String | NULLABLE | 产品型号 |
| revision | String | NULLABLE | 版本号（如 "V2.1"） |
| category | String | NULLABLE | 产品类别（ROUTER/GATEWAY/REMOTE_CONTROL/ACCESSORY/OTHER） |
| description | String | NULLABLE | 产品描述 |
| status | ProductStatus | NOT NULL, DEFAULT: DEVELOPING | 产品状态 |
| specifications | JSON | NULLABLE | 规格参数（键值对） |
| performance | JSON | NULLABLE | 性能指标（键值对） |
| images | JSON | NULLABLE | 产品图片列表 [{id, name, url, uploadedAt}] |
| documents | JSON | NULLABLE | 产品文档列表 [{id, name, url, uploadedAt}] |
| projectId | UUID | FK → projects.id, NULLABLE | 关联项目 |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 创建时间 |
| updatedAt | DateTime | NOT NULL, AUTO | 更新时间 |

**约束：** `@@unique([model, revision])` — 型号+版本号组合唯一

### ProductChangeLog（变更日志表 `product_change_logs`）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 日志唯一标识 |
| productId | UUID | FK → products.id, NULLABLE, onDelete: SetNull | 关联产品 |
| userId | String | NOT NULL | 操作用户 ID |
| userName | String | NOT NULL | 操作用户名 |
| action | String | NOT NULL | 操作类型：CREATE / UPDATE / DELETE / COPY |
| changes | JSON | NULLABLE | 变更详情 { field: { from, to } } |
| createdAt | DateTime | NOT NULL, DEFAULT: now() | 操作时间 |

### ProductStatus 枚举

| 值 | 说明 |
|----|------|
| DEVELOPING | 开发中 |
| PRODUCTION | 量产中 |
| DISCONTINUED | 已停产 |

### 状态流转规则（单向不可逆）

```
DEVELOPING → PRODUCTION → DISCONTINUED
```

- 相同状态 → 允许
- 逆向流转 → 拒绝（400 错误）

### ProductCategory（产品类别，字符串常量）

| 值 | 显示名 | 颜色 |
|----|--------|------|
| ROUTER | 路由器 | blue |
| GATEWAY | 网关 | cyan |
| REMOTE_CONTROL | 远控设备 | purple |
| ACCESSORY | 配件 | default |
| OTHER | 其他 | default |

### specifications / performance JSON 结构示例
```json
{
  "工作电压": "3.3V",
  "工作温度": "-40°C ~ 85°C",
  "接口类型": "I2C / SPI"
}
```

### documents JSON 结构示例
```json
[
  {
    "id": "1708012345678",
    "name": "产品规格书.pdf",
    "url": "/uploads/20260217_100035_0821.pdf",
    "uploadedAt": "2026-02-17T10:00:00.000Z"
  }
]
```
- 支持格式：pdf/doc/docx/xls/xlsx/zip/txt
- 使用系统通用文件上传接口 `POST /api/uploads`

### images JSON 结构示例
```json
[
  {
    "id": "1708012345678",
    "name": "20260217_100035_0821.jpg",
    "url": "/uploads/20260217_100035_0821.jpg",
    "uploadedAt": "2026-02-17T10:00:00.000Z"
  }
]
```
- 最多 5 张图片，仅支持图片格式（png/jpeg/gif/webp/svg）

## 3. API 接口

### 3.1 获取产品列表

```
GET /api/products?page=1&pageSize=20&status=DEVELOPING&category=ROUTER&keyword=智能&projectId=uuid&projectStatus=IN_PROGRESS&specKeyword=电压
```

**认证：** Bearer Token
**权限：** 无（已认证即可）

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | Number | 页码，默认 1 |
| pageSize | Number | 每页数量，默认 20 |
| status | String | 按状态筛选 |
| category | String | 按类别筛选 |
| keyword | String | 按名称/型号/描述模糊搜索 |
| projectId | String | 按关联项目 ID 筛选 |
| projectStatus | String | 按关联项目状态筛选 |
| specKeyword | String | 在规格参数 JSON 中模糊搜索 |

**响应（200）：**
```json
{
  "data": [...],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "stats": {
    "all": 10,
    "developing": 5,
    "production": 3,
    "discontinued": 2
  }
}
```

`stats` 不受 status 筛选影响，仅受 category/keyword/projectId/projectStatus 影响。

### 3.2 获取单个产品

```
GET /api/products/:id
```

### 3.3 创建产品

```
POST /api/products
```

**权限：** `product:create`

- status/category 校验枚举值（400 错误）
- model+revision 唯一检查（409 错误）
- 新建产品状态默认 DEVELOPING
- 自动记录变更日志

### 3.4 更新产品

```
PUT /api/products/:id
```

**权限：** `product:update`

- status/category 校验枚举值（400 错误）
- 状态流转校验：DEVELOPING → PRODUCTION → DISCONTINUED（400 错误）
- model+revision 唯一检查（409 错误）
- 自动记录变更日志（含 diff）

### 3.5 删除产品

```
DELETE /api/products/:id
```

**权限：** `product:delete`

- 先删除数据库记录，再异步清理图片和文档上传文件（文件清理失败不影响业务逻辑）
- 自动记录变更日志（在删除前记录）

### 3.6 复制产品版本

```
POST /api/products/:id/copy
Body: { "revision": "V3.0" }
```

**权限：** `product:create`

- 复制源产品的 name/model/category/specs/performance/projectId
- 新 revision，status 强制为 DEVELOPING
- images/documents 不复制
- model+revision 唯一检查（409 错误）
- 自动记录变更日志

### 3.7 获取变更记录

```
GET /api/products/:id/changelog
```

返回最近 50 条变更记录，按时间降序。

### 3.8 CSV 导出

```
GET /api/products/export?status=...&category=...&keyword=...&projectStatus=...
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename=products_2026-02-19.csv
```

- UTF-8 BOM 头确保 Excel 兼容
- 列：名称/型号/版本/类别/状态/项目/描述/规格/性能/创建时间

## 4. 前端页面

### 4.1 统计仪表盘

表格上方 4 个统计卡片（全部/研发中/量产/停产），点击卡片切换状态筛选，选中高亮蓝色边框。

### 4.2 产品列表页 `/products`

- **复选框列：** 选中 2-3 个产品后工具栏出现"对比"按钮
- **表格列：** 产品名称、型号+版本号、类别（Tag）、状态标签、关联项目、规格数
- **搜索框：** 按名称/型号/描述模糊搜索
- **规格搜索：** 在规格参数中模糊搜索
- **状态筛选/类别筛选/项目状态筛选：** 下拉框
- **操作列：** 查看、编辑、复制版本、删除
- **导出按钮：** CSV 下载
- **分页：** 每页 20 条

### 4.3 产品创建/编辑抽屉

- 右侧滑出抽屉，宽度 700px
- **基本信息：** 产品名称（必填）、型号+版本号
- **类别：** Select（预置类别）
- **状态：** Select（仅展示当前状态允许的目标状态；新建时只有 DEVELOPING）
- **关联项目：** 下拉选择
- **产品线一致性提示：** category 和关联项目 productLine 不匹配时显示 Alert（不阻塞提交）
- **规格参数：** 动态键值对 + "加载模板"按钮（根据 category 填充模板 key，不覆盖已有项）
- **性能指标：** 动态键值对
- **产品文档：** Upload（pdf/doc/docx/xls/xlsx/zip/txt），文件名+删除按钮

### 4.4 产品详情抽屉

- 右侧滑出抽屉，宽度 700px
- **基本信息区：** 名称、型号、版本号、类别、状态、关联项目、描述
- **规格参数卡片**
- **性能指标卡片**
- **文档卡片：** 文件名+下载链接
- **变更记录折叠面板：** Arco Timeline 展示操作历史（创建/更新/删除/复制）

### 4.5 产品对比

选中 2-3 个产品后点击"对比"按钮，打开 900px Drawer：
- 行：基础字段 + 所有 spec/performance key 的并集
- 列：每个选中产品一列
- 差异值高亮背景色

### 4.6 复制版本

操作列"复制版本"按钮 → Modal 输入新版本号 → 调用 copy API → 刷新列表

### 4.7 项目详情产品 Tab

项目详情页 Tabs 中新增"产品列表" TabPane，显示该项目关联的产品列表。

### 4.8 规格模板

每个类别预置默认规格参数 key：
- ROUTER: 工作电压、工作温度、接口类型、WiFi标准、天线数、传输速率
- GATEWAY: 工作电压、工作温度、通信协议、最大连接数、接口类型、功耗
- REMOTE_CONTROL: 工作电压、通信距离、频率、按键数、电池类型、待机时间
- ACCESSORY: 材质、尺寸、重量、兼容型号
- OTHER: 无模板
