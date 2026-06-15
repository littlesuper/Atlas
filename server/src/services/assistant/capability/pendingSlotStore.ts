import crypto from 'crypto';

export const PENDING_TTL_MS = 5 * 60 * 1000; // 5 分钟

export interface PendingSlot {
  userId: string;
  capabilityName: string;
  partialArgs: Record<string, unknown>;
  missing: string[];
  createdAt?: number;
}

interface StoredSlot extends PendingSlot {
  createdAt: number;
}

class PendingSlotStore {
  private store = new Map<string, StoredSlot>();

  set(slot: PendingSlot): string {
    const id = crypto.randomUUID();
    this.store.set(id, { ...slot, createdAt: slot.createdAt ?? Date.now() });
    this.prune();
    return id;
  }

  /** 取回并校验归属 + TTL；不符返回 null */
  get(id: string, userId: string): StoredSlot | null {
    const s = this.store.get(id);
    if (!s) return null;
    if (Date.now() - s.createdAt > PENDING_TTL_MS) {
      this.store.delete(id);
      return null;
    }
    if (s.userId !== userId) return null;
    return s;
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.store) if (now - v.createdAt > PENDING_TTL_MS) this.store.delete(k);
  }

  /** 仅供测试 */
  __reset(): void {
    this.store.clear();
  }
}

export const pendingSlotStore = new PendingSlotStore();
