import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi, mockExecute } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../utils/circuitBreaker', () => ({
  aiCircuitBreaker: { execute: mockExecute },
}));

import { narrateProposal } from './scheduleAssistantNarrate';
import type { ScheduleDiff } from '../utils/scheduleEngine';
import type { RiskFinding } from '../utils/scheduleRisks';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const diff: ScheduleDiff = {
  items: [
    {
      activityId: 'A1',
      name: '硬件打样',
      before: { start: d('2026-03-02'), end: d('2026-03-06') },
      after: { start: d('2026-03-16'), end: d('2026-03-20') },
      changed: true,
    },
  ],
};
const risks: RiskFinding[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockImplementation((fn: () => Promise<unknown>) => fn());
});

describe('narrateProposal (edge 2)', () => {
  it('returns trimmed AI content', async () => {
    mockCallAi.mockResolvedValueOnce({ content: '  硬件打样推迟到 3 月 16 日。  ' });
    const text = await narrateProposal({ diff, risks });
    expect(text).toBe('硬件打样推迟到 3 月 16 日。');
  });

  it('passes through aiCircuitBreaker', async () => {
    mockCallAi.mockResolvedValueOnce({ content: 'ok' });
    await narrateProposal({ diff, risks });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('throws when AI returns null (caller degrades to structured diff)', async () => {
    mockCallAi.mockResolvedValueOnce(null);
    await expect(narrateProposal({ diff, risks })).rejects.toThrow();
  });

  it('throws when circuit breaker is open', async () => {
    mockExecute.mockRejectedValueOnce(new Error('熔断器已开启'));
    await expect(narrateProposal({ diff, risks })).rejects.toThrow();
  });
});
