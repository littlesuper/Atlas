import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi } = vi.hoisted(() => ({ mockCallAi: vi.fn() }));
vi.mock('../../../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../../../utils/circuitBreaker', () => ({ aiCircuitBreaker: { execute: (fn: () => unknown) => fn() } }));

import { capabilityPropose, capabilityApply } from './orchestrator';
import { registerCapability, __resetCapabilities } from './registry';
import { projectCreateCapability } from './projectCreate';
import { proposalStore } from '../proposalStore';
import type { CapabilityContext } from './types';
import { z } from 'zod';
import type { Capability, EntitySnapshot } from './types';
import { VersionMismatchError } from '../orchestrator';

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

// —— PR1 骨架：target 类能力（目标定位 + 指纹复核 + 引用校验 + 自定义解析 + 叙述） ——
const targetCtx: CapabilityContext = {
  userId: 'u1', userName: '张三', permissions: ['x:update'],
  projects: [{ id: 'p1', name: '甲项目' }],
};

let fakeFp = 'fp1';
const fakeUpdateCap: Capability = {
  name: 'fake.update',
  description: '改测试实体的值。',
  permission: { resource: 'x', action: 'update' },
  mode: 'update',
  target: 'project',
  inputSchema: z.object({ value: z.string().optional() }),
  buildPrompt: () => ({ system: 's', user: 'u' }),
  loadEntity: async (id) => ({ id, fingerprint: fakeFp, fields: { value: 'old' } }) as EntitySnapshot,
  fingerprint: (e) => e?.fingerprint ?? '',
  buildPreview: (input) => ({
    rows: [{ key: 'value', label: '值', before: 'old', after: String((input as { value?: string }).value ?? '') }],
    risks: [],
  }),
  execute: async () => ({ rows: [{ key: 'value', label: '值', before: 'old', after: 'new' }], risks: [] }),
};

// 项目能认出，但实体已不存在（loadEntity 返回 null）
const fakeMissingCap: Capability = {
  name: 'fake.missing',
  description: '目标实体不存在测试。',
  permission: { resource: 'x', action: 'update' },
  mode: 'update',
  target: 'project',
  inputSchema: z.object({ value: z.string().optional() }),
  buildPrompt: () => ({ system: 's', user: 'u' }),
  loadEntity: async () => null,
  fingerprint: () => 'fp',
  execute: async () => ({ rows: [], risks: [] }),
};

describe('capabilityPropose · target 类', () => {
  beforeEach(() => { fakeFp = 'fp1'; registerCapability(fakeUpdateCap); });

  it('话里点名项目 → 确定性定位 + loadEntity + 出预览', async () => {
    mockCallAi.mockResolvedValue({ content: '{"value":"new"}' });
    const r = await capabilityPropose('fake.update', '把甲项目的值改成 new', targetCtx);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.preview.rows[0].after).toBe('new');
      expect(proposalStore.get(r.proposalId)?.targetId).toBe('p1');
      expect(proposalStore.get(r.proposalId)?.fingerprint).toBe('fp1');
    }
  });

  it('认不出项目 → need_target', async () => {
    mockCallAi.mockResolvedValue({ content: '{"value":"new"}' });
    const r = await capabilityPropose('fake.update', '把那个东西改一下', targetCtx);
    expect(r.status).toBe('need_target');
  });

  it('项目认出但实体不存在 → target_not_found（而非 need_target）', async () => {
    registerCapability(fakeMissingCap);
    const r = await capabilityPropose('fake.missing', '把甲项目改一下', targetCtx);
    expect(r.status).toBe('target_not_found');
  });
});

describe('capabilityApply · 指纹复核', () => {
  beforeEach(() => { fakeFp = 'fp1'; registerCapability(fakeUpdateCap); });

  it('propose 后实体被并发改动 → apply 抛 VersionMismatchError', async () => {
    mockCallAi.mockResolvedValue({ content: '{"value":"new"}' });
    const r = await capabilityPropose('fake.update', '把甲项目的值改成 new', targetCtx);
    if (r.status !== 'ok') throw new Error('expected ok');
    fakeFp = 'fp2'; // 模拟并发改动
    await expect(capabilityApply(r.proposalId, targetCtx, {} as never)).rejects.toBeInstanceOf(VersionMismatchError);
  });
});

describe('capabilityPropose · 解析护栏', () => {
  it('validateRefs 判编造 id → not_understood', async () => {
    const refCap: Capability = {
      name: 'ref.create', description: '建带引用的东西。',
      permission: { resource: 'x', action: 'create' }, mode: 'create',
      inputSchema: z.object({ refId: z.string().optional() }),
      buildPrompt: () => ({ system: 's', user: 'u' }),
      validateRefs: (input) => {
        const id = (input as { refId?: string }).refId;
        return id === 'real' ? { ok: true } : { ok: false, fabricated: [String(id)] };
      },
      execute: async () => ({ rows: [], risks: [] }),
    };
    registerCapability(refCap);
    mockCallAi.mockResolvedValue({ content: '{"refId":"造假的"}' });
    const r = await capabilityPropose('ref.create', 'x', { ...ctx, permissions: ['x:create'] });
    expect(r.status).toBe('not_understood');
  });

  it('parseArgs 接管解析（绕过 inputSchema）→ ok', async () => {
    const customCap: Capability = {
      name: 'custom.create', description: '自定义解析。',
      permission: { resource: 'x', action: 'create' }, mode: 'create',
      inputSchema: z.object({}),
      buildPrompt: () => ({ system: 's', user: 'u' }),
      parseArgs: (raw) => (raw.includes('好') ? { ok: true, input: { v: 1 } } : { ok: false, kind: 'not_understood' }),
      buildPreview: () => ({ rows: [{ key: 'v', label: 'V', before: '（空）', after: '1' }], risks: [] }),
      execute: async () => ({ rows: [], risks: [] }),
    };
    registerCapability(customCap);
    mockCallAi.mockResolvedValue({ content: '好的' });
    const r = await capabilityPropose('custom.create', 'x', { ...ctx, permissions: ['x:create'] });
    expect(r.status).toBe('ok');
  });
});

describe('capabilityPropose · 叙述', () => {
  it('能力带 narrate → 走 LLM 复述', async () => {
    const narrateCap: Capability = {
      name: 'narr.create', description: '带叙述。',
      permission: { resource: 'x', action: 'create' }, mode: 'create',
      inputSchema: z.object({ a: z.string().optional() }),
      buildPrompt: () => ({ system: 's', user: 'u' }),
      narrate: () => '请复述：值已设置',
      buildPreview: () => ({ rows: [{ key: 'a', label: 'A', before: '（空）', after: 'x' }], risks: [] }),
      execute: async () => ({ rows: [], risks: [] }),
    };
    registerCapability(narrateCap);
    mockCallAi
      .mockResolvedValueOnce({ content: '{"a":"x"}' }) // 填参
      .mockResolvedValueOnce({ content: '值已设置。' }); // 叙述
    const r = await capabilityPropose('narr.create', 'x', { ...ctx, permissions: ['x:create'] });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.narrative).toBe('值已设置。');
    expect(mockCallAi).toHaveBeenCalledTimes(2);
  });
});
