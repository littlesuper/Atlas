import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────
const { mockCallAi, mockExecute } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  // default: pass-through (circuit CLOSED)
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../utils/circuitBreaker', () => ({
  aiCircuitBreaker: { execute: mockExecute },
}));

import { parseUtterance, type ParseUtteranceInput } from './scheduleAssistantIntent';
import type { IntentPromptActivity } from '../utils/scheduleAssistantPrompts';

const activities: IntentPromptActivity[] = [
  { id: 'A1', name: '硬件打样', isMilestone: false, planStartDate: '2026-03-02', planEndDate: '2026-03-06', dependsOn: [] },
  { id: 'A2', name: '固件联调', isMilestone: false, planStartDate: '2026-03-09', planEndDate: '2026-03-13', dependsOn: ['A1'] },
  { id: 'M1', name: '验收里程碑', isMilestone: true, planStartDate: null, planEndDate: '2026-03-23', dependsOn: ['A2'] },
];

const input = (utterance: string): ParseUtteranceInput => ({
  projectId: 'project-1',
  utterance,
  activities,
});

const aiReturns = (obj: unknown) =>
  mockCallAi.mockResolvedValueOnce({ content: JSON.stringify(obj) });

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockImplementation((fn: () => Promise<unknown>) => fn());
});

describe('parseUtterance (edge 1)', () => {
  it('returns ok with intent for a clean shift', async () => {
    aiReturns({
      operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }],
      confidence: 'high',
      unresolved: [],
    });
    const r = await parseUtterance(input('把硬件打样推迟两周'));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.intent.operations[0]).toMatchObject({ type: 'shift_activity', activityId: 'A1' });
    }
  });

  it('passes the call through aiCircuitBreaker', async () => {
    aiReturns({ operations: [], confidence: 'low', unresolved: [] });
    await parseUtterance(input('优化一下节奏'));
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('uses temperature 0 for deterministic parsing', async () => {
    aiReturns({ operations: [], confidence: 'low', unresolved: [] });
    await parseUtterance(input('x'));
    expect(mockCallAi).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0, feature: 'schedule_assistant' })
    );
  });

  it('ai_unavailable when circuit breaker is OPEN (execute throws)', async () => {
    mockExecute.mockRejectedValueOnce(new Error('熔断器 [AI-API] 已开启'));
    const r = await parseUtterance(input('把硬件打样推迟两周'));
    expect(r.status).toBe('ai_unavailable');
    // must NOT have fabricated an intent
  });

  it('ai_unavailable when callAi returns null (not configured)', async () => {
    mockCallAi.mockResolvedValueOnce(null);
    const r = await parseUtterance(input('把硬件打样推迟两周'));
    expect(r.status).toBe('ai_unavailable');
  });

  it('ai_unavailable when callAi throws (API error)', async () => {
    mockCallAi.mockRejectedValueOnce(new Error('AI API 调用失败: 500'));
    const r = await parseUtterance(input('x'));
    expect(r.status).toBe('ai_unavailable');
  });

  it('not_understood when LLM fabricates an activityId (03 §2)', async () => {
    aiReturns({
      operations: [{ type: 'shift_activity', activityId: 'GHOST', deltaDays: 7 }],
      confidence: 'high',
      unresolved: [],
    });
    const r = await parseUtterance(input('把幽灵活动推迟一周'));
    expect(r.status).toBe('not_understood');
    if (r.status === 'not_understood') expect(r.reason).toBe('fabricated_id');
  });

  it('not_understood when LLM returns non-JSON', async () => {
    mockCallAi.mockResolvedValueOnce({ content: '我不太确定' });
    const r = await parseUtterance(input('帮我把项目按时交付'));
    expect(r.status).toBe('not_understood');
  });

  it('ok with empty operations (downstream noOp) for vague input', async () => {
    aiReturns({ operations: [], confidence: 'low', unresolved: ['整个项目的节奏'] });
    const r = await parseUtterance(input('优化一下整个项目的节奏'));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.intent.operations.length).toBe(0);
  });
});
