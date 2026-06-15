import { describe, it, expect, beforeEach } from 'vitest';
import { pendingSlotStore } from './pendingSlotStore';

beforeEach(() => pendingSlotStore.__reset());

describe('pendingSlotStore', () => {
  it('set 返回 id，get 按 userId 归属取回', () => {
    const id = pendingSlotStore.set({ userId: 'u1', capabilityName: 'activity.create', partialArgs: { projectId: 'p1' }, missing: ['活动名称'] });
    expect(typeof id).toBe('string');
    const slot = pendingSlotStore.get(id, 'u1');
    expect(slot?.partialArgs).toEqual({ projectId: 'p1' });
    expect(slot?.capabilityName).toBe('activity.create');
  });

  it('他人 userId 取不到（归属隔离）', () => {
    const id = pendingSlotStore.set({ userId: 'u1', capabilityName: 'x', partialArgs: {}, missing: [] });
    expect(pendingSlotStore.get(id, 'u2')).toBeNull();
  });

  it('delete 后取不到', () => {
    const id = pendingSlotStore.set({ userId: 'u1', capabilityName: 'x', partialArgs: {}, missing: [] });
    pendingSlotStore.delete(id);
    expect(pendingSlotStore.get(id, 'u1')).toBeNull();
  });

  it('过期取不到', () => {
    const id = pendingSlotStore.set({ userId: 'u1', capabilityName: 'x', partialArgs: {}, missing: [], createdAt: Date.now() - 6 * 60 * 1000 });
    expect(pendingSlotStore.get(id, 'u1')).toBeNull();
  });
});
