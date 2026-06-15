import type { Capability } from './types';

const capabilities = new Map<string, Capability>();

export function registerCapability(cap: Capability): void {
  // target 类能力必须 loadEntity + fingerprint 齐备：否则 apply 无法做并发指纹复核（静默丢失保护）。
  if (cap.target && (!cap.loadEntity || !cap.fingerprint)) {
    throw new Error(
      `能力 ${cap.name} 声明了 target='${cap.target}'，但缺少 loadEntity/fingerprint：target 类能力必须二者齐备，否则 apply 无法做并发指纹复核。`
    );
  }
  capabilities.set(cap.name, cap);
}

export function getCapability(name: string): Capability | undefined {
  return capabilities.get(name);
}

export function listCapabilities(): Capability[] {
  return [...capabilities.values()];
}

/** 该用户有权限的能力（权限即能力边界） */
export function listCapabilitiesForUser(permissions: string[]): Capability[] {
  return listCapabilities().filter((c) => hasPermission(permissions, c.permission.resource, c.permission.action));
}

function hasPermission(perms: string[], resource: string, action: string): boolean {
  return perms.some((p) => {
    const [r, a] = p.split(':');
    if (r === '*' && a === '*') return true;
    if (r === '*' && a === action) return true;
    if (r === resource && a === '*') return true;
    return r === resource && a === action;
  });
}

/** 仅供测试 */
export function __resetCapabilities(): void {
  capabilities.clear();
}
