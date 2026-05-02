# Atlas Feature Flag 配置

Week 7 Day 1-2 选择 **Unleash Open Source / 自托管** 作为 Feature Flag 系统。原因：可自托管、无商业服务绑定、后端和前端都有官方 SDK，适合 Atlas 当前上线前的安全发布诉求。

## 当前落地范围

- 后端集成 `unleash-client`，在服务启动早期初始化。
- 前端集成 `@unleash/proxy-client-react`，在入口处包裹 `AtlasFeatureFlagProvider`。
- 创建一组受控 Flag，全部默认关闭。
- 已接入当前较适合灰度的功能入口和后端接口：AI 辅助、企微登录/配置、项目模板、风险总览、项目资源负载、节假日管理。
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
VITE_FEATURE_FLAG_OVERRIDES=""
```

`VITE_UNLEASH_FRONTEND_URL` 应指向 Unleash Frontend API 或 Unleash Edge，例如：

```bash
VITE_UNLEASH_FRONTEND_URL="https://unleash.example.com/api/frontend"
```

## 当前 Flag 清单

| Flag | 默认值 | 用途 |
| ---- | ------ | ---- |
| `atlas.week7.demo` | `false` | Week 7 Feature Flag 集成冒烟验证 |
| `atlas.ai.assistance` | `false` | AI 配置、AI 周报建议、AI 排期建议、风险评估中的 AI 增强部分 |
| `atlas.wecom.login` | `false` | 企业微信登录入口和企微配置接口 |
| `atlas.project.templates` | `false` | 项目模板管理、创建项目时从模板生成活动 |
| `atlas.risk.dashboard` | `false` | 跨项目风险总览和风险洞察接口 |
| `atlas.workload.dashboard` | `false` | 项目资源负载看板接口与菜单入口 |
| `atlas.holiday.management` | `false` | 节假日管理后台与接口 |

项目、活动、产品、周报基础流程，以及活动角色绑定不纳入本轮 Flag：它们已属于核心路径，默认关闭会直接影响上线前主流程验证。

## 测试环境覆盖

Playwright E2E 和服务端 Vitest 会通过 `FEATURE_FLAG_OVERRIDES` / `VITE_FEATURE_FLAG_OVERRIDES` 默认打开上述业务 Flag，避免“生产默认关闭”的策略破坏既有核心回归用例。生产环境不提交真实 token，也不在仓库中写入真实开关值。

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
