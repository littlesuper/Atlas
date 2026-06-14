import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { project: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('../../../db', () => ({ default: mockPrisma, prisma: mockPrisma }));

import { projectAdapter, ProjectValidationError } from './projectAdapter';
import type { AdapterContext } from '../types';
import type { ProjectChangeIntent } from '../../../schemas/projectAssistant';

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

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.project.findUnique.mockResolvedValue(projectRow());
});

describe('projectAdapter', () => {
  it('declares domain/permission/description', () => {
    expect(projectAdapter.domain).toBe('project');
    expect(projectAdapter.permission).toEqual({ resource: 'project', action: 'update' });
    expect(projectAdapter.description).toMatch(/项目/);
  });

  describe('loadContext', () => {
    it('builds context with current fields + fingerprint', async () => {
      const ctx = (await projectAdapter.loadContext('p1')) as AdapterContext & { project: { name: string } };
      expect(ctx?.targetId).toBe('p1');
      expect(ctx?.fingerprint).toBeTruthy();
      expect(ctx.project.name).toBe('路由器甲');
    });
    it('returns null when project missing', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null);
      expect(await projectAdapter.loadContext('nope')).toBeNull();
    });
    it('returns null for ARCHIVED project (cannot edit)', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(projectRow({ status: 'ARCHIVED' }));
      expect(await projectAdapter.loadContext('p1')).toBeNull();
    });
  });

  describe('parseIntent (Zod + enum backstop)', () => {
    const ctx = { targetId: 'p1', fingerprint: 'fp', project: projectRow() } as unknown as AdapterContext;
    it('ok for valid priority change', () => {
      const r = projectAdapter.parseIntent(j(intent([{ field: 'priority', value: 'HIGH' }])), ctx);
      expect(r.ok).toBe(true);
    });
    it('invalid_schema when LLM sets status=ARCHIVED (not allowed)', () => {
      // 直接构造非法 JSON（绕过类型化 helper），模拟 LLM 输出越界枚举
      const r = projectAdapter.parseIntent(
        j({ operations: [{ field: 'status', value: 'ARCHIVED' }], confidence: 'high', unresolved: [] }),
        ctx
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe('invalid_schema');
    });
    it('invalid_schema for fabricated enum value', () => {
      const r = projectAdapter.parseIntent(
        j({ operations: [{ field: 'priority', value: 'SUPER_URGENT' }], confidence: 'high', unresolved: [] }),
        ctx
      );
      expect(r.ok).toBe(false);
    });
    it('invalid_schema for bad date format', () => {
      const r = projectAdapter.parseIntent(j(intent([{ field: 'endDate', value: '2026/07/10' }])), ctx);
      expect(r.ok).toBe(false);
    });
    it('invalid_schema for unknown field', () => {
      const r = projectAdapter.parseIntent(j({ operations: [{ field: 'budget', value: '100' }], confidence: 'high', unresolved: [] }), ctx);
      expect(r.ok).toBe(false);
    });
    it('unparseable for non-json', () => {
      expect(projectAdapter.parseIntent('我不确定', ctx).ok).toBe(false);
    });
    it('strips fenced json', () => {
      const r = projectAdapter.parseIntent('```json\n' + j(intent([{ field: 'name', value: '新名称' }])) + '\n```', ctx);
      expect(r.ok).toBe(true);
    });
  });

  describe('buildPreview', () => {
    const ctx = { targetId: 'p1', fingerprint: 'fp', project: projectRow() } as unknown as AdapterContext;
    it('maps status/priority to Chinese labels in rows', () => {
      const preview = projectAdapter.buildPreview(intent([{ field: 'status', value: 'ON_HOLD' }, { field: 'priority', value: 'HIGH' }]), ctx);
      const status = preview.rows.find((r) => r.key === 'status');
      expect(status?.before).toBe('进行中');
      expect(status?.after).toBe('已暂停');
      const pr = preview.rows.find((r) => r.key === 'priority');
      expect(pr?.after).toBe('高');
    });
    it('flags danger risk when resulting endDate is before startDate', () => {
      const preview = projectAdapter.buildPreview(intent([{ field: 'endDate', value: '2026-01-01' }]), ctx);
      expect(preview.risks.some((r) => r.severity === 'danger')).toBe(true);
    });
    it('passes confidence through', () => {
      const preview = projectAdapter.buildPreview(intent([{ field: 'name', value: 'x' }], 'low'), ctx);
      expect(preview.confidence).toBe('low');
    });
  });

  describe('apply', () => {
    const ctx = { targetId: 'p1', fingerprint: 'fp', project: projectRow() } as unknown as AdapterContext;
    it('writes via prisma.project.update with mapped data', async () => {
      mockPrisma.project.update.mockResolvedValueOnce({});
      const res = await projectAdapter.apply(intent([{ field: 'priority', value: 'HIGH' }, { field: 'name', value: '新名' }]), ctx, {} as never);
      expect(mockPrisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { priority: 'HIGH', name: '新名' } });
      expect(res.rows).toHaveLength(2);
    });
    it('converts date fields to Date objects', async () => {
      mockPrisma.project.update.mockResolvedValueOnce({});
      await projectAdapter.apply(intent([{ field: 'endDate', value: '2026-09-01' }]), ctx, {} as never);
      const data = mockPrisma.project.update.mock.calls[0][0].data;
      expect(data.endDate).toBeInstanceOf(Date);
    });
    it('throws ProjectValidationError when resulting end < start', async () => {
      await expect(
        projectAdapter.apply(intent([{ field: 'endDate', value: '2026-01-01' }]), ctx, {} as never)
      ).rejects.toBeInstanceOf(ProjectValidationError);
      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });
  });
});
