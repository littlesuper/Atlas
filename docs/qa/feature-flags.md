# Atlas Feature Flag 配置

Week 7 Day 1-2 选择 **Unleash Open Source / 自托管** 作为 Feature Flag 系统。原因：可自托管、无商业服务绑定、后端和前端都有官方 SDK，适合 Atlas 当前上线前的安全发布诉求。

## 当前落地范围

- 后端集成 `unleash-client`，在服务启动早期初始化。
- 前端集成 `@unleash/proxy-client-react`，在入口处包裹 `AtlasFeatureFlagProvider`。
- 创建第一个受控 Flag：`atlas.week7.demo`，默认关闭。
- 未配置 Unleash 时，所有 Flag 使用本地默认值，不发起远程请求。
- 提供 `GET /api/feature-flags` 查询当前公开 Flag 状态。
- 非生产环境可显式开启本地覆盖，用于验证动态切换。

## 安全边界

- 仓库不提交真实 Unleash token。
- `UNLEASH_BACKEND_TOKEN` 是后端 token，只能放服务端环境变量。
- `VITE_UNLEASH_FRONTEND_TOKEN` 是前端 Frontend API / Edge token，会暴露给浏览器，不能使用后端 token。
- 本地覆盖接口 `PATCH /api/feature-flags/:name` 只有在 `NODE_ENV !== production` 且 `FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE=true` 时可用。
- 生产环境必须通过 Unleash 控制台、Frontend API 或 Edge 动态切换，不使用本地覆盖接口。

## 后端环境变量

```bash
UNLEASH_URL=""
UNLEASH_BACKEND_TOKEN=""
UNLEASH_APP_NAME="atlas-server"
UNLEASH_ENVIRONMENT="development"
UNLEASH_INSTANCE_ID="atlas-server"
UNLEASH_SEND_METRICS="false"
FEATURE_FLAG_OVERRIDES=""
FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE="false"
```

`FEATURE_FLAG_OVERRIDES` 可用于无 Unleash 环境下的静态兜底：

```bash
FEATURE_FLAG_OVERRIDES='{"atlas.week7.demo":true}'
```

## 前端环境变量

```bash
VITE_UNLEASH_FRONTEND_URL=""
VITE_UNLEASH_FRONTEND_TOKEN=""
VITE_UNLEASH_APP_NAME="atlas-client"
VITE_UNLEASH_ENVIRONMENT="development"
VITE_UNLEASH_REFRESH_INTERVAL="15"
```

`VITE_UNLEASH_FRONTEND_URL` 应指向 Unleash Frontend API 或 Unleash Edge，例如：

```bash
VITE_UNLEASH_FRONTEND_URL="https://unleash.example.com/api/frontend"
```

## 第一个 Flag

| Flag | 默认值 | 用途 |
| ---- | ------ | ---- |
| `atlas.week7.demo` | `false` | Week 7 Feature Flag 集成冒烟验证 |

本次没有把现有业务模块强行包进 Flag。ROADMAP 中“给接下来 1 个月内的新功能加 Flag”需要产品侧确认功能清单；在清单明确前，先提供统一基础设施和第一个验证 Flag。

## 本地验证动态切换

```bash
FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE=true npm run dev:server

curl http://localhost:3000/api/feature-flags
curl -X PATCH http://localhost:3000/api/feature-flags/atlas.week7.demo \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
curl http://localhost:3000/api/feature-flags
```

## 代码使用方式

后端：

```ts
import { FEATURE_FLAGS, isFeatureEnabled } from '../utils/featureFlags';

if (isFeatureEnabled(FEATURE_FLAGS.WEEK7_DEMO, { userId: req.user?.id })) {
  // 新逻辑
}
```

前端：

```tsx
import { FEATURE_FLAGS } from '@/featureFlags/flags';
import { useFeatureFlag } from '@/featureFlags/FeatureFlagProvider';

const enabled = useFeatureFlag(FEATURE_FLAGS.WEEK7_DEMO);
```

## 参考

- Unleash Node SDK: https://docs.getunleash.io/sdks/node
- Unleash React SDK: https://docs.getunleash.io/sdks/react
- Unleash JavaScript Browser SDK: https://docs.getunleash.io/sdks/javascript-browser
