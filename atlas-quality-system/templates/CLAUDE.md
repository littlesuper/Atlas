# Atlas 项目规范(CLAUDE.md)

> **重要:每次让Claude生成或修改代码时,必须把本文件完整内容贴入对话开头。**
> 这是给Claude看的"项目宪法",违反规范的代码不被允许。

---

## 一、项目概述

**项目名称**: Atlas

**项目类型**: Web应用(前后端分离)

**技术栈**(确认后填写,以下为示例,请根据实际项目修改):

```
前端:
  - 语言: TypeScript 5.x (strict mode)
  - 框架: React 18.x
  - 构建: Vite 5.x
  - 样式: TailwindCSS 3.x
  - 状态: Zustand / TanStack Query
  - 路由: React Router 6.x
  - 表单: React Hook Form + Zod
  - HTTP: Axios + 拦截器
  - 测试: Vitest + Playwright

后端:
  - 语言: TypeScript / Python(选其一,确认后保留)
  - 框架: NestJS / FastAPI
  - ORM: Prisma / SQLAlchemy
  - 验证: Zod / Pydantic
  - 测试: Vitest+Supertest / pytest+httpx
  - 日志: Pino / structlog

数据库:
  - 主库: PostgreSQL 15+
  - 缓存: Redis 7+
  - 迁移: Prisma Migrate / Alembic

部署:
  - 容器: Docker
  - 编排: Docker Compose (开发) / K8s (生产)
  - CI/CD: GitHub Actions
  - 前端部署: Vercel
  - 后端部署: Fly.io / Railway
```

**目标用户**: [填写]

**核心业务**: [填写]

---

## 二、🔴 强制规范(绝对不可违反)

### 2.1 安全红线

❌ **禁止**:
- 拼接SQL字符串(必须用ORM参数化查询)
- 硬编码密钥、密码、Token、API Key
- 在代码中明文存储敏感信息
- 使用 `eval()`、`exec()`、`Function()` 动态执行
- 关闭CSRF/XSS防护
- 在URL查询参数中传递敏感信息
- 在客户端存储未加密的敏感信息
- `dangerouslySetInnerHTML` 直接渲染用户输入

✅ **必须**:
- 所有外部输入必须验证(Zod/Pydantic schema)
- 所有数据库操作通过ORM
- 密钥/配置通过环境变量,本地用 `.env`(已在.gitignore)
- 用户密码使用 bcrypt/argon2 哈希(成本因子≥12)
- API必须身份验证(除明确公开的端点)
- 必须实现CSRF保护
- 必须设置安全HTTP头(Helmet middleware)

### 2.2 数据库红线

❌ **禁止**:
- 直接登录生产数据库改数据
- `DELETE` / `UPDATE` 不带 `WHERE` 子句
- 在代码中执行 `DROP TABLE` / `TRUNCATE`
- 不通过Migration修改schema
- 删除未备份的数据
- 跨表JOIN超过5个表

✅ **必须**:
- 所有schema变更通过Migration
- Migration必须有 `down` 脚本(可回滚)
- 关键表的删除使用软删除(`deleted_at`字段)
- 重要操作记录审计日志
- 应用使用最小权限账号(无DDL权限)
- 大批量操作分批进行(每批<1000)

### 2.3 代码质量红线

❌ **禁止**:
- 单个函数超过50行
- 嵌套if-else超过3层
- 圈复杂度超过10
- 文件超过500行
- 全局变量(除明确的常量配置)
- 裸 `try-except` 不记录日志
- `console.log` / `print` 在生产代码中(用logger)
- `any` / `unknown` 类型(TypeScript)
- 同步I/O在请求处理路径中

✅ **必须**:
- 每个函数有明确的单一职责
- 每个公共函数有JSDoc/Docstring
- 所有异步代码用 `async/await`(不混用Promise.then)
- 所有错误必须捕获并记录
- 所有日志使用结构化日志(JSON)
- 类型注解完整(TypeScript strict / Python type hints)

### 2.4 测试红线

❌ **禁止**:
- 提交未测试的代码
- 测试中使用真实生产数据
- 测试中包含 `sleep()` / `setTimeout()` 硬等待
- 测试相互依赖(必须独立)
- 标记测试为 `skip` / `xfail` 而不修复

✅ **必须**:
- 新增功能必须配套测试
- 修复Bug必须先写复现Bug的测试
- 单元测试覆盖率 ≥ 70%
- 关键业务逻辑覆盖率 ≥ 85%
- E2E测试覆盖所有关键用户路径
- 测试数据通过工厂模式生成

---

## 三、🟡 编码规范

### 3.1 命名规范

| 类型 | 规则 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `user-profile.tsx` |
| 组件名 | PascalCase | `UserProfile` |
| 函数名 | camelCase | `getUserById` |
| 常量 | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| 类型/接口 | PascalCase | `User`, `UserProps` |
| 私有变量 | _camelCase | `_internalState` |
| Boolean变量 | is/has/can开头 | `isLoading`, `hasError` |
| 事件处理 | handleXxx | `handleSubmit` |
| 异步函数 | 体现异步意图 | `fetchUser`, `loadData` |

### 3.2 文件组织

```
src/
├── components/         # 通用UI组件(无业务逻辑)
│   ├── Button/
│   │   ├── index.tsx
│   │   ├── Button.test.tsx
│   │   └── Button.stories.tsx
├── features/           # 业务功能模块
│   ├── auth/
│   │   ├── components/   # 此功能专属组件
│   │   ├── hooks/        # 此功能专属hooks
│   │   ├── api/          # 此功能API调用
│   │   ├── types/        # 此功能类型
│   │   └── index.ts      # 对外导出
├── lib/                # 工具函数库
├── api/                # API client封装
├── types/              # 全局类型
├── constants/          # 全局常量
└── pages/              # 路由页面(只做组装)
```

**关键约束**:
- `components/` 不能依赖 `features/`
- `features/X/` 不能依赖 `features/Y/`(跨feature通过外部服务)
- `pages/` 只做组装,不写业务逻辑

### 3.3 Git Commit规范

格式: `<type>(<scope>): <subject>`

Type:
- `feat`: 新功能
- `fix`: Bug修复
- `docs`: 文档
- `style`: 格式(不影响功能)
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具
- `perf`: 性能优化

示例:
```
feat(auth): 添加用户登录锁定机制
fix(payment): 修复退款金额计算错误
test(user): 补充用户注册边界测试
```

### 3.4 错误处理

```typescript
// ✅ 正确:具体错误类 + 上下文 + 日志
class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

async function getUser(id: string): Promise<User> {
  try {
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new UserNotFoundError(id);
    return user;
  } catch (error) {
    logger.error('Failed to get user', { userId: id, error });
    throw error;
  }
}

// ❌ 错误:吞掉错误
async function getUser(id: string) {
  try {
    return await db.user.findUnique({ where: { id } });
  } catch (e) {
    return null;  // 错误消失了!
  }
}
```

### 3.5 日志规范

```typescript
// ✅ 结构化日志,带context
logger.info('User logged in', {
  userId: user.id,
  loginMethod: 'email',
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

// ✅ 错误必须包含完整上下文
logger.error('Payment failed', {
  orderId: order.id,
  userId: user.id,
  amount: order.amount,
  error: error.message,
  stack: error.stack,
});

// ❌ 信息不全
logger.info('login');
logger.error('error: ' + e);
```

日志级别:
- `error`: 程序错误(需要修复)
- `warn`: 可疑但不致命(关注)
- `info`: 关键业务事件
- `debug`: 调试信息(生产关闭)

### 3.6 API设计

REST端点:
```
GET    /api/v1/users          # 列表
GET    /api/v1/users/:id      # 详情
POST   /api/v1/users          # 创建
PUT    /api/v1/users/:id      # 全量更新
PATCH  /api/v1/users/:id      # 部分更新
DELETE /api/v1/users/:id      # 删除
```

响应格式:
```json
{
  "data": { ... },              // 成功数据
  "error": {                    // 错误信息
    "code": "USER_NOT_FOUND",
    "message": "User not found",
    "details": { ... }
  },
  "meta": {                     // 元数据
    "page": 1,
    "total": 100
  }
}
```

HTTP状态码:
- 200: 成功
- 201: 创建成功
- 204: 成功无内容
- 400: 客户端错误(参数错误)
- 401: 未认证
- 403: 无权限
- 404: 资源不存在
- 409: 冲突(重复)
- 422: 实体错误(业务规则)
- 429: 速率限制
- 500: 服务器错误

---

## 四、🟢 推荐实践

### 4.1 React组件

```typescript
// ✅ 函数组件 + TypeScript + 明确props
interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
  className?: string;
}

export function UserCard({ user, onEdit, className }: UserCardProps) {
  return (
    <div className={cn('p-4 rounded', className)}>
      {/* ... */}
    </div>
  );
}

// ✅ 复杂逻辑提取到自定义hook
function useUserData(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    staleTime: 5 * 60 * 1000,
  });
}
```

### 4.2 异步操作

```typescript
// ✅ 使用 React Query / TanStack Query
const { data, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});

// ✅ Mutation有完整错误处理
const mutation = useMutation({
  mutationFn: updateUser,
  onSuccess: () => {
    toast.success('更新成功');
    queryClient.invalidateQueries(['users']);
  },
  onError: (error) => {
    toast.error('更新失败:' + error.message);
    logger.error('User update failed', { error });
  },
});
```

### 4.3 表单处理

```typescript
// ✅ React Hook Form + Zod
const userSchema = z.object({
  email: z.string().email('邮箱格式错误'),
  password: z.string().min(8, '密码至少8位').max(50),
});

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(userSchema),
  });
  
  const onSubmit = async (data) => {
    // ...
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* ... */}
    </form>
  );
}
```

### 4.4 性能优化

```typescript
// ✅ React.memo 防止不必要重渲染
const UserList = React.memo(({ users }: Props) => {
  // ...
});

// ✅ useMemo 缓存复杂计算
const sortedUsers = useMemo(
  () => users.sort(byName),
  [users]
);

// ✅ useCallback 稳定函数引用
const handleClick = useCallback((id: string) => {
  // ...
}, [/* deps */]);

// ✅ 长列表虚拟化
import { useVirtualizer } from '@tanstack/react-virtual';
```

---

## 五、🛡️ 项目特殊约束

### 5.1 业务规则

[根据Atlas具体业务填写,例如:]

- 用户密码必须8-20位,含字母+数字
- 订单金额必须>0
- 用户每分钟最多发起5个请求(限流)
- 文件上传最大10MB
- 一个用户同时只能有3个活跃Session

### 5.2 性能要求

- 页面首屏加载 < 3秒
- API P95响应 < 200ms
- API P99响应 < 500ms
- 数据库查询 P95 < 50ms

### 5.3 浏览器支持

- Chrome 最新2版
- Firefox 最新2版
- Safari 最新2版
- Edge 最新2版
- iOS Safari 14+
- Android Chrome 最新

### 5.4 可访问性

- WCAG 2.1 AA 合规
- 所有交互可键盘操作
- 颜色对比度 ≥ 4.5:1
- 所有图片有alt
- 所有表单有label

---

## 六、📋 代码生成请求模板

当用户请求生成代码时,Claude应该:

1. **先确认理解**:复述需求,询问不清楚的地方
2. **声明假设**:列出代码做的关键假设
3. **生成代码**:遵守本规范
4. **生成测试**:配套测试代码
5. **风险提示**:指出潜在风险点
6. **下一步建议**:接下来该做什么

---

## 七、❌ 常见错误模式

Claude在生成代码时,**特别注意避免以下常见错误**:

### 7.1 假数据/虚构API

❌ 调用不存在的方法:
```typescript
// 错误:axios没有这个方法
axios.fetchData('/api/users')
```

✅ 用真实API:
```typescript
axios.get('/api/users')
```

### 7.2 忽略错误处理

❌ 假设一切顺利:
```typescript
const user = await fetchUser(id);
return user.name;  // 如果user是null呢?
```

✅ 处理边界:
```typescript
const user = await fetchUser(id);
if (!user) throw new UserNotFoundError(id);
return user.name;
```

### 7.3 时区/编码问题

❌ 直接用本地时间:
```typescript
const now = new Date();  // 时区取决于服务器
```

✅ 显式UTC或时区:
```typescript
const now = new Date();
const utcNow = now.toISOString();
```

### 7.4 N+1查询

❌ 循环中查询:
```typescript
for (const order of orders) {
  order.user = await db.user.findById(order.userId);
}
```

✅ 批量查询:
```typescript
const userIds = orders.map(o => o.userId);
const users = await db.user.findMany({ where: { id: { in: userIds }}});
const userMap = new Map(users.map(u => [u.id, u]));
orders.forEach(o => o.user = userMap.get(o.userId));
```

### 7.5 未验证用户输入

❌ 直接信任输入:
```typescript
app.post('/users', (req, res) => {
  const user = await db.user.create({ data: req.body });  // 危险!
});
```

✅ 用Schema验证:
```typescript
const userSchema = z.object({ email: z.string().email(), name: z.string() });
app.post('/users', (req, res) => {
  const data = userSchema.parse(req.body);
  const user = await db.user.create({ data });
});
```

---

## 八、📞 元规则

如果Claude在执行任务过程中:

1. **发现需求矛盾或不清楚** → 必须先停下来询问
2. **要做超出本规范的设计决策** → 必须告知用户并等待批准
3. **要新增依赖** → 必须说明理由和替代方案
4. **要修改架构** → 必须说明影响范围
5. **不确定某个最佳实践** → 必须说"我不确定",不要瞎编

**原则:**
> Claude优先级:正确性 > 安全性 > 可维护性 > 性能 > 简洁性

---

## 九、版本与维护

- 本文件版本: v1.0
- 最后更新: [日期]
- 维护者: AI代码守护者
- 更新频率:每月review,有新发现立即更新

**更新本文件的原则**:
- 发现一个新的常见错误 → 加到第七部分
- 团队约定一个新规则 → 加到第二/三部分
- 工具/技术栈变化 → 更新第一部分
- 不要删除规则,除非确认不再需要

---

**结束**:本文件就是Claude在Atlas项目的"宪法"。所有代码必须符合本规范。
