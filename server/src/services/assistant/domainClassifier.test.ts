import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi, mockExecute } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock('../../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../../utils/circuitBreaker', () => ({ aiCircuitBreaker: { execute: mockExecute } }));

import { parseDomainResponse, classifyDomain, type DomainOption } from './domainClassifier';

const domains: DomainOption[] = [
  { key: 'schedule', description: '排期' },
  { key: 'project', description: '项目字段' },
];
const j = (o: unknown) => JSON.stringify(o);

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockImplementation((fn: () => Promise<unknown>) => fn());
});

describe('parseDomainResponse (pure, whitelist)', () => {
  it('ok for a registered domain', () => {
    expect(parseDomainResponse(j({ domain: 'project' }), ['schedule', 'project'])).toEqual({ ok: true, domain: 'project' });
  });
  it('fails for null', () => {
    expect(parseDomainResponse(j({ domain: null }), ['schedule']).ok).toBe(false);
  });
  it('fails for fabricated key', () => {
    expect(parseDomainResponse(j({ domain: 'billing' }), ['schedule', 'project']).ok).toBe(false);
  });
  it('fails for non-json', () => {
    expect(parseDomainResponse('不确定', ['schedule']).ok).toBe(false);
  });
  it('strips fence', () => {
    expect(parseDomainResponse('```json\n' + j({ domain: 'schedule' }) + '\n```', ['schedule']).ok).toBe(true);
  });
});

describe('classifyDomain', () => {
  it('short-circuits (no LLM) when only one domain', async () => {
    const r = await classifyDomain({ utterance: 'x', domains: [domains[0]] });
    expect(r).toEqual({ status: 'ok', domain: 'schedule' });
    expect(mockCallAi).not.toHaveBeenCalled();
  });
  it('ok: LLM picks a registered domain', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ domain: 'project' }) });
    expect(await classifyDomain({ utterance: '把项目优先级改成高', domains })).toEqual({ status: 'ok', domain: 'project' });
  });
  it('unresolved when LLM returns null', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ domain: null }) });
    expect((await classifyDomain({ utterance: '随便', domains })).status).toBe('unresolved');
  });
  it('unresolved when LLM fabricates a key', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ domain: 'ghost' }) });
    expect((await classifyDomain({ utterance: 'x', domains })).status).toBe('unresolved');
  });
  it('ai_unavailable when breaker open', async () => {
    mockExecute.mockRejectedValueOnce(new Error('熔断器已开启'));
    expect((await classifyDomain({ utterance: 'x', domains })).status).toBe('ai_unavailable');
  });
  it('ai_unavailable when callAi null', async () => {
    mockCallAi.mockResolvedValueOnce(null);
    expect((await classifyDomain({ utterance: 'x', domains })).status).toBe('ai_unavailable');
  });
  it('unresolved when no domains', async () => {
    expect((await classifyDomain({ utterance: 'x', domains: [] })).status).toBe('unresolved');
  });
});
