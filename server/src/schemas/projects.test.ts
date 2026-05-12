import { describe, it, expect } from 'vitest';
import { createProjectSchema, updateProjectSchema, projectIdParamSchema, projectListQuerySchema } from './projects';

describe('projects schemas', () => {
  describe('createProjectSchema', () => {
    it('accepts valid input', () => {
      const result = createProjectSchema.parse({
        name: 'Atlas',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        managerId: 'm1',
      });
      expect(result.name).toBe('Atlas');
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.priority).toBe('MEDIUM');
      expect(result.progress).toBe(0);
    });

    it('rejects empty name', () => {
      expect(() => createProjectSchema.parse({
        name: '', startDate: 's', endDate: 'e', managerId: 'm',
      })).toThrow();
    });

    it('rejects empty startDate', () => {
      expect(() => createProjectSchema.parse({
        name: 'n', startDate: '', endDate: 'e', managerId: 'm',
      })).toThrow();
    });

    it('rejects empty managerId', () => {
      expect(() => createProjectSchema.parse({
        name: 'n', startDate: 's', endDate: 'e', managerId: '',
      })).toThrow();
    });

    it('rejects progress below 0', () => {
      expect(() => createProjectSchema.parse({
        name: 'n', startDate: 's', endDate: 'e', managerId: 'm', progress: -1,
      })).toThrow();
    });

    it('rejects progress above 100', () => {
      expect(() => createProjectSchema.parse({
        name: 'n', startDate: 's', endDate: 'e', managerId: 'm', progress: 101,
      })).toThrow();
    });

    it('accepts all valid statuses', () => {
      for (const s of ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'] as const) {
        const result = createProjectSchema.parse({ name: 'n', startDate: 's', endDate: 'e', managerId: 'm', status: s });
        expect(result.status).toBe(s);
      }
    });

    it('accepts all valid priorities', () => {
      for (const p of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const) {
        const result = createProjectSchema.parse({ name: 'n', startDate: 's', endDate: 'e', managerId: 'm', priority: p });
        expect(result.priority).toBe(p);
      }
    });

    it('accepts nullable productLine', () => {
      const result = createProjectSchema.parse({ name: 'n', startDate: 's', endDate: 'e', managerId: 'm', productLine: null });
      expect(result.productLine).toBeNull();
    });
  });

  describe('updateProjectSchema', () => {
    it('accepts empty object', () => {
      expect(updateProjectSchema.parse({})).toEqual({});
    });

    it('accepts partial update', () => {
      expect(updateProjectSchema.parse({ name: 'Updated' })).toEqual({ name: 'Updated' });
    });

    it('accepts progress within range', () => {
      expect(updateProjectSchema.parse({ progress: 50 }).progress).toBe(50);
    });

    it('rejects progress out of range', () => {
      expect(() => updateProjectSchema.parse({ progress: 200 })).toThrow();
    });
  });

  describe('projectIdParamSchema', () => {
    it('accepts valid id', () => {
      expect(projectIdParamSchema.parse({ id: 'abc' })).toEqual({ id: 'abc' });
    });

    it('rejects empty id', () => {
      expect(() => projectIdParamSchema.parse({ id: '' })).toThrow();
    });
  });

  describe('projectListQuerySchema', () => {
    it('defaults page and pageSize', () => {
      const result = projectListQuerySchema.parse({});
      expect(result.page).toBe('1');
      expect(result.pageSize).toBe('20');
    });

    it('accepts filters', () => {
      const result = projectListQuerySchema.parse({ status: 'IN_PROGRESS', keyword: 'test' });
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.keyword).toBe('test');
    });
  });

  it('createProjectSchema accepts description as optional', () => {
    const result = createProjectSchema.parse({
      name: 'NoDesc', startDate: '2026-01-01', endDate: '2026-12-31', managerId: 'm1',
    });
    expect(result.description).toBeUndefined();
  });

  it('updateProjectSchema rejects invalid status', () => {
    expect(() => updateProjectSchema.parse({ status: 'INVALID' })).toThrow();
  });

  it('updateProjectSchema rejects invalid priority', () => {
    expect(() => updateProjectSchema.parse({ priority: 'URGENT' })).toThrow();
  });

  it('projectListQuerySchema accepts productLine filter', () => {
    const result = projectListQuerySchema.parse({ productLine: '硬件' });
    expect(result.productLine).toBe('硬件');
  });

  it('createProjectSchema accepts progress at boundary 100', () => {
    const result = createProjectSchema.parse({
      name: 'n', startDate: 's', endDate: 'e', managerId: 'm', progress: 100,
    });
    expect(result.progress).toBe(100);
  });

  it('createProjectSchema rejects progress below 0', () => {
    expect(() => createProjectSchema.parse({
      name: 'n', startDate: 's', endDate: 'e', managerId: 'm', progress: -1,
    })).toThrow();
  });

  it('createProjectSchema rejects progress above 100', () => {
    expect(() => createProjectSchema.parse({
      name: 'n', startDate: 's', endDate: 'e', managerId: 'm', progress: 101,
    })).toThrow();
  });

  it('createProjectSchema accepts progress at boundary 0', () => {
    const result = createProjectSchema.parse({
      name: 'n', startDate: 's', endDate: 'e', managerId: 'm', progress: 0,
    });
    expect(result.progress).toBe(0);
  });

  it('createProjectSchema defaults priority to MEDIUM', () => {
    const result = createProjectSchema.parse({
      name: 'n', startDate: 's', endDate: 'e', managerId: 'm',
    });
    expect(result.priority).toBe('MEDIUM');
  });

  it('createProjectSchema accepts description field', () => {
    const result = createProjectSchema.parse({
      name: 'n', startDate: 's', endDate: 'e', managerId: 'm', description: 'test desc',
    });
    expect(result.description).toBe('test desc');
  });

  it('createProjectSchema accepts progress at max boundary 100', () => {
    const result = createProjectSchema.parse({
      name: 'n', startDate: 's', endDate: 'e', managerId: 'm', progress: 100,
    });
    expect(result.progress).toBe(100);
  });

  it('createProjectSchema rejects empty name', () => {
    expect(() => createProjectSchema.parse({
      name: '', startDate: 's', endDate: 'e', managerId: 'm',
    })).toThrow();
  });

  it('updateProjectSchema accepts partial update with only name', () => {
    const result = updateProjectSchema.parse({ name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('createProjectSchema rejects missing managerId', () => {
    expect(() => createProjectSchema.parse({
      name: 'Test', startDate: '2026-01-01', endDate: '2026-06-01',
    })).toThrow();
  });

  it('createProjectSchema rejects empty name', () => {
    expect(() => createProjectSchema.parse({
      name: '', startDate: '2026-01-01', endDate: '2026-06-01', managerId: 'm1',
    })).toThrow();
  });

  it('updateProjectSchema accepts only name field', () => {
    const result = updateProjectSchema.parse({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
    expect(result.startDate).toBeUndefined();
  });

  it('updateProjectSchema accepts nullable productLine', () => {
    const result = updateProjectSchema.parse({ productLine: null });
    expect(result.productLine).toBeNull();
  });

  it('createProjectSchema rejects empty name', () => {
    expect(() => createProjectSchema.parse({ name: '' })).toThrow();
  });
});

describe('projects schemas batch 133 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `项目-${index}-<tag>`,
    ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'][index % 4],
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][index % 4],
    index % 101,
  ] as const))(
    'createProjectSchema accepts generated status priority progress %#',
    (name, status, priority, progress) => {
      const result = createProjectSchema.parse({
        name,
        status,
        priority,
        progress,
        startDate: '2030-01-01',
        endDate: '2030-12-31',
        managerId: 'manager-1',
      });

      expect(result.name).toBe(name);
      expect(result.status).toBe(status);
      expect(result.priority).toBe(priority);
      expect(result.progress).toBe(progress);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    String(index + 1),
    String((index % 50) + 1),
    ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'][index % 4],
    `keyword-${index}`,
    `line-${index}`,
  ] as const))(
    'projectListQuerySchema preserves generated filters %s/%s',
    (page, pageSize, status, keyword, productLine) => {
      const result = projectListQuerySchema.parse({ page, pageSize, status, keyword, productLine });

      expect(result.page).toBe(page);
      expect(result.pageSize).toBe(pageSize);
      expect(result.status).toBe(status);
      expect(result.keyword).toBe(keyword);
      expect(result.productLine).toBe(productLine);
    },
  );
});
