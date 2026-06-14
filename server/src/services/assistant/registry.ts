/**
 * 助手框架 · 动作适配器注册表
 *
 * 每个可写领域注册一个适配器；orchestrator 与路由按 domain 查找。
 */
import type { AssistantActionAdapter } from './types';

const adapters = new Map<string, AssistantActionAdapter>();

export function registerAdapter(adapter: AssistantActionAdapter): void {
  adapters.set(adapter.domain, adapter);
}

export function getAdapter(domain: string): AssistantActionAdapter | undefined {
  return adapters.get(domain);
}

export function listDomains(): string[] {
  return Array.from(adapters.keys());
}

export function listAdapters(): AssistantActionAdapter[] {
  return Array.from(adapters.values());
}

/** 仅供测试：清空注册表 */
export function __resetAdapters(): void {
  adapters.clear();
}
