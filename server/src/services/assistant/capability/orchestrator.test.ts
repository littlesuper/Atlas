import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi } = vi.hoisted(() => ({ mockCallAi: vi.fn() }));
vi.mock('../../../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../../../utils/circuitBreaker', () => ({ aiCircuitBreaker: { execute: (fn: () => unknown) => fn() } }));

import { capabilityPropose, capabilityApply } from './orchestrator';
import { registerCapability, __resetCapabilities } from './registry';
import { projectCreateCapability } from './projectCreate';
import { proposalStore } from '../proposalStore';
import type { CapabilityContext } from './types';

const ctx: CapabilityContext = { userId: 'u1', userName: '张三', permissions: ['project:create'], projects: [] };

beforeEach(() => {
  vi.clearAllMocks();
  __resetCapabilities();
  proposalStore.__reset();
  registerCapability(projectCreateCapability);
});

describe('capabilityPropose', () => {
  it('齐全 → ok + 预览', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"项目甲","productLine":"蒲公英"}' });
    const r = await capabilityPropose('project.create', '建个项目甲，产品线蒲公英', ctx);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.preview.rows.find((x) => x.key === 'name')?.after).toBe('项目甲');
      expect(proposalStore.get(r.proposalId)?.capabilityName).toBe('project.create');
    }
  });

  it('缺必填 → need_input + 缺失清单', async () => {
    mockCallAi.mockResolvedValue({ content: '{"productLine":"蒲公英"}' });
    const r = await capabilityPropose('project.create', '帮我建个新项目', ctx);
    expect(r.status).toBe('need_input');
    if (r.status === 'need_input') expect(r.missing).toContain('项目名称');
  });

  it('LLM 不可用 → ai_unavailable', async () => {
    mockCallAi.mockResolvedValue(null);
    const r = await capabilityPropose('project.create', 'x', ctx);
    expect(r.status).toBe('ai_unavailable');
  });

  it('非法枚举 → not_understood', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"甲","productLine":"蒲公英","priority":"WRONG"}' });
    const r = await capabilityPropose('project.create', 'x', ctx);
    expect(r.status).toBe('not_understood');
  });
});

describe('capabilityApply', () => {
  it('apply 调 execute 并标记 applied', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"项目甲","productLine":"蒲公英"}' });
    const r = await capabilityPropose('project.create', '建个项目甲，产品线蒲公英', ctx);
    if (r.status !== 'ok') throw new Error('expected ok');
    const spy = vi.spyOn(projectCreateCapability, 'execute').mockResolvedValue({ rows: [{ key: 'name', label: '名称', before: '（空）', after: '项目甲' }], risks: [] });
    const out = await capabilityApply(r.proposalId, ctx, {} as never);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(out.rows[0].after).toBe('项目甲');
    expect(proposalStore.get(r.proposalId)?.applied).toBeTruthy();
    spy.mockRestore();
  });
});
