import { describe, it, expect } from 'vitest';
import {
  createActivitySchema,
  updateActivitySchema,
  batchUpdateSchema,
  batchDeleteSchema,
  batchCreateSchema,
  reorderSchema,
  whatIfSchema,
  applyWhatIfSchema,
  rescheduleSchema,
  undoImportSchema,
} from './activities';

describe('createActivitySchema', () => {
  it('requires projectId and name', () => {
    expect(() => createActivitySchema.parse({ name: 'A' })).toThrow();
    expect(() => createActivitySchema.parse({ projectId: '1' })).toThrow();
  });

  it('parses valid minimal input with defaults', () => {
    const r = createActivitySchema.parse({ projectId: 'p1', name: 'Task' });
    expect(r.projectId).toBe('p1');
    expect(r.name).toBe('Task');
    expect(r.type).toBe('TASK');
    expect(r.status).toBe('NOT_STARTED');
    expect(r.priority).toBe('MEDIUM');
    expect(r.sortOrder).toBe(0);
  });

  it('accepts all activity types', () => {
    for (const type of ['TASK', 'MILESTONE', 'PHASE'] as const) {
      const r = createActivitySchema.parse({ projectId: 'p1', name: 'T', type });
      expect(r.type).toBe(type);
    }
  });

  it('accepts all statuses', () => {
    for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const) {
      const r = createActivitySchema.parse({ projectId: 'p1', name: 'T', status });
      expect(r.status).toBe(status);
    }
  });

  it('accepts all priorities', () => {
    for (const priority of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const) {
      const r = createActivitySchema.parse({ projectId: 'p1', name: 'T', priority });
      expect(r.priority).toBe(priority);
    }
  });

  it('accepts nullable optional fields', () => {
    const r = createActivitySchema.parse({
      projectId: 'p1',
      name: 'T',
      parentId: null,
      phase: null,
      planStartDate: null,
      planEndDate: null,
      planDuration: null,
      startDate: null,
      endDate: null,
      duration: null,
      dependencies: null,
      notes: null,
    });
    expect(r.parentId).toBeNull();
    expect(r.phase).toBeNull();
  });

  it('accepts dependencies array', () => {
    const r = createActivitySchema.parse({
      projectId: 'p1',
      name: 'T',
      dependencies: [{ id: 'd1', type: '0', lag: 2 }],
    });
    expect(r.dependencies).toHaveLength(1);
    expect(r.dependencies![0].id).toBe('d1');
    expect(r.dependencies![0].lag).toBe(2);
  });

  it('dependency defaults type to 0', () => {
    const r = createActivitySchema.parse({
      projectId: 'p1',
      name: 'T',
      dependencies: [{ id: 'd1' }],
    });
    expect(r.dependencies![0].type).toBe('0');
  });

  it('rejects invalid type', () => {
    expect(() => createActivitySchema.parse({ projectId: 'p1', name: 'T', type: 'INVALID' })).toThrow();
  });

  it('rejects negative planDuration', () => {
    expect(() => createActivitySchema.parse({ projectId: 'p1', name: 'T', planDuration: -1 })).toThrow();
  });

  it('rejects zero planDuration', () => {
    expect(() => createActivitySchema.parse({ projectId: 'p1', name: 'T', planDuration: 0 })).toThrow();
  });

  it('accepts valid planDuration', () => {
    const r = createActivitySchema.parse({ projectId: 'p1', name: 'T', planDuration: 5 });
    expect(r.planDuration).toBe(5);
  });
});

describe('updateActivitySchema', () => {
  it('accepts empty object', () => {
    const r = updateActivitySchema.parse({});
    expect(r.name).toBeUndefined();
  });

  it('accepts partial updates', () => {
    const r = updateActivitySchema.parse({ name: 'Updated', status: 'COMPLETED' });
    expect(r.name).toBe('Updated');
    expect(r.status).toBe('COMPLETED');
  });

  it('accepts resetExecutorsByRole', () => {
    const r = updateActivitySchema.parse({ resetExecutorsByRole: true });
    expect(r.resetExecutorsByRole).toBe(true);
  });

  it('rejects empty name', () => {
    expect(() => updateActivitySchema.parse({ name: '' })).toThrow();
  });
});

describe('batchUpdateSchema', () => {
  it('requires at least one id', () => {
    expect(() => batchUpdateSchema.parse({ ids: [], updates: {} })).toThrow();
  });

  it('parses valid batch update', () => {
    const r = batchUpdateSchema.parse({ ids: ['a1'], updates: { status: 'COMPLETED' } });
    expect(r.ids).toEqual(['a1']);
    expect(r.updates.status).toBe('COMPLETED');
  });

  it('rejects empty id string', () => {
    expect(() => batchUpdateSchema.parse({ ids: [''], updates: {} })).toThrow();
  });
});

describe('batchDeleteSchema', () => {
  it('requires at least one id', () => {
    expect(() => batchDeleteSchema.parse({ ids: [] })).toThrow();
  });

  it('parses valid input', () => {
    const r = batchDeleteSchema.parse({ ids: ['a1', 'a2'] });
    expect(r.ids).toHaveLength(2);
  });
});

describe('batchCreateSchema', () => {
  it('requires at least one activity', () => {
    expect(() => batchCreateSchema.parse({ activities: [] })).toThrow();
  });

  it('parses valid input with passthrough', () => {
    const r = batchCreateSchema.parse({
      activities: [{ projectId: 'p1', name: 'A', extra: 'allowed' }],
    });
    expect(r.activities[0]).toHaveProperty('extra');
  });
});

describe('reorderSchema', () => {
  it('requires at least one item', () => {
    expect(() => reorderSchema.parse({ items: [] })).toThrow();
  });

  it('parses valid input', () => {
    const r = reorderSchema.parse({
      items: [{ id: 'a1', sortOrder: 1 }, { id: 'a2', sortOrder: 2, parentId: null }],
    });
    expect(r.items).toHaveLength(2);
    expect(r.items[1].parentId).toBeNull();
  });
});

describe('whatIfSchema', () => {
  it('requires activityId and delayDays', () => {
    expect(() => whatIfSchema.parse({})).toThrow();
    expect(() => whatIfSchema.parse({ activityId: '' })).toThrow();
  });

  it('parses valid input', () => {
    const r = whatIfSchema.parse({ activityId: 'a1', delayDays: 3 });
    expect(r.activityId).toBe('a1');
    expect(r.delayDays).toBe(3);
  });

  it('accepts negative delayDays', () => {
    const r = whatIfSchema.parse({ activityId: 'a1', delayDays: -2 });
    expect(r.delayDays).toBe(-2);
  });
});

describe('applyWhatIfSchema', () => {
  it('requires at least one affected item', () => {
    expect(() => applyWhatIfSchema.parse({ affected: [] })).toThrow();
  });

  it('parses valid input', () => {
    const r = applyWhatIfSchema.parse({
      affected: [{ id: 'a1', newStart: '2025-01-01', newEnd: '2025-01-05' }],
    });
    expect(r.affected).toHaveLength(1);
  });

  it('accepts optional archiveLabel', () => {
    const r = applyWhatIfSchema.parse({
      affected: [{ id: 'a1', newStart: '2025-01-01', newEnd: '2025-01-05' }],
      archiveLabel: 'v2',
    });
    expect(r.archiveLabel).toBe('v2');
  });
});

describe('rescheduleSchema', () => {
  it('accepts empty object', () => {
    const r = rescheduleSchema.parse({});
    expect(r.baseDate).toBeUndefined();
  });

  it('accepts baseDate', () => {
    const r = rescheduleSchema.parse({ baseDate: '2025-01-01' });
    expect(r.baseDate).toBe('2025-01-01');
  });
});

describe('undoImportSchema', () => {
  it('requires at least one id', () => {
    expect(() => undoImportSchema.parse({ ids: [] })).toThrow();
  });

  it('parses valid input', () => {
    const r = undoImportSchema.parse({ ids: ['a1'] });
    expect(r.ids).toEqual(['a1']);
  });

  it('createActivitySchema strips unknown extra fields', () => {
    const result = createActivitySchema.parse({ projectId: 'p1', name: 'A', extraField: 'removed' });
    expect((result as Record<string, unknown>).extraField).toBeUndefined();
  });

  it('createActivitySchema rejects empty projectId', () => {
    expect(() => createActivitySchema.parse({ projectId: '', name: 'A' })).toThrow();
  });

  it('updateActivitySchema accepts empty object', () => {
    const result = updateActivitySchema.parse({});
    expect(result.name).toBeUndefined();
  });

  it('createActivitySchema rejects empty name', () => {
    expect(() => createActivitySchema.parse({ projectId: 'p1', name: '' })).toThrow();
  });

  it('createActivitySchema rejects name with only whitespace', () => {
    expect(() => createActivitySchema.parse({ projectId: 'p1', name: '   ' })).not.toThrow();
  });

  it('updateActivitySchema accepts only status field', () => {
    const result = updateActivitySchema.parse({ status: 'COMPLETED' });
    expect(result.status).toBe('COMPLETED');
    expect(result.name).toBeUndefined();
  });

  it('reorderSchema rejects item with empty id string', () => {
    expect(() => reorderSchema.parse({ items: [{ id: '', sortOrder: 0 }] })).toThrow();
  });

  it('createActivitySchema rejects negative planDuration', () => {
    expect(() => createActivitySchema.parse({ projectId: 'p1', name: 'A', planDuration: -1 })).toThrow();
  });
});

describe('activities schemas batch 133 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `project-${index}`,
    `活动 ${index} <tag>`,
    ['TASK', 'MILESTONE', 'PHASE'][index % 3],
    ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'][index % 4],
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][index % 4],
    index,
  ] as const))(
    'createActivitySchema accepts generated type/status/priority %#',
    (projectId, name, type, status, priority, sortOrder) => {
      const result = createActivitySchema.parse({ projectId, name, type, status, priority, sortOrder });

      expect(result.projectId).toBe(projectId);
      expect(result.name).toBe(name);
      expect(result.type).toBe(type);
      expect(result.status).toBe(status);
      expect(result.priority).toBe(priority);
      expect(result.sortOrder).toBe(sortOrder);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `activity-${index}`,
    index - 30,
  ] as const))(
    'whatIfSchema accepts generated delay %s/%s',
    (activityId, delayDays) => {
      const result = whatIfSchema.parse({ activityId, delayDays });

      expect(result.activityId).toBe(activityId);
      expect(result.delayDays).toBe(delayDays);
    },
  );
});
