# Atlas 错误追踪配置

Week 6 Day 5 增加 Sentry 错误追踪的基础集成：前端捕获 React ErrorBoundary 异常、记录登录/HTTP 面包屑、设置用户上下文；后端在全局错误处理中捕获未处理业务异常并附带 requestId 与用户上下文。

## 安全边界

- 仓库只提交空占位变量，不提交真实 DSN、Auth Token 或组织信息。
- 未配置 DSN 时，前后端 Sentry 初始化会自动跳过，不影响本地开发和测试。
- 前端 HTTP 面包屑会过滤 `token`、`accessToken`、`refreshToken` 查询参数，不记录 Authorization header。
- source map 只在构建环境同时提供 `SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT` 时上传；上传后会删除 `dist/**/*.map`。

## 前端环境变量

`client/.env.example` 提供占位模板：

```bash
VITE_SENTRY_DSN=""
VITE_SENTRY_ENVIRONMENT="development"
VITE_SENTRY_RELEASE=""
VITE_SENTRY_TRACES_SAMPLE_RATE="0.1"
```

## 后端环境变量

`server/.env.example` 提供占位模板：

```bash
SENTRY_DSN=""
SENTRY_ENVIRONMENT="development"
SENTRY_RELEASE=""
SENTRY_TRACES_SAMPLE_RATE="0.1"
```

## Source Map 上传变量

这些变量应只配置在 CI/CD 或构建环境，不写入仓库：

```bash
SENTRY_AUTH_TOKEN=""
SENTRY_ORG=""
SENTRY_PROJECT=""
SENTRY_RELEASE="atlas@<version>"
```

前端 `client/vite.config.ts` 会在上述前三个变量都存在时：

- 开启 `build.sourcemap`
- 启用 `@sentry/vite-plugin`
- 使用 `atlas@<package.version>` 或 `SENTRY_RELEASE` 作为 release
- 上传完成后删除构建产物中的 `.map` 文件

## 验证方式

本地安全验证：

```bash
npm test --workspace client -- src/utils/errorTracking.test.ts src/components/ErrorBoundary.test.tsx
npm test --workspace server -- src/utils/errorTracking.test.ts
npm run build --workspace client
npm run typecheck --workspace server
```

部署前验证：

1. 在预发布环境配置前后端 DSN。
2. 配置 `SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT` 后执行前端构建。
3. 在 Sentry 中确认 release 存在且能解析前端 stack trace。
4. 触发一条测试异常，确认事件包含 `environment`、`release`、`trace_id` 和用户上下文。

## 参考

- Sentry Browser SDK: https://docs.sentry.io/platforms/javascript/guides/react/
- Sentry Node SDK: https://docs.sentry.io/platforms/javascript/guides/node/
- Sentry Vite Plugin: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/
