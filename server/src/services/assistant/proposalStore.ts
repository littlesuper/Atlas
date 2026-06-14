/**
 * 助手框架 · 通用提议缓存（领域无关）
 *
 * 从排期助手的 ProposalCache 泛化：TTL + 指纹 + 幂等标记。
 * 缓存"已校验意图 + 目标 + 创建时刻指纹"，apply 时比对指纹防并发（见 00 §2.2）。
 */
import type { AssistantDiffRow, AssistantRisk } from './types';

export const PROPOSAL_TTL_MS = 10 * 60 * 1000; // 10 分钟

export interface StoredProposal<TIntent = unknown> {
  domain: string;
  targetId: string;
  rawUtterance: string;
  intent: TIntent;
  fingerprint: string;
  createdAt: number;
  applied?: { at: number; rows: AssistantDiffRow[]; risks: AssistantRisk[] };
}

export class ProposalStore {
  private store = new Map<string, StoredProposal>();

  set<T>(id: string, proposal: StoredProposal<T>): void {
    this.store.set(id, proposal as StoredProposal);
    this.prune();
  }

  get<T = unknown>(id: string): StoredProposal<T> | null {
    const p = this.store.get(id);
    if (!p) return null;
    if (Date.now() - p.createdAt > PROPOSAL_TTL_MS) {
      this.store.delete(id);
      return null;
    }
    return p as StoredProposal<T>;
  }

  markApplied(id: string, applied: NonNullable<StoredProposal['applied']>): void {
    const p = this.store.get(id);
    if (p) p.applied = applied;
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now - v.createdAt > PROPOSAL_TTL_MS) this.store.delete(k);
    }
  }

  /** 仅供测试 */
  __reset(): void {
    this.store.clear();
  }
}

/** 全框架共享的单例缓存 */
export const proposalStore = new ProposalStore();
