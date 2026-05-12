import { describe, it, expect } from 'vitest';
import { createWeeklyReportSchema, updateWeeklyReportSchema, weeklyReportListQuerySchema, aiSuggestionsSchema } from './weeklyReports';

describe('weeklyReports schemas', () => {
  describe('createWeeklyReportSchema', () => {
    it('accepts valid minimal input', () => {
      const result = createWeeklyReportSchema.parse({
        projectId: 'p1',
        weekStart: '2026-05-05',
        weekEnd: '2026-05-11',
      });
      expect(result.projectId).toBe('p1');
      expect(result.progressStatus).toBe('ON_TRACK');
    });

    it('defaults progressStatus to ON_TRACK', () => {
      const result = createWeeklyReportSchema.parse({ projectId: 'p1', weekStart: 's', weekEnd: 'e' });
      expect(result.progressStatus).toBe('ON_TRACK');
    });

    it('accepts all progressStatus values', () => {
      for (const s of ['ON_TRACK', 'MINOR_ISSUE', 'MAJOR_ISSUE'] as const) {
        expect(createWeeklyReportSchema.parse({ projectId: 'p1', weekStart: 's', weekEnd: 'e', progressStatus: s }).progressStatus).toBe(s);
      }
    });

    it('rejects empty projectId', () => {
      expect(() => createWeeklyReportSchema.parse({ projectId: '', weekStart: 's', weekEnd: 'e' })).toThrow();
    });

    it('rejects empty weekStart', () => {
      expect(() => createWeeklyReportSchema.parse({ projectId: 'p1', weekStart: '', weekEnd: 'e' })).toThrow();
    });

    it('accepts nullable optional fields', () => {
      const result = createWeeklyReportSchema.parse({
        projectId: 'p1', weekStart: 's', weekEnd: 'e',
        keyProgress: null, nextWeekPlan: null,
      });
      expect(result.keyProgress).toBeNull();
    });
  });

  describe('updateWeeklyReportSchema', () => {
    it('provides default progressStatus on empty object', () => {
      const result = updateWeeklyReportSchema.parse({});
      expect(result.progressStatus).toBe('ON_TRACK');
    });

    it('accepts partial update', () => {
      const result = updateWeeklyReportSchema.parse({ keyProgress: 'progress' });
      expect(result.keyProgress).toBe('progress');
    });
  });

  describe('weeklyReportListQuerySchema', () => {
    it('defaults page and pageSize', () => {
      const result = weeklyReportListQuerySchema.parse({});
      expect(result.page).toBe('1');
      expect(result.pageSize).toBe('20');
    });

    it('accepts all filters', () => {
      const result = weeklyReportListQuerySchema.parse({
        projectId: 'p1', year: '2026', weekNumber: '20', status: 'SUBMITTED',
      });
      expect(result.projectId).toBe('p1');
      expect(result.status).toBe('SUBMITTED');
    });

    it('rejects invalid status', () => {
      expect(() => weeklyReportListQuerySchema.parse({ status: 'INVALID' })).toThrow();
    });
  });

  describe('aiSuggestionsSchema', () => {
    it('accepts valid input', () => {
      expect(aiSuggestionsSchema.parse({ weekStart: '2026-05-05', weekEnd: '2026-05-11' })).toEqual({
        weekStart: '2026-05-05', weekEnd: '2026-05-11',
      });
    });

    it('rejects empty weekStart', () => {
      expect(() => aiSuggestionsSchema.parse({ weekStart: '', weekEnd: 'e' })).toThrow();
    });

    it('rejects missing fields', () => {
      expect(() => aiSuggestionsSchema.parse({})).toThrow();
    });

    it('rejects empty weekEnd', () => {
      expect(() => aiSuggestionsSchema.parse({ weekStart: 's', weekEnd: '' })).toThrow();
    });
  });

  it('createWeeklyReportSchema rejects invalid progressStatus', () => {
    expect(() => createWeeklyReportSchema.parse({ projectId: 'p1', weekStart: 's', weekEnd: 'e', progressStatus: 'INVALID' })).toThrow();
  });

  it('createWeeklyReportSchema rejects missing weekEnd', () => {
    expect(() => createWeeklyReportSchema.parse({ projectId: 'p1', weekStart: 's' })).toThrow();
  });

  it('weeklyReportListQuerySchema accepts custom page and pageSize', () => {
    const result = weeklyReportListQuerySchema.parse({ page: '5', pageSize: '50' });
    expect(result.page).toBe('5');
    expect(result.pageSize).toBe('50');
  });

  it('createWeeklyReportSchema accepts string values for nullable optional fields', () => {
    const result = createWeeklyReportSchema.parse({
      projectId: 'p1',
      weekStart: 's',
      weekEnd: 'e',
      keyProgress: 'progress text',
      nextWeekPlan: 'plan text',
      riskWarning: 'warning text',
    });
    expect(result.keyProgress).toBe('progress text');
    expect(result.nextWeekPlan).toBe('plan text');
    expect(result.riskWarning).toBe('warning text');
  });

  it('createWeeklyReportSchema accepts phaseProgress and attachments as arrays', () => {
    const result = createWeeklyReportSchema.parse({
      projectId: 'p1',
      weekStart: 's',
      weekEnd: 'e',
      phaseProgress: [{ phase: '设计', percent: 50 }],
      attachments: [{ name: 'file.pdf', url: 'https://example.com/file.pdf' }],
    });
    expect(result.phaseProgress).toHaveLength(1);
    expect(result.attachments).toHaveLength(1);
  });

  it('updateWeeklyReportSchema accepts only projectId as partial update', () => {
    const result = updateWeeklyReportSchema.parse({ projectId: 'p2' });
    expect(result.projectId).toBe('p2');
  });

  it('createWeeklyReportSchema accepts risks as nested object array', () => {
    const result = createWeeklyReportSchema.parse({
      projectId: 'p1',
      weekStart: 's',
      weekEnd: 'e',
      risks: [{ category: 'technical', level: 'HIGH', description: 'risk desc' }],
    });
    expect(Array.isArray(result.risks)).toBe(true);
    expect(result.risks).toHaveLength(1);
  });

  it('weeklyReportListQuerySchema defaults page and pageSize when empty', () => {
    const result = weeklyReportListQuerySchema.parse({});
    expect(result.page).toBe('1');
    expect(result.pageSize).toBe('20');
  });

  it('createWeeklyReportSchema rejects empty projectId', () => {
    expect(() => createWeeklyReportSchema.parse({ projectId: '', weekStart: 's', weekEnd: 'e' })).toThrow();
  });

  it('aiSuggestionsSchema accepts weekStart and weekEnd with same date', () => {
    const result = aiSuggestionsSchema.parse({ weekStart: '2026-05-05', weekEnd: '2026-05-05' });
    expect(result.weekStart).toBe('2026-05-05');
    expect(result.weekEnd).toBe('2026-05-05');
  });

  it('createWeeklyReportSchema accepts valid minimal input', () => {
    const result = createWeeklyReportSchema.parse({ projectId: 'p1', weekStart: '2026-05-05', weekEnd: '2026-05-11' });
    expect(result.projectId).toBe('p1');
  });

  it('weeklyReportListQuerySchema defaults optional fields to undefined', () => {
    const result = weeklyReportListQuerySchema.parse({});
    expect(result.projectId).toBeUndefined();
    expect(result.year).toBeUndefined();
    expect(result.weekNumber).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it('createWeeklyReportSchema accepts all nullable fields as null', () => {
    const result = createWeeklyReportSchema.parse({
      projectId: 'p1', weekStart: '2026-01-05', weekEnd: '2026-01-11',
      keyProgress: null, nextWeekPlan: null, riskWarning: null,
    });
    expect(result.keyProgress).toBeNull();
    expect(result.nextWeekPlan).toBeNull();
  });

  it('createWeeklyReportSchema rejects empty projectId', () => {
    expect(() => createWeeklyReportSchema.parse({
      projectId: '', weekStart: '2026-01-05', weekEnd: '2026-01-11',
    })).toThrow();
  });

  it('createWeeklyReportSchema rejects missing weekStart', () => {
    expect(() => createWeeklyReportSchema.parse({
      projectId: 'p1', weekEnd: '2026-01-11',
    })).toThrow();
  });

  it('createWeeklyReportSchema rejects empty weekEnd', () => {
    expect(() => createWeeklyReportSchema.parse({
      projectId: 'p1', weekStart: '2026-01-05', weekEnd: '',
    })).toThrow();
  });

  it('createWeeklyReportSchema rejects empty projectId', () => {
    expect(() => createWeeklyReportSchema.parse({
      projectId: '', weekStart: '2026-01-05', weekEnd: '2026-01-11',
    })).toThrow();
  });

  it('updateWeeklyReportSchema accepts nullable changeOverview', () => {
    const result = updateWeeklyReportSchema.parse({ changeOverview: null });
    expect(result.changeOverview).toBeNull();
  });

  it('createWeeklyReportSchema rejects missing projectId', () => {
    expect(() => createWeeklyReportSchema.parse({ weekStart: '2026-01-06', weekEnd: '2026-01-12', changeOverview: 'test' })).toThrow();
  });
});

describe('weeklyReports schemas batch 132 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `project-${index}`,
    `2029-${String((index % 12) + 1).padStart(2, '0')}-01`,
    `2029-${String((index % 12) + 1).padStart(2, '0')}-07`,
    ['ON_TRACK', 'MINOR_ISSUE', 'MAJOR_ISSUE'][index % 3],
  ] as const))(
    'createWeeklyReportSchema accepts generated progress status %s/%s',
    (projectId, weekStart, weekEnd, progressStatus) => {
      const result = createWeeklyReportSchema.parse({ projectId, weekStart, weekEnd, progressStatus });

      expect(result.projectId).toBe(projectId);
      expect(result.weekStart).toBe(weekStart);
      expect(result.weekEnd).toBe(weekEnd);
      expect(result.progressStatus).toBe(progressStatus);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    String(index + 1),
    String((index % 50) + 1),
    `project-${index}`,
    String(2030 + (index % 4)),
    String((index % 53) + 1),
    ['DRAFT', 'SUBMITTED', 'ARCHIVED'][index % 3],
  ] as const))(
    'weeklyReportListQuerySchema preserves generated filters %s/%s',
    (page, pageSize, projectId, year, weekNumber, status) => {
      const result = weeklyReportListQuerySchema.parse({ page, pageSize, projectId, year, weekNumber, status });

      expect(result.page).toBe(page);
      expect(result.pageSize).toBe(pageSize);
      expect(result.projectId).toBe(projectId);
      expect(result.year).toBe(year);
      expect(result.weekNumber).toBe(weekNumber);
      expect(result.status).toBe(status);
    },
  );
});
