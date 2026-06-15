import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProposalStore, PROPOSAL_TTL_MS, type StoredProposal, proposalStore } from './proposalStore';

const mk = (over: Partial<StoredProposal> = {}): StoredProposal => ({
  domain: 'schedule',
  targetId: 'p1',
  rawUtterance: 'x',
  intent: { foo: 1 },
  fingerprint: 'fp-1',
  createdAt: Date.now(),
  ...over,
});

let store: ProposalStore;
beforeEach(() => {
  store = new ProposalStore();
});

describe('ProposalStore', () => {
  it('stores and retrieves a proposal', () => {
    store.set('a', mk());
    expect(store.get('a')?.targetId).toBe('p1');
  });

  it('returns null for unknown id', () => {
    expect(store.get('nope')).toBeNull();
  });

  it('expires after TTL', () => {
    vi.useFakeTimers();
    try {
      store.set('a', mk());
      expect(store.get('a')).not.toBeNull();
      vi.advanceTimersByTime(PROPOSAL_TTL_MS + 1000);
      expect(store.get('a')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('markApplied records the applied result for idempotency', () => {
    store.set('a', mk());
    store.markApplied('a', { at: Date.now(), rows: [], risks: [] });
    expect(store.get('a')?.applied).toBeDefined();
  });

  it('keeps domain + fingerprint for stale detection', () => {
    store.set('a', mk({ domain: 'project', fingerprint: 'fp-X' }));
    const p = store.get('a');
    expect(p?.domain).toBe('project');
    expect(p?.fingerprint).toBe('fp-X');
  });

  it('__reset clears everything', () => {
    store.set('a', mk());
    store.__reset();
    expect(store.get('a')).toBeNull();
  });
});

describe('proposalStore capability proposals', () => {
  beforeEach(() => proposalStore.__reset());

  it('stores and retrieves a capability proposal', () => {
    proposalStore.set('p1', {
      domain: 'capability',
      targetId: '__new__',
      capabilityName: 'project.create',
      args: { name: '项目甲' },
      rawUtterance: '建个项目甲',
      intent: null,
      fingerprint: 'fp1',
      createdAt: Date.now(),
    });
    const got = proposalStore.get('p1');
    expect(got?.capabilityName).toBe('project.create');
    expect(got?.args).toMatchObject({ name: '项目甲' });
  });
});
