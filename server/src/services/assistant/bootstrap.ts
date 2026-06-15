/**
 * 助手框架 · 适配器注册引导
 *
 * 在此集中注册所有领域适配器。被 routes/assistant.ts 与 server/src/index.ts 导入一次即可。
 * registerAdapter 按 domain 覆盖，幂等。
 */
// All adapters have been migrated to the capability layer.
// This file is kept as an empty shell until Task 5 deletes it entirely.

let registered = false;

export function registerAllAdapters(): void {
  if (registered) return;
  // No adapters remain; all domains now registered via capability/bootstrap.ts
  registered = true;
}

// 模块加载即注册（供路由直接 import 触发）
registerAllAdapters();
