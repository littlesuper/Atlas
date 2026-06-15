import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { project: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('../../../db', () => ({ default: mockPrisma, prisma: mockPrisma }));

import { projectUpdateCapability } from './projectUpdate';
import { CapabilityValidationError } from '../errors';
import type { ProjectChangeIntent } from '../../../schemas/projectAssistant';
import type { EntitySnapshot } from './types';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const j = (o: unknown) => JSON.stringify(o);

const projectRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: '路由器甲',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  startDate: d('2026-03-01'),
  endDate: d('2026-06-01'),
  ...over,
});

const intent = (operations: ProjectChangeIntent['operations'], confidence: 'high' | 'low' = 'high'): ProjectChangeIntent => ({
  operations,
  confidence,
  unresolved: [],
});

// Build a fake EntitySnapshot from a project row
function makeEntity(row = projectRow()): EntitySnapshot {
  return {
    id: row.id as string,
    fingerprint: 'test-fp',
    fields: {
      name: row.name,
      status: row.status,
      priority: row.priority,
      startDate: row.startDate,
      endDate: row.endDate,
    } as unknown as Record<string, unknown>,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.project.findUnique.mockResolvedValue(projectRow());
});

describe('projectUpdateCapability', () => {
  it('declares name/permission/mode/target', () => {
    expect(projectUpdateCapability.name).toBe('project.update');
    expect(projectUpdateCapability.permission).toEqual({ resource: 'project', action: 'update' });
    expect(projectUpdateCapability.mode).toBe('custom');
    expect(projectUpdateCapability.target).toBe('project');
  });

  describe('loadEntity', () => {
    it('builds entity with current fields + fingerprint', async () => {
      const entity = await projectUpdateCapability.loadEntity!('p1', {} as never);
      expect(entity?.id).toBe('p1');
      expect(entity?.fingerprint).toBeTruthy();
      const f = entity?.fields as { name: string };
      expect(f.name).toBe('路由器甲');
    });
    it('returns null when project missing', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null);
      expect(await projectUpdateCapability.loadEntity!('nope', {} as never)).toBeNull();
    });
    it('returns null for ARCHIVED project (cannot edit)', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(projectRow({ status: 'ARCHIVED' }));
      expect(await projectUpdateCapability.loadEntity!('p1', {} as never)).toBeNull();
    });
  });

  describe('parseArgs (Zod + enum backstop)', () => {
    it('ok for valid priority change', () => {
      const r = projectUpdateCapability.parseArgs!(j(intent([{ field: 'priority', value: 'HIGH' }])), {} as never);
      expect(r.ok).toBe(true);
    });
    it('not_understood when LLM sets status=ARCHIVED (not allowed)', () => {
      const r = projectUpdateCapability.parseArgs!(
        j({ operations: [{ field: 'status', value: 'ARCHIVED' }], confidence: 'high', unresolved: [] }),
        {} as never
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe('not_understood');
    });
    it('not_understood for fabricated enum value', () => {
      const r = projectUpdateCapability.parseArgs!(
        j({ operations: [{ field: 'priority', value: 'SUPER_URGENT' }], confidence: 'high', unresolved: [] }),
        {} as never
      );
      expect(r.ok).toBe(false);
    });
    it('not_understood for bad date format', () => {
      const r = projectUpdateCapability.parseArgs!(j(intent([{ field: 'endDate', value: '2026/07/10' }])), {} as never);
      expect(r.ok).toBe(false);
    });
    it('not_understood for unknown field', () => {
      const r = projectUpdateCapability.parseArgs!(
        j({ operations: [{ field: 'budget', value: '100' }], confidence: 'high', unresolved: [] }),
        {} as never
      );
      expect(r.ok).toBe(false);
    });
    it('not_understood for non-json', () => {
      expect(projectUpdateCapability.parseArgs!('我不确定', {} as never).ok).toBe(false);
    });
    it('strips fenced json', () => {
      const r = projectUpdateCapability.parseArgs!('```json\n' + j(intent([{ field: 'name', value: '新名称' }])) + '\n```', {} as never);
      expect(r.ok).toBe(true);
    });
  });

  describe('buildPreview', () => {
    it('maps status/priority to Chinese labels in rows', () => {
      const entity = makeEntity();
      const preview = projectUpdateCapability.buildPreview!(
        intent([{ field: 'status', value: 'ON_HOLD' }, { field: 'priority', value: 'HIGH' }]),
        entity,
        {} as never
      );
      const status = preview.rows.find((r) => r.key === 'status');
      expect(status?.before).toBe('进行中');
      expect(status?.after).toBe('已暂停');
      const pr = preview.rows.find((r) => r.key === 'priority');
      expect(pr?.after).toBe('高');
    });
    it('flags danger risk when resulting endDate is before startDate', () => {
      const entity = makeEntity();
      const preview = projectUpdateCapability.buildPreview!(
        intent([{ field: 'endDate', value: '2026-01-01' }]),
        entity,
        {} as never
      );
      expect(preview.risks.some((r) => r.severity === 'danger')).toBe(true);
    });
    it('passes confidence through', () => {
      const entity = makeEntity();
      const preview = projectUpdateCapability.buildPreview!(intent([{ field: 'name', value: 'x' }], 'low'), entity, {} as never);
      expect(preview.confidence).toBe('low');
    });
  });

  describe('execute', () => {
    it('writes via prisma.project.update with mapped data', async () => {
      mockPrisma.project.update.mockResolvedValueOnce({});
      const entity = makeEntity();
      const res = await projectUpdateCapability.execute(
        intent([{ field: 'priority', value: 'HIGH' }, { field: 'name', value: '新名' }]),
        {} as never,
        {} as never,
        { id: 'p1', entity }
      );
      expect(mockPrisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { priority: 'HIGH', name: '新名' } });
      expect(res.rows).toHaveLength(2);
    });
    it('converts date fields to Date objects', async () => {
      mockPrisma.project.update.mockResolvedValueOnce({});
      const entity = makeEntity();
      await projectUpdateCapability.execute(
        intent([{ field: 'endDate', value: '2026-09-01' }]),
        {} as never,
        {} as never,
        { id: 'p1', entity }
      );
      const data = mockPrisma.project.update.mock.calls[0][0].data;
      expect(data.endDate).toBeInstanceOf(Date);
    });
    it('throws CapabilityValidationError when resulting end < start', async () => {
      const entity = makeEntity();
      await expect(
        projectUpdateCapability.execute(
          intent([{ field: 'endDate', value: '2026-01-01' }]),
          {} as never,
          {} as never,
          { id: 'p1', entity }
        )
      ).rejects.toBeInstanceOf(CapabilityValidationError);
      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });
  });
});
