export const VALID_PROJECT_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD'];
export const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function isValidProjectStatus(s: string): boolean {
  return VALID_PROJECT_STATUSES.includes(s);
}

export function isValidPriority(p: string): boolean {
  return VALID_PRIORITIES.includes(p);
}

export function isValidDateRange(start: string, end: string): boolean {
  return new Date(end) >= new Date(start);
}

export function isValidProgress(n: number): boolean {
  return typeof n === 'number' && !isNaN(n) && n >= 0 && n <= 100;
}

// ============ 产品枚举校验 ============

export const VALID_PRODUCT_STATUSES = ['DEVELOPING', 'PRODUCTION', 'DISCONTINUED'];
export const VALID_PRODUCT_CATEGORIES = ['ROUTER', 'GATEWAY', 'REMOTE_CONTROL', 'ACCESSORY', 'OTHER'];

export function isValidProductStatus(s: string): boolean {
  return VALID_PRODUCT_STATUSES.includes(s);
}

export function isValidProductCategory(c: string): boolean {
  return VALID_PRODUCT_CATEGORIES.includes(c);
}

// ============ 产品状态机校验 ============

const PRODUCT_STATUS_TRANSITIONS: Record<string, string[]> = {
  DEVELOPING: ['DEVELOPING', 'PRODUCTION'],
  PRODUCTION: ['PRODUCTION', 'DISCONTINUED'],
  DISCONTINUED: ['DISCONTINUED'],
};

export function isValidProductStatusTransition(from: string, to: string): boolean {
  const allowed = PRODUCT_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}
