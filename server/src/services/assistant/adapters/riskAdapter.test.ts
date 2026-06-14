import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    project: { findUnique: vi.fn() },
    riskItem: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    riskItemLog: { create: vi.fn() },
  },
}));
vi.mock('../../../db', () => ({ default: mockPrisma, prisma: mockPrisma }));

import { riskAdapter } from './riskAdapter';
import type { AdapterContext } from '../types';
import type { RiskChangeIntent } from '../../../schemas/riskAssistant';

const j = (o: unknown) => JSON.stringify(o);
const items = [
  { id: 'r1', title: '电源风险', severity: 'MEDIUM', status: 'OPEN' },
  { id: 'r2', title: '供应链延期', severity: 'HIGH', status: 'IN_PROGRESS' },
];
const ctx = { targetId: 'p1', fingerprint: 'fp', riskItems: items } as unknown as AdapterContext;
const makeReq = () => ({ user: { id: 'u1' } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
  mockPrisma.riskItem.findMany.mockResolvedValue(items);
});

describe('riskAdapter', () => {
  it('declares domain/permission/description', () => {
    expect(riskAdapter.domain).toBe('risk');
    expect(riskAdapter.permission).toEqual({ resource: 'project', action: 'update' });
    expect(riskAdapter.description).toMatch(/风险/);
  });

  describe('loadContext', () => {
    it('loads project risk items + fingerprint', async () => {
      const c = (await riskAdapter.loadContext('p1')) as AdapterContext & { riskItems: unknown[] };
      expect(c?.fingerprint).toBeTruthy();
      expect(c.riskItems).toHaveLength(2);
    });
    it('returns null when project missing', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null);
      expect(await riskAdapter.loadContext('nope')).toBeNull();
    });
  });

  describe('parseIntent', () => {
    it('ok for create_risk', () => {
      const r = riskAdapter.parseIntent(j({ operations: [{ type: 'create_risk', title: '固件缺陷', severity: 'HIGH' }], confidence: 'high', unresolved: [] }), ctx);
      expect(r.ok).toBe(true);
    });
    it('ok for update_risk referencing a real risk item', () => {
      const r = riskAdapter.parseIntent(j({ operations: [{ type: 'update_risk', riskItemId: 'r1', status: 'RESOLVED' }], confidence: 'high', unresolved: [] }), ctx);
      expect(r.ok).toBe(true);
    });
    it('fabricated_id when update_risk references unknown risk item', () => {
      const r = riskAdapter.parseIntent(j({ operations: [{ type: 'update_risk', riskItemId: 'GHOST', status: 'RESOLVED' }], confidence: 'high', unresolved: [] }), ctx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe('fabricated_id');
    });
    it('invalid_schema for bad severity enum', () => {
      const r = riskAdapter.parseIntent(j({ operations: [{ type: 'create_risk', title: 'x', severity: 'EXTREME' }], confidence: 'high', unresolved: [] }), ctx);
      expect(r.ok).toBe(false);
    });
    it('unparseable for non-json', () => {
      expect(riskAdapter.parseIntent('我不确定', ctx).ok).toBe(false);
    });
  });

  describe('buildPreview', () => {
    it('renders create row + update field diffs (Chinese labels)', () => {
      const intent: RiskChangeIntent = {
        operations: [
          { type: 'create_risk', title: '固件缺陷', severity: 'HIGH' },
          { type: 'update_risk', riskItemId: 'r1', status: 'RESOLVED', severity: 'CRITICAL' },
        ],
        confidence: 'high',
        unresolved: [],
      };
      const preview = riskAdapter.buildPreview(intent, ctx);
      expect(preview.rows.some((r) => r.label === '新建风险项')).toBe(true);
      expect(preview.rows.some((r) => r.after === '已解决')).toBe(true);
      expect(preview.rows.some((r) => r.after === '严重')).toBe(true);
      expect(preview.confidence).toBe('high');
    });
    it('emits no row for an update that changes nothing', () => {
      const intent: RiskChangeIntent = {
        operations: [{ type: 'update_risk', riskItemId: 'r1', status: 'OPEN' }], // already OPEN
        confidence: 'high',
        unresolved: [],
      };
      expect(riskAdapter.buildPreview(intent, ctx).rows).toHaveLength(0);
    });
  });

  describe('apply', () => {
    it('creates a risk item + CREATED log', async () => {
      mockPrisma.riskItem.create.mockResolvedValueOnce({ id: 'r-new' });
      const intent: RiskChangeIntent = { operations: [{ type: 'create_risk', title: '固件缺陷', severity: 'HIGH' }], confidence: 'high', unresolved: [] };
      const res = await riskAdapter.apply(intent, ctx, makeReq());
      expect(mockPrisma.riskItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: 'p1', title: '固件缺陷', severity: 'HIGH', source: 'manual' }) }));
      expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CREATED' }) }));
      expect(res.rows).toHaveLength(1);
    });

    it('updates status→RESOLVED with resolvedAt + STATUS_CHANGED log', async () => {
      mockPrisma.riskItem.update.mockResolvedValueOnce({});
      const intent: RiskChangeIntent = { operations: [{ type: 'update_risk', riskItemId: 'r1', status: 'RESOLVED' }], confidence: 'high', unresolved: [] };
      await riskAdapter.apply(intent, ctx, makeReq());
      const updateCall = mockPrisma.riskItem.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'r1' });
      expect(updateCall.data.status).toBe('RESOLVED');
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
      expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'STATUS_CHANGED' }) }));
    });

    it('does not update when nothing actually changed', async () => {
      const intent: RiskChangeIntent = { operations: [{ type: 'update_risk', riskItemId: 'r2', status: 'IN_PROGRESS' }], confidence: 'high', unresolved: [] };
      await riskAdapter.apply(intent, ctx, makeReq());
      expect(mockPrisma.riskItem.update).not.toHaveBeenCalled();
    });
  });
});
