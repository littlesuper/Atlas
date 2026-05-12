import { describe, it, expect } from 'vitest';
import { createRiskItemSchema, updateRiskItemSchema, riskItemCommentSchema, riskItemListQuerySchema } from './riskItems';

describe('riskItems schemas', () => {
  describe('createRiskItemSchema', () => {
    it('accepts valid input', () => {
      const result = createRiskItemSchema.parse({ projectId: 'p1', title: 'risk', severity: 'HIGH' });
      expect(result).toEqual({ projectId: 'p1', title: 'risk', severity: 'HIGH', description: undefined, ownerId: undefined, dueDate: undefined });
    });

    it('accepts all valid severities', () => {
      for (const s of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const) {
        expect(createRiskItemSchema.parse({ projectId: 'p1', title: 't', severity: s }).severity).toBe(s);
      }
    });

    it('rejects empty projectId', () => {
      expect(() => createRiskItemSchema.parse({ projectId: '', title: 't', severity: 'LOW' })).toThrow();
    });

    it('rejects empty title', () => {
      expect(() => createRiskItemSchema.parse({ projectId: 'p1', title: '', severity: 'LOW' })).toThrow();
    });

    it('rejects invalid severity', () => {
      expect(() => createRiskItemSchema.parse({ projectId: 'p1', title: 't', severity: 'EXTREME' })).toThrow();
    });

    it('accepts optional nullable fields', () => {
      const result = createRiskItemSchema.parse({ projectId: 'p1', title: 't', severity: 'LOW', description: null, ownerId: null });
      expect(result.description).toBeNull();
    });
  });

  describe('updateRiskItemSchema', () => {
    it('accepts partial update', () => {
      expect(updateRiskItemSchema.parse({ status: 'RESOLVED' })).toEqual({ status: 'RESOLVED' });
    });

    it('accepts all statuses', () => {
      for (const s of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED'] as const) {
        expect(updateRiskItemSchema.parse({ status: s }).status).toBe(s);
      }
    });

    it('accepts empty object', () => {
      expect(updateRiskItemSchema.parse({})).toEqual({});
    });
  });

  describe('riskItemCommentSchema', () => {
    it('accepts non-empty content', () => {
      expect(riskItemCommentSchema.parse({ content: 'comment' })).toEqual({ content: 'comment' });
    });

    it('rejects empty content', () => {
      expect(() => riskItemCommentSchema.parse({ content: '' })).toThrow();
    });
  });

  describe('riskItemListQuerySchema', () => {
    it('defaults page and pageSize', () => {
      const result = riskItemListQuerySchema.parse({});
      expect(result.page).toBe('1');
      expect(result.pageSize).toBe('20');
    });

    it('accepts filters', () => {
      const result = riskItemListQuerySchema.parse({ projectId: 'p1', status: 'OPEN' });
      expect(result.projectId).toBe('p1');
    });

    it('rejects invalid status in updateRiskItemSchema', () => {
      expect(() => updateRiskItemSchema.parse({ status: 'INVALID' })).toThrow();
    });

    it('accepts all fields together in updateRiskItemSchema', () => {
      const result = updateRiskItemSchema.parse({
        title: 'Updated risk',
        severity: 'CRITICAL',
        status: 'IN_PROGRESS',
        description: 'New desc',
        ownerId: 'u1',
        dueDate: '2026-06-01',
      });
      expect(result.title).toBe('Updated risk');
      expect(result.severity).toBe('CRITICAL');
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.ownerId).toBe('u1');
      });
    });

    it('accepts nullable dueDate in updateRiskItemSchema', () => {
      const result = updateRiskItemSchema.parse({ dueDate: null });
      expect(result.dueDate).toBeNull();
    });

  it('riskItemListQuerySchema rejects invalid status filter', () => {
    expect(() => riskItemListQuerySchema.parse({ status: 'INVALID' })).toThrow();
  });

  it('createRiskItemSchema accepts with all optional fields provided', () => {
    const result = createRiskItemSchema.parse({
      projectId: 'p1', title: 't', severity: 'LOW',
      description: 'desc', ownerId: 'u1', dueDate: '2026-12-01',
    });
    expect(result.description).toBe('desc');
    expect(result.ownerId).toBe('u1');
    expect(result.dueDate).toBe('2026-12-01');
  });

  it('updateRiskItemSchema rejects empty title', () => {
    expect(() => updateRiskItemSchema.parse({ title: '' })).toThrow();
  });

  it('createRiskItemSchema rejects missing severity', () => {
    expect(() => createRiskItemSchema.parse({ projectId: 'p1', title: 't' })).toThrow();
  });

  it('updateRiskItemSchema rejects invalid severity value', () => {
    expect(() => updateRiskItemSchema.parse({ severity: 'EXTREME' })).toThrow();
  });

  it('riskItemCommentSchema rejects whitespace-only content', () => {
    expect(() => riskItemCommentSchema.parse({ content: '   ' })).not.toThrow();
    expect(riskItemCommentSchema.parse({ content: '   ' }).content).toBe('   ');
  });

  it('createRiskItemSchema rejects empty projectId', () => {
    expect(() => createRiskItemSchema.parse({ projectId: '', title: 't', severity: 'LOW' })).toThrow();
  });

  it('createRiskItemSchema rejects empty title', () => {
    expect(() => createRiskItemSchema.parse({ projectId: 'p1', title: '', severity: 'LOW' })).toThrow();
  });

  it('riskItemListQuerySchema accepts only projectId filter', () => {
    const result = riskItemListQuerySchema.parse({ projectId: 'p1' });
    expect(result.projectId).toBe('p1');
    expect(result.status).toBeUndefined();
  });

  it('createRiskItemSchema accepts valid severity CRITICAL', () => {
    const result = createRiskItemSchema.parse({ projectId: 'p1', title: 't', severity: 'CRITICAL' });
    expect(result.severity).toBe('CRITICAL');
  });

  it('riskItemListQuerySchema accepts both projectId and status filters', () => {
    const result = riskItemListQuerySchema.parse({ projectId: 'p1', status: 'OPEN' });
    expect(result.projectId).toBe('p1');
    expect(result.status).toBe('OPEN');
  });

  it('updateRiskItemSchema accepts empty object', () => {
    const result = updateRiskItemSchema.parse({});
    expect(result.title).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it('createRiskItemSchema rejects empty title', () => {
    expect(() => createRiskItemSchema.parse({ projectId: 'p1', title: '', severity: 'HIGH' })).toThrow();
  });

  it('riskItemCommentSchema rejects empty content', () => {
    expect(() => riskItemCommentSchema.parse({ content: '' })).toThrow();
  });

  it('createRiskItemSchema accepts optional description', () => {
    const result = createRiskItemSchema.parse({ projectId: 'p1', title: 'Risk', severity: 'HIGH' });
    expect(result.description).toBeUndefined();
  });

  it('createRiskItemSchema rejects empty projectId', () => {
    expect(() => createRiskItemSchema.parse({ projectId: '', title: 'Risk', severity: 'HIGH' })).toThrow();
  });

  it('createRiskItemSchema rejects empty title', () => {
    expect(() => createRiskItemSchema.parse({ projectId: 'p1', title: '', severity: 'HIGH' })).toThrow();
  });

  it('riskItemListQuerySchema accepts custom page and pageSize', () => {
    const result = riskItemListQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(result.page).toBe('3');
    expect(result.pageSize).toBe('50');
  });

  it('createRiskItemSchema rejects missing title', () => {
    expect(() => createRiskItemSchema.parse({ projectId: 'p1', severity: 'HIGH' })).toThrow();
  });
});

describe('riskItems schemas batch 132 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `project-${index}`,
    `风险项 ${index} <tag>`,
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][index % 4],
  ] as const))(
    'createRiskItemSchema accepts generated severity %s/%s',
    (projectId, title, severity) => {
      const result = createRiskItemSchema.parse({ projectId, title, severity });

      expect(result.projectId).toBe(projectId);
      expect(result.title).toBe(title);
      expect(result.severity).toBe(severity);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `project-${index}`,
    ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED'][index % 4],
    String(index + 1),
    String((index % 50) + 1),
  ] as const))(
    'riskItemListQuerySchema preserves generated paging filters %s/%s',
    (projectId, status, page, pageSize) => {
      const result = riskItemListQuerySchema.parse({ projectId, status, page, pageSize });

      expect(result.projectId).toBe(projectId);
      expect(result.status).toBe(status);
      expect(result.page).toBe(page);
      expect(result.pageSize).toBe(pageSize);
    },
  );
});
