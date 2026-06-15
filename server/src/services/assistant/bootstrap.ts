/**
 * 助手框架 · 适配器注册引导
 *
 * 在此集中注册所有领域适配器。被 routes/assistant.ts 与 server/src/index.ts 导入一次即可。
 * registerAdapter 按 domain 覆盖，幂等。
 */
import { registerAdapter } from './registry';
import { riskAdapter } from './adapters/riskAdapter';

let registered = false;

export function registerAllAdapters(): void {
  if (registered) return;
  registerAdapter(riskAdapter);
  registered = true;
}

// 模块加载即注册（供路由直接 import 触发）
registerAllAdapters();
