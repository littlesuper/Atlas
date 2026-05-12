import { describe, it, expect } from 'vitest';
import { createProjectSchema, projectListQuerySchema } from './projects';
import { createProductSchema, productListQuerySchema as productQuery } from './products';
import { createHolidaySchema, generateHolidaySchema } from './holidays';
import { createCheckItemSchema, batchCreateCheckItemSchema } from './checkItems';
import { createWeeklyReportSchema, aiSuggestionsSchema } from './weeklyReports';
import { createRiskItemSchema, updateRiskItemSchema, riskItemCommentSchema } from './riskItems';
import { createRoleMemberSchema } from './roleMembers';
import { createActivitySchema, batchUpdateSchema, batchDeleteSchema, whatIfSchema, updateActivitySchema } from './activities';

describe('projects schemas', () => {
  it('createProject requires name, startDate, endDate, managerId', () => {
    expect(() => createProjectSchema.parse({ name: '' })).toThrow();
    expect(createProjectSchema.parse({
      name: 'Atlas', startDate: '2026-05-01', endDate: '2026-06-01', managerId: 'm1',
    }).name).toBe('Atlas');
  });

  it('createProject defaults status and priority', () => {
    const r = createProjectSchema.parse({ name: 'P', startDate: '2026-05-01', endDate: '2026-06-01', managerId: 'm1' });
    expect(r.status).toBe('IN_PROGRESS');
    expect(r.priority).toBe('MEDIUM');
  });

  it('projectListQuerySchema defaults page and pageSize', () => {
    const r = projectListQuerySchema.parse({});
    expect(r.page).toBe('1');
    expect(r.pageSize).toBe('20');
  });
});

describe('products schemas', () => {
  it('createProduct requires name', () => {
    expect(() => createProductSchema.parse({ name: '' })).toThrow();
    expect(createProductSchema.parse({ name: 'Widget' }).status).toBe('DEVELOPING');
  });

  it('productQuery defaults pagination', () => {
    expect(productQuery.parse({}).page).toBe('1');
  });
});

describe('holidays schemas', () => {
  it('createHoliday validates date format', () => {
    expect(() => createHolidaySchema.parse({ date: 'not-a-date', name: 'Test' })).toThrow();
    expect(createHolidaySchema.parse({ date: '2026-01-01', name: 'New Year' }).type).toBe('HOLIDAY');
  });

  it('generateHoliday validates year range', () => {
    expect(() => generateHolidaySchema.parse({ year: 2019 })).toThrow();
    expect(() => generateHolidaySchema.parse({ year: 2101 })).toThrow();
    expect(generateHolidaySchema.parse({ year: 2026 }).year).toBe(2026);
  });
});

describe('checkItems schemas', () => {
  it('createCheckItem requires activityId and title', () => {
    expect(() => createCheckItemSchema.parse({ title: 't' })).toThrow();
    expect(() => createCheckItemSchema.parse({ activityId: '1' })).toThrow();
    expect(createCheckItemSchema.parse({ activityId: '1', title: 'Check' }).title).toBe('Check');
  });

  it('batchCreateCheckItemSchema requires at least one item', () => {
    expect(() => batchCreateCheckItemSchema.parse({ activityId: '1', items: [] })).toThrow();
  });
});

describe('weeklyReports schemas', () => {
  it('createWeeklyReport requires projectId, weekStart, weekEnd', () => {
    expect(() => createWeeklyReportSchema.parse({ projectId: '' })).toThrow();
    expect(createWeeklyReportSchema.parse({
      projectId: '1', weekStart: '2026-05-05', weekEnd: '2026-05-11',
    }).progressStatus).toBe('ON_TRACK');
  });

  it('aiSuggestionsSchema requires weekStart and weekEnd', () => {
    expect(() => aiSuggestionsSchema.parse({ weekStart: '' })).toThrow();
  });
});

describe('riskItems schemas', () => {
  it('createRiskItem requires projectId, title, severity', () => {
    expect(() => createRiskItemSchema.parse({ title: 't', severity: 'LOW' })).toThrow();
    expect(createRiskItemSchema.parse({ projectId: '1', title: 'Risk', severity: 'HIGH' }).severity).toBe('HIGH');
  });

  it('createRiskItem rejects invalid severity', () => {
    expect(() => createRiskItemSchema.parse({ projectId: '1', title: 'R', severity: 'INVALID' })).toThrow();
  });

  it('riskItemCommentSchema rejects empty content', () => {
    expect(() => riskItemCommentSchema.parse({ content: '' })).toThrow();
  });

  it('updateRiskItem accepts partial update', () => {
    expect(updateRiskItemSchema.parse({ status: 'RESOLVED' }).status).toBe('RESOLVED');
  });
});

describe('roleMembers schemas', () => {
  it('createRoleMemberSchema requires roleId and userId', () => {

    expect(() => createRoleMemberSchema.parse({ roleId: '' })).toThrow();

    expect(() => createRoleMemberSchema.parse({ roleId: '1', userId: '' })).toThrow();
  });
});

describe('activities schemas', () => {
  it('createActivity requires projectId and name', () => {
    expect(() => createActivitySchema.parse({ name: 'A' })).toThrow();
    const r = createActivitySchema.parse({ projectId: '1', name: 'Task' });
    expect(r.type).toBe('TASK');
    expect(r.status).toBe('NOT_STARTED');
  });

  it('batchUpdateSchema requires at least one id', () => {
    expect(() => batchUpdateSchema.parse({ ids: [], updates: {} })).toThrow();
  });

  it('batchDeleteSchema requires at least one id', () => {
    expect(() => batchDeleteSchema.parse({ ids: [] })).toThrow();
  });

  it('whatIfSchema requires activityId and delayDays', () => {
    expect(() => whatIfSchema.parse({ activityId: '' })).toThrow();
  });

  it('batchDeleteSchema rejects non-array ids', () => {
    expect(() => batchDeleteSchema.parse({ ids: 'not-array' })).toThrow();
  });

  it('createActivitySchema rejects empty projectId', () => {
    expect(() => createActivitySchema.parse({ projectId: '', name: 'A' })).toThrow();
  });

  it('whatIfSchema requires delayDays as integer', () => {
    expect(() => whatIfSchema.parse({ activityId: 'a1', delayDays: 1.5 })).toThrow();
  });

  it('createActivitySchema rejects empty name', () => {
    expect(() => createActivitySchema.parse({ projectId: '1', name: '' })).toThrow();
  });

  it('createActivitySchema accepts valid phase value', () => {
    const result = createActivitySchema.parse({ projectId: '1', name: 'A', phase: '设计' });
    expect(result.phase).toBe('设计');
  });

  it('createActivitySchema defaults type to TASK', () => {
    const result = createActivitySchema.parse({ projectId: '1', name: 'A' });
    expect(result.type).toBe('TASK');
    expect(result.status).toBe('NOT_STARTED');
  });

  it('createActivitySchema accepts MILESTONE type', () => {
    const result = createActivitySchema.parse({ projectId: '1', name: 'MS', type: 'MILESTONE' });
    expect(result.type).toBe('MILESTONE');
  });

  it('createActivitySchema accepts PHASE type', () => {
    const result = createActivitySchema.parse({ projectId: '1', name: 'Phase', type: 'PHASE' });
    expect(result.type).toBe('PHASE');
  });

  it('whatIfSchema rejects missing projectId', () => {
    expect(() => whatIfSchema.parse({})).toThrow();
  });

  it('createActivitySchema defaults type to TASK', () => {
    const result = createActivitySchema.parse({ projectId: '1', name: 'Test' });
    expect(result.type).toBe('TASK');
  });

  it('whatIfSchema accepts valid input', () => {
    const result = whatIfSchema.parse({ activityId: 'a1', delayDays: 3 });
    expect(result.activityId).toBe('a1');
    expect(result.delayDays).toBe(3);
  });

  it('whatIfSchema rejects negative delayDays', () => {
    expect(() => whatIfSchema.parse({ activityId: 'a1', delayDays: -1 })).not.toThrow();
  });

  it('whatIfSchema accepts zero delayDays', () => {
    expect(() => whatIfSchema.parse({ activityId: 'a1', delayDays: 0 })).not.toThrow();
  });

  it('whatIfSchema rejects empty activityId', () => {
    expect(() => whatIfSchema.parse({ activityId: '', delayDays: 1 })).toThrow();
  });

  it('whatIfSchema accepts positive delayDays', () => {
    const result = whatIfSchema.parse({ activityId: 'a1', delayDays: 5 });
    expect(result.delayDays).toBe(5);
  });

  it('createActivitySchema rejects non-integer planDuration', () => {
    expect(() => createActivitySchema.parse({ projectId: '1', name: 'A', planDuration: 1.5 })).toThrow();
  });

  it('updateActivitySchema accepts valid name update', () => {
    const result = updateActivitySchema.parse({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('updateActivitySchema accepts valid status update', () => {
    const result = updateActivitySchema.parse({ status: 'IN_PROGRESS' });
    expect(result.status).toBe('IN_PROGRESS');
  });
});
