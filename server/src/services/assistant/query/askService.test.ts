import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi, mockExecute, mockResolveTarget, mockRunQuery, mockBuildContext } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
  mockResolveTarget: vi.fn(),
  mockRunQuery: vi.fn(),
  mockBuildContext: vi.fn(),
}));
vi.mock('../../../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../../../utils/circuitBreaker', () => ({ aiCircuitBreaker: { execute: mockExecute } }));
vi.mock('../targetResolver', () => ({ resolveProjectTarget: mockResolveTarget }));
vi.mock('./queryService', () => ({ runQuery: mockRunQuery }));
vi.mock('./contextBuilder', () => ({ buildAskContext: mockBuildContext }));

import { runAsk } from './askService';

const manageable = [{ id: 'p1', name: 'GW-X500' }, { id: 'p2', name: '项目乙' }];
const req = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockImplementation((fn: () => Promise<unknown>) => fn());
  mockBuildContext.mockResolvedValue('【系统数据】…');
});

describe('runAsk (hybrid: deterministic-first → grounded)', () => {
  it('deterministic hit: target resolved + whitelist query answered', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'ok', projectId: 'p1' });
    mockRunQuery.mockResolvedValueOnce({ status: 'answered', answer: 'GW-X500 的 EVT 阶段：共 53 个工作日。' });
    const r = await runAsk({ utterance: 'EVT 花了多少工作日', manageable, req });
    expect(r.status).toBe('answered');
    if (r.status === 'answered') {
      expect(r.basis).toBe('deterministic');
      expect(r.answer).toContain('53');
    }
    expect(mockBuildContext).not.toHaveBeenCalled(); // 命中确定性就不走接地
  });

  it('grounded fallback: target resolved but not a whitelist query', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'ok', projectId: 'p1' });
    mockRunQuery.mockResolvedValueOnce({ status: 'not_understood' });
    mockCallAi.mockResolvedValueOnce({ content: '据系统数据，GW-X500 的关键路径在固件联调。' });
    const r = await runAsk({ utterance: 'GW-X500 现在的瓶颈在哪', manageable, req });
    expect(r.status).toBe('answered');
    if (r.status === 'answered') expect(r.basis).toBe('grounded');
    expect(mockBuildContext).toHaveBeenCalledWith({ manageable, focusProjectId: 'p1' });
  });

  it('cross-project question (no single target) → grounded over all permitted projects', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'unresolved' });
    mockCallAi.mockResolvedValueOnce({ content: '据系统数据，风险最高的是 GW-X500。' });
    const r = await runAsk({ utterance: '哪个项目最危险', manageable, req });
    expect(r.status).toBe('answered');
    if (r.status === 'answered') expect(r.basis).toBe('grounded');
    expect(mockBuildContext).toHaveBeenCalledWith({ manageable, focusProjectId: null });
    expect(mockRunQuery).not.toHaveBeenCalled(); // 无单一目标，不走确定性
  });

  it('trims grounded answer', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'unresolved' });
    mockCallAi.mockResolvedValueOnce({ content: '  答案  ' });
    const r = await runAsk({ utterance: 'x', manageable, req });
    if (r.status === 'answered') expect(r.answer).toBe('答案');
  });

  it('ai_unavailable when target resolution AI down', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'ai_unavailable' });
    expect((await runAsk({ utterance: 'x', manageable, req })).status).toBe('ai_unavailable');
  });

  it('ai_unavailable when grounded LLM returns null', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'unresolved' });
    mockCallAi.mockResolvedValueOnce(null);
    expect((await runAsk({ utterance: 'x', manageable, req })).status).toBe('ai_unavailable');
  });

  it('ai_unavailable when grounded breaker open', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'unresolved' });
    mockExecute.mockRejectedValueOnce(new Error('熔断器已开启'));
    expect((await runAsk({ utterance: 'x', manageable, req })).status).toBe('ai_unavailable');
  });
});
