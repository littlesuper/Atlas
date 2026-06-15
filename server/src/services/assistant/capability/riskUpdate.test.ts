import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    project: { findUnique: vi.fn() },
    riskItem: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    riskItemLog: { create: vi.fn() },
  },
}));
vi.mock('../../../db', () => ({ default: mockPrisma, prisma: mockPrisma }));

import { riskUpdateCapability } from './riskUpdate';
import type { RiskChangeIntent } from '../../../schemas/riskAssistant';
import type { EntitySnapshot } from './types';

const j = (o: unknown) => JSON.stringify(o);

const items = [
  { id: 'r1', title: '电源风险', severity: 'MEDIUM', status: 'OPEN' },
  { id: 'r2', title: '供应链延期', severity: 'HIGH', status: 'IN_PROGRESS' },
];

function makeEntity(overItems = items): EntitySnapshot {
  return {
    id: 'p1',
    fingerprint: 'fp-1',
    fields: { riskItems: overItems } as Record<string, unknown>,
  };
}

const makeReq = () => ({ user: { id: 'u1' } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
  mockPrisma.riskItem.findMany.mockResolvedValue(items);
});

describe('riskUpdateCapability', () => {
  it('declares name/permission/mode/target', () => {
    expect(riskUpdateCapability.name).toBe('risk.update');
    expect(riskUpdateCapability.permission).toEqual({ resource: 'project', action: 'update' });
    expect(riskUpdateCapability.mode).toBe('custom');
    expect(riskUpdateCapability.target).toBe('project');
  });

  describe('loadEntity', () => {
    it('loads project risk items + fingerprint', async () => {
      const entity = await riskUpdateCapability.loadEntity!('p1', {} as never);
      expect(entity?.fingerprint).toBeTruthy();
      expect(entity?.id).toBe('p1');
      const f = entity?.fields as { riskItems: unknown[] };
      expect(f.riskItems).toHaveLength(2);
    });
    it('returns null when project missing', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null);
      expect(await riskUpdateCapability.loadEntity!('nope', {} as never)).toBeNull();
    });
  });

  describe('parseArgs', () => {
    it('ok for create_risk', () => {
      const r = riskUpdateCapability.parseArgs!(
        j({ operations: [{ type: 'create_risk', title: '固件缺陷', severity: 'HIGH' }], confidence: 'high', unresolved: [] }),
        {} as never,
        makeEntity()
      );
      expect(r.ok).toBe(true);
    });
    it('ok for update_risk referencing a real risk item', () => {
      const r = riskUpdateCapability.parseArgs!(
        j({ operations: [{ type: 'update_risk', riskItemId: 'r1', status: 'RESOLVED' }], confidence: 'high', unresolved: [] }),
        {} as never,
        makeEntity()
      );
      expect(r.ok).toBe(true);
    });
    it('fabricated when update_risk references unknown risk item', () => {
      const r = riskUpdateCapability.parseArgs!(
        j({ operations: [{ type: 'update_risk', riskItemId: 'GHOST', status: 'RESOLVED' }], confidence: 'high', unresolved: [] }),
        {} as never,
        makeEntity()
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe('fabricated');
    });
    it('not_understood for bad severity enum', () => {
      const r = riskUpdateCapability.parseArgs!(
        j({ operations: [{ type: 'create_risk', title: 'x', severity: 'EXTREME' }], confidence: 'high', unresolved: [] }),
        {} as never,
        makeEntity()
      );
      expect(r.ok).toBe(false);
    });
    it('not_understood for non-json', () => {
      expect(riskUpdateCapability.parseArgs!('我不确定', {} as never, makeEntity()).ok).toBe(false);
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
      const preview = riskUpdateCapability.buildPreview!(intent, makeEntity(), {} as never);
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
      expect(riskUpdateCapability.buildPreview!(intent, makeEntity(), {} as never).rows).toHaveLength(0);
    });
  });

  describe('execute', () => {
    it('creates a risk item + CREATED log', async () => {
      mockPrisma.riskItem.create.mockResolvedValueOnce({ id: 'r-new' });
      const intent: RiskChangeIntent = { operations: [{ type: 'create_risk', title: '固件缺陷', severity: 'HIGH' }], confidence: 'high', unresolved: [] };
      const res = await riskUpdateCapability.execute(intent, {} as never, makeReq(), { id: 'p1', entity: makeEntity() });
      expect(mockPrisma.riskItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: 'p1', title: '固件缺陷', severity: 'HIGH', source: 'manual' }) }));
      expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CREATED' }) }));
      expect(res.rows).toHaveLength(1);
    });

    it('updates status→RESOLVED with resolvedAt + STATUS_CHANGED log', async () => {
      mockPrisma.riskItem.update.mockResolvedValueOnce({});
      const intent: RiskChangeIntent = { operations: [{ type: 'update_risk', riskItemId: 'r1', status: 'RESOLVED' }], confidence: 'high', unresolved: [] };
      await riskUpdateCapability.execute(intent, {} as never, makeReq(), { id: 'p1', entity: makeEntity() });
      const updateCall = mockPrisma.riskItem.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'r1' });
      expect(updateCall.data.status).toBe('RESOLVED');
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
      expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'STATUS_CHANGED' }) }));
    });

    it('does not update when nothing actually changed', async () => {
      const intent: RiskChangeIntent = { operations: [{ type: 'update_risk', riskItemId: 'r2', status: 'IN_PROGRESS' }], confidence: 'high', unresolved: [] };
      await riskUpdateCapability.execute(intent, {} as never, makeReq(), { id: 'p1', entity: makeEntity() });
      expect(mockPrisma.riskItem.update).not.toHaveBeenCalled();
    });
  });
});
