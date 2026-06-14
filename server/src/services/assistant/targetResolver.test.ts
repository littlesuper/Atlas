import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi, mockExecute } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock('../../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../../utils/circuitBreaker', () => ({ aiCircuitBreaker: { execute: mockExecute } }));

import {
  parseTargetResponse,
  resolveProjectTarget,
  matchProjectByName,
  buildTargetUserPrompt,
  type ProjectRef,
} from './targetResolver';

const projects: ProjectRef[] = [
  { id: 'p1', name: '项目甲' },
  { id: 'p2', name: '项目乙' },
];
const j = (o: unknown) => JSON.stringify(o);

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockImplementation((fn: () => Promise<unknown>) => fn());
});

describe('parseTargetResponse (pure, whitelist backstop)', () => {
  it('ok for a real project id', () => {
    expect(parseTargetResponse(j({ projectId: 'p1' }), ['p1', 'p2'])).toEqual({ ok: true, projectId: 'p1' });
  });
  it('strips fenced json', () => {
    expect(parseTargetResponse('```json\n' + j({ projectId: 'p2' }) + '\n```', ['p1', 'p2'])).toEqual({ ok: true, projectId: 'p2' });
  });
  it('fails for null projectId', () => {
    expect(parseTargetResponse(j({ projectId: null }), ['p1']).ok).toBe(false);
  });
  it('fails for fabricated id not in whitelist', () => {
    expect(parseTargetResponse(j({ projectId: 'GHOST' }), ['p1']).ok).toBe(false);
  });
  it('fails for non-json', () => {
    expect(parseTargetResponse('不确定', ['p1']).ok).toBe(false);
  });
});

describe('buildTargetUserPrompt', () => {
  it('lists projects and marks the context project', () => {
    const p = buildTargetUserPrompt('把项目甲的打样推迟', projects, 'p2');
    expect(p).toContain('id=p1');
    expect(p).toContain('项目甲');
    expect(p).toContain('当前项目');
  });
});

describe('matchProjectByName (deterministic fast-path)', () => {
  const ps: ProjectRef[] = [
    { id: 'p1', name: 'GW-X500' },
    { id: 'p2', name: '无线网关 GW-X500' },
    { id: 'p3', name: '项目乙' },
  ];
  it('matches a uniquely-named project mentioned in the utterance', () => {
    expect(matchProjectByName('项目乙的进度如何', ps)).toBe('p3');
  });
  it('prefers the longest (most specific) name when several match', () => {
    // both "GW-X500" and "无线网关 GW-X500" appear → longest wins
    expect(matchProjectByName('无线网关 GW-X500 的 EVT 阶段花了多少工作日', ps)).toBe('p2');
  });
  it('returns null when no project name appears (→ LLM fallback)', () => {
    expect(matchProjectByName('哪个项目最危险', ps)).toBeNull();
  });
  it('is case-insensitive', () => {
    expect(matchProjectByName('gw-x500 的风险', [{ id: 'p1', name: 'GW-X500' }])).toBe('p1');
  });
});

describe('resolveProjectTarget', () => {
  it('deterministic: named project resolved WITHOUT calling the LLM', async () => {
    const r = await resolveProjectTarget({ utterance: '项目甲的 EVT 阶段花了多少工作日', projects });
    expect(r).toEqual({ status: 'ok', projectId: 'p1' });
    expect(mockCallAi).not.toHaveBeenCalled(); // 省掉一次 LLM 往返
  });

  it('ok when LLM picks a whitelisted project (no deterministic match)', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ projectId: 'p1' }) });
    expect(await resolveProjectTarget({ utterance: '把那个新项目的打样推迟', projects })).toEqual({ status: 'ok', projectId: 'p1' });
  });
  it('unresolved when LLM returns null', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ projectId: null }) });
    expect((await resolveProjectTarget({ utterance: '随便调一下', projects })).status).toBe('unresolved');
  });
  it('unresolved when LLM fabricates an id', async () => {
    mockCallAi.mockResolvedValueOnce({ content: j({ projectId: 'GHOST' }) });
    expect((await resolveProjectTarget({ utterance: 'x', projects })).status).toBe('unresolved');
  });
  it('ai_unavailable when breaker open', async () => {
    mockExecute.mockRejectedValueOnce(new Error('熔断器已开启'));
    expect((await resolveProjectTarget({ utterance: 'x', projects })).status).toBe('ai_unavailable');
  });
  it('ai_unavailable when callAi returns null', async () => {
    mockCallAi.mockResolvedValueOnce(null);
    expect((await resolveProjectTarget({ utterance: 'x', projects })).status).toBe('ai_unavailable');
  });
  it('unresolved when no accessible projects (no LLM call)', async () => {
    const r = await resolveProjectTarget({ utterance: 'x', projects: [] });
    expect(r.status).toBe('unresolved');
    expect(mockCallAi).not.toHaveBeenCalled();
  });
});
