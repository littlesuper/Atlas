import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi, mockExecute, mockCompute } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
  mockCompute: {
    computePhaseDuration: vi.fn(),
    computeProjectTimeline: vi.fn(),
    computeRiskSummary: vi.fn(),
    computeOverdueCount: vi.fn(),
  },
}));
vi.mock('../../../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../../../utils/circuitBreaker', () => ({ aiCircuitBreaker: { execute: mockExecute } }));
vi.mock('./queryCompute', () => mockCompute);

import { parseQueryResponse, runQuery } from './queryService';

const j = (o: unknown) => JSON.stringify(o);

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockImplementation((fn: () => Promise<unknown>) => fn());
});

describe('parseQueryResponse (pure, whitelist)', () => {
  it('ok for phase_duration with valid phase', () => {
    expect(parseQueryResponse(j({ type: 'phase_duration', phase: 'EVT' }))).toEqual({ ok: true, query: { type: 'phase_duration', phase: 'EVT' } });
  });
  it('ok for project_timeline / risk_summary / overdue_count', () => {
    expect(parseQueryResponse(j({ type: 'project_timeline' })).ok).toBe(true);
    expect(parseQueryResponse(j({ type: 'risk_summary' })).ok).toBe(true);
    expect(parseQueryResponse(j({ type: 'overdue_count' })).ok).toBe(true);
  });
  it('fails for null type (unsupported question)', () => {
    expect(parseQueryResponse(j({ type: null })).ok).toBe(false);
  });
  it('fails for fabricated type', () => {
    expect(parseQueryResponse(j({ type: 'predict_delay_probability' })).ok).toBe(false);
  });
  it('fails for phase_duration missing phase', () => {
    expect(parseQueryResponse(j({ type: 'phase_duration' })).ok).toBe(false);
  });
  it('fails for non-json', () => {
    expect(parseQueryResponse('我不知道').ok).toBe(false);
  });
  it('strips fence', () => {
    expect(parseQueryResponse('```json\n' + j({ type: 'risk_summary' }) + '\n```').ok).toBe(true);
  });
});

describe('runQuery', () => {
  it('answered: parses phase_duration → computes → formats Chinese answer', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ type: 'phase_duration', phase: 'EVT' }) });
    mockCompute.computePhaseDuration.mockResolvedValueOnce({
      type: 'phase_duration', phase: 'EVT', found: true, count: 6, basis: 'actual', start: '2025-10-06', end: '2025-12-20', workdays: 53,
    });
    const r = await runQuery({ projectId: 'p1', projectName: 'GW-X500', utterance: 'EVT 花了多少工作日' });
    expect(r.status).toBe('answered');
    if (r.status === 'answered') {
      expect(r.answer).toContain('GW-X500');
      expect(r.answer).toContain('EVT');
      expect(r.answer).toContain('53 个工作日');
      expect(r.answer).toContain('实际');
    }
  });

  it('answered: phase not found → honest "未找到"', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ type: 'phase_duration', phase: 'PVT' }) });
    mockCompute.computePhaseDuration.mockResolvedValueOnce({ type: 'phase_duration', phase: 'PVT', found: false, count: 0, basis: null, start: null, end: null, workdays: null });
    const r = await runQuery({ projectId: 'p1', projectName: 'GW-X500', utterance: 'PVT 多久' });
    expect(r.status).toBe('answered');
    if (r.status === 'answered') expect(r.answer).toContain('未找到');
  });

  it('not_understood for unsupported question (LLM returns type:null)', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ type: null }) });
    expect((await runQuery({ projectId: 'p1', projectName: 'X', utterance: '预测延期概率' })).status).toBe('not_understood');
  });

  it('not_understood when LLM fabricates an unknown query type (whitelist backstop)', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ type: 'fabricated' }) });
    expect((await runQuery({ projectId: 'p1', projectName: 'X', utterance: 'x' })).status).toBe('not_understood');
  });

  it('ai_unavailable when breaker open', async () => {
    mockExecute.mockRejectedValueOnce(new Error('熔断器已开启'));
    expect((await runQuery({ projectId: 'p1', projectName: 'X', utterance: 'x' })).status).toBe('ai_unavailable');
  });

  it('ai_unavailable when callAi null', async () => {
    mockCallAi.mockResolvedValueOnce(null);
    expect((await runQuery({ projectId: 'p1', projectName: 'X', utterance: 'x' })).status).toBe('ai_unavailable');
  });

  it('risk_summary formats counts', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ type: 'risk_summary' }) });
    mockCompute.computeRiskSummary.mockResolvedValueOnce({ type: 'risk_summary', total: 5, bySeverity: { LOW: 1, MEDIUM: 1, HIGH: 2, CRITICAL: 1 }, open: 3 });
    const r = await runQuery({ projectId: 'p1', projectName: 'GW-X500', utterance: '有几个风险' });
    if (r.status === 'answered') {
      expect(r.answer).toContain('5 个风险项');
      expect(r.answer).toContain('3 个待处理');
    }
  });
});
