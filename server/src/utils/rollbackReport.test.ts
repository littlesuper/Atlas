import { describe, expect, it } from 'vitest';
import { buildRollbackReport } from './rollbackReport';

describe('rollback rehearsal report builder', () => {
  it('marks rollback rehearsal passed when all required checks are met', () => {
    const report = buildRollbackReport({
      currentVersion: '1.4.8',
      targetVersion: '1.4.7',
      reason: 'canary_failed',
      startedAt: '2026-05-05T18:00:00.000Z',
      endedAt: '2026-05-05T18:20:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
      generatedAt: new Date('2026-05-05T18:25:00.000Z'),
    });

    expect(report).toEqual({
      mode: 'ROLLBACK_REPORT',
      status: 'PASSED',
      generatedAt: '2026-05-05T18:25:00.000Z',
      currentVersion: '1.4.8',
      targetVersion: '1.4.7',
      reason: 'canary_failed',
      startedAt: '2026-05-05T18:00:00.000Z',
      endedAt: '2026-05-05T18:20:00.000Z',
      durationMinutes: 20,
      checks: [
        { id: 'target_confirmed', status: 'PASS', message: 'Rollback target version confirmed' },
        { id: 'database_strategy_confirmed', status: 'PASS', message: 'Database strategy confirmed before rollback' },
        { id: 'post_rollback_precheck', status: 'PASS', message: 'Post-rollback precheck returned GO' },
      ],
      issues: [],
      followUps: [],
      recommendation: 'Archive the rollback report and keep normal post-release monitoring active.',
    });
  });

  it('requires follow-up when post-rollback precheck is not GO', () => {
    const report = buildRollbackReport({
      currentVersion: '1.4.8',
      targetVersion: '1.4.7',
      reason: 'canary_failed',
      startedAt: '2026-05-05T18:00:00.000Z',
      endedAt: '2026-05-05T18:35:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: false,
      postRollbackPrecheckStatus: 'NO_GO',
      issues: ['database strategy owner missing'],
      followUps: ['Assign database recovery owner'],
      generatedAt: new Date('2026-05-05T18:40:00.000Z'),
    });

    expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    expect(report.durationMinutes).toBe(35);
    expect(report.checks).toContainEqual({
      id: 'database_strategy_confirmed',
      status: 'FAIL',
      message: 'Database strategy was not confirmed before rollback',
    });
    expect(report.checks).toContainEqual({
      id: 'post_rollback_precheck',
      status: 'FAIL',
      message: 'Post-rollback precheck returned NO_GO',
    });
    expect(report.recommendation).toContain('Close rollback follow-up items');
  });

  it('fails when target is not confirmed', () => {
    const report = buildRollbackReport({
      currentVersion: '1.4.8',
      targetVersion: '1.4.7',
      reason: 'test',
      startedAt: '2026-05-05T18:00:00.000Z',
      endedAt: '2026-05-05T18:10:00.000Z',
      targetConfirmed: false,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    expect(report.checks).toContainEqual({
      id: 'target_confirmed',
      status: 'FAIL',
      message: 'Rollback target version was not confirmed',
    });
  });

  it('includes issues and followUps', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: false,
      databaseStrategyConfirmed: false,
      postRollbackPrecheckStatus: 'NO_GO',
      issues: ['issue-1'],
      followUps: ['fix-1'],
      generatedAt: new Date(),
    });

    expect(report.issues).toEqual(['issue-1']);
    expect(report.followUps).toEqual(['fix-1']);
  });

  it('always has exactly 3 checks', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.checks).toHaveLength(3);
    const ids = report.checks.map((c) => c.id);
    expect(ids).toEqual(['target_confirmed', 'database_strategy_confirmed', 'post_rollback_precheck']);
  });

  it('issues cause FOLLOW_UP_REQUIRED even when all checks pass', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: ['unexpected error in log'],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    expect(report.recommendation).toContain('Close rollback follow-up items');
  });

  it('calculates durationMinutes correctly', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T11:30:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.durationMinutes).toBe(90);
  });

  it('returns 0 duration when end < start', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:30:00.000Z',
      endedAt: '2026-05-05T10:00:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.durationMinutes).toBe(0);
  });

  it('trims and filters issues and followUps', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: ['  issue-1  ', '  '],
      followUps: ['  followup-1  ', '  '],
      generatedAt: new Date(),
    });

    expect(report.issues).toEqual(['issue-1']);
    expect(report.followUps).toEqual(['followup-1']);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });
    const after = new Date();

    const ts = new Date(report.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('mode is always ROLLBACK_REPORT', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });

    expect(report.mode).toBe('ROLLBACK_REPORT');
  });

  it('returns 0 duration for invalid date strings', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: 'not-a-date',
      endedAt: 'also-invalid',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });

    expect(report.durationMinutes).toBe(0);
  });

  it('FOLLOW_UP_REQUIRED recommendation mentions closing items', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: false,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });

    expect(report.recommendation).toContain('follow-up');
  });

  it('whitespace-only issues are filtered leaving PASSED status', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: ['   ', '  ', '\t'],
      followUps: [],
    });

    expect(report.issues).toEqual([]);
    expect(report.status).toBe('PASSED');
  });

  it('followUps alone do not cause FOLLOW_UP_REQUIRED when all checks pass', () => {
    const report = buildRollbackReport({
      currentVersion: '2.0.0',
      targetVersion: '1.9.0',
      reason: 'performance_regression',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:15:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: ['monitor latency for 24h', 'update runbook'],
    });

    expect(report.status).toBe('PASSED');
    expect(report.followUps).toEqual(['monitor latency for 24h', 'update runbook']);
    expect(report.recommendation).toContain('Archive');
  });

  it('whitespace-only followUps are filtered leaving PASSED status', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: ['   ', '  ', '\t'],
    });

    expect(report.followUps).toEqual([]);
    expect(report.status).toBe('PASSED');
  });

  it('rounds sub-minute duration to 0', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:00:15.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });

    expect(report.durationMinutes).toBe(0);
  });

  it('30-second duration rounds to 1 minute', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:00:30.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });

    expect(report.durationMinutes).toBe(1);
  });

  it('checks always have target_confirmed, database_strategy_confirmed, post_rollback_precheck IDs', () => {
    const report = buildRollbackReport({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      targetConfirmed: false,
      databaseStrategyConfirmed: false,
      postRollbackPrecheckStatus: 'NO_GO',
      issues: ['i1'],
      followUps: ['f1'],
    });

    const ids = report.checks.map((c) => c.id);
    expect(ids).toEqual(['target_confirmed', 'database_strategy_confirmed', 'post_rollback_precheck']);
  });

  it('mode is always ROLLBACK_REPORT', () => {
    const report = buildRollbackReport({
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });
    expect(report.mode).toBe('ROLLBACK_REPORT');
  });

  it('report with all green inputs produces PASSED status', () => {
    const report = buildRollbackReport({
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });

    expect(report.status).toBe('PASSED');
    expect(report.issues).toEqual([]);
  });

  it('report with issues has FOLLOW_UP_REQUIRED status', () => {
    const report = buildRollbackReport({
      steps: [{ id: 's1', name: 'step', status: 'DONE' }],
      issues: ['data inconsistency detected'],
      followUps: [],
    });
    expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    expect(report.issues).toHaveLength(1);
  });

  it('report with no issues returns empty array', () => {
    const report = buildRollbackReport({
      currentVersion: '2.0.0',
      targetVersion: '1.0.0',
      reason: 'test',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues: [],
      followUps: [],
    });
    expect(report.issues).toEqual([]);
  });

  it('report with empty steps returns valid structure', () => {
    const report = buildRollbackReport({ version: '1.0.0', steps: [], issues: [], followUps: [] });
    expect(report.issues).toEqual([]);
  });

  it('buildRollbackReport handles empty issues and followUps', () => { const report = buildRollbackReport({ version: '1.0.0', steps: [], issues: [], followUps: [] }); expect(report.followUps).toEqual([]); });

  it('buildRollbackReport handles single step', () => { const report = buildRollbackReport({ currentVersion: '1.0.0', targetVersion: '0.9.0', reason: 'test', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:10:00Z', targetConfirmed: true, databaseStrategyConfirmed: true, postRollbackPrecheckStatus: 'GO', issues: [], followUps: [] }); expect(report.checks).toHaveLength(3); });

  it('buildRollbackReport with issues includes issue count', () => { const report = buildRollbackReport({ version: '1.0.0', steps: [], issues: ['db migration failed'], followUps: [] }); expect(report.issues).toHaveLength(1); });

  it('buildRollbackReport handles multiple issues', () => { const report = buildRollbackReport({ version: '1.0.0', steps: [], issues: ['issue1', 'issue2', 'issue3'], followUps: [] }); expect(report.issues).toHaveLength(3); });

  it('buildRollbackReport handles non-empty followUps', () => { const report = buildRollbackReport({ version: '1.0.0', steps: [], issues: [], followUps: ['monitor', 'post-mortem'] }); expect(report.followUps).toHaveLength(2); });

  it('buildRollbackReport handles empty steps array', () => { const report = buildRollbackReport({ version: '1.0.0', steps: [], issues: [], followUps: [] }); expect(report).toBeDefined(); });

  it('buildRollbackReport handles empty issues array', () => { const report = buildRollbackReport({ version: '1.0.0', steps: [], issues: [], followUps: [] }); expect(report.issues).toHaveLength(0); });

  it('buildRollbackReport handles all checks passing', () => { const report = buildRollbackReport({ currentVersion: '2.0.0', targetVersion: '1.0.0', reason: 'bug', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:30:00Z', targetConfirmed: true, databaseStrategyConfirmed: true, postRollbackPrecheckStatus: 'GO', issues: [], followUps: [] }); expect(report.status).toBe('PASSED'); });

  it('buildRollbackReport handles failed checks', () => { const report = buildRollbackReport({ currentVersion: '2.0.0', targetVersion: '1.0.0', reason: 'bug', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:30:00Z', targetConfirmed: false, databaseStrategyConfirmed: false, postRollbackPrecheckStatus: 'NO_GO', issues: ['issue1'], followUps: [] }); expect(report.issues).toHaveLength(1); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-10T10:${String(index % 30).padStart(2, '0')}:00.000Z`,
    `2026-05-10T10:${String((index % 30) + 1).padStart(2, '0')}:30.000Z`,
    index % 2 === 0,
  ] as const))('rounds generated rollback duration from %s to %s', (startedAt, endedAt, hasIssue) => {
    const issues = hasIssue ? [' issue '] : [];
    const report = buildRollbackReport({
      currentVersion: '2.0.0',
      targetVersion: '1.0.0',
      reason: 'test',
      startedAt,
      endedAt,
      targetConfirmed: true,
      databaseStrategyConfirmed: true,
      postRollbackPrecheckStatus: 'GO',
      issues,
      followUps: [' follow-up ', ' '],
    });

    expect(report.durationMinutes).toBe(2);
    expect(report.issues).toEqual(hasIssue ? ['issue'] : []);
    expect(report.followUps).toEqual(['follow-up']);
    expect(report.status).toBe(hasIssue ? 'FOLLOW_UP_REQUIRED' : 'PASSED');
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 3 === 0,
    index % 3 === 1,
    index % 3 === 2 ? 'GO' : 'NO_GO',
  ] as const))('maps generated failed check combination target=%s db=%s precheck=%s', (targetConfirmed, databaseStrategyConfirmed, postRollbackPrecheckStatus) => {
    const report = buildRollbackReport({
      currentVersion: '2.0.0',
      targetVersion: '1.0.0',
      reason: 'test',
      startedAt: '2026-05-10T10:00:00.000Z',
      endedAt: '2026-05-10T10:10:00.000Z',
      targetConfirmed,
      databaseStrategyConfirmed,
      postRollbackPrecheckStatus,
      issues: [],
      followUps: [],
    });

    expect(report.checks.map((check) => check.status)).toEqual([
      targetConfirmed ? 'PASS' : 'FAIL',
      databaseStrategyConfirmed ? 'PASS' : 'FAIL',
      postRollbackPrecheckStatus === 'GO' ? 'PASS' : 'FAIL',
    ]);
    expect(report.status).toBe(report.checks.every((check) => check.status === 'PASS') ? 'PASSED' : 'FOLLOW_UP_REQUIRED');
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'not-a-valid-date' : `2026-05-11T10:${String((index % 30) + 10).padStart(2, '0')}:00.000Z`,
    '2026-05-11T10:00:00.000Z',
  ] as const))(
    'sets generated invalid or reversed duration to zero from %s',
    (startedAt, endedAt) => {
      const report = buildRollbackReport({
        currentVersion: '4.0.0',
        targetVersion: '3.9.0',
        reason: 'batch149',
        startedAt,
        endedAt,
        targetConfirmed: true,
        databaseStrategyConfirmed: true,
        postRollbackPrecheckStatus: 'GO',
        issues: [],
        followUps: [],
      });

      expect(report.durationMinutes).toBe(0);
      expect(report.status).toBe('PASSED');
      expect(report.recommendation).toContain('Archive');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ` batch149 issue ${index} `,
    ` batch149 follow-up ${index} `,
  ] as const))(
    'normalizes generated rollback issue and follow-up %s',
    (issue, followUp) => {
      const report = buildRollbackReport({
        currentVersion: '4.0.0',
        targetVersion: '3.9.0',
        reason: 'batch149',
        startedAt: '2026-05-11T10:00:00.000Z',
        endedAt: '2026-05-11T10:15:00.000Z',
        targetConfirmed: true,
        databaseStrategyConfirmed: true,
        postRollbackPrecheckStatus: 'GO',
        issues: [' ', issue],
        followUps: [' ', followUp],
      });

      expect(report.issues).toEqual([issue.trim()]);
      expect(report.followUps).toEqual([followUp.trim()]);
      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
      expect(report.recommendation).toContain('follow-up');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-01T08:${String(index % 30).padStart(2, '0')}:00.000Z`,
    `2026-06-01T08:${String((index % 30) + 10).padStart(2, '0')}:00.000Z`,
    10,
  ] as const))(
    'calculates generated rollback duration from %s to %s',
    (startedAt, endedAt, expectedMinutes) => {
      const report = buildRollbackReport({
        currentVersion: '3.0.0',
        targetVersion: '2.9.0',
        reason: 'batch109',
        startedAt,
        endedAt,
        targetConfirmed: true,
        databaseStrategyConfirmed: true,
        postRollbackPrecheckStatus: 'GO',
        issues: [],
        followUps: [],
      });

      expect(report.durationMinutes).toBe(expectedMinutes);
      expect(report.status).toBe('PASSED');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch109 follow-up ${index}`))(
    'preserves generated follow-up %s without failing passed report',
    (followUp) => {
      const report = buildRollbackReport({
        currentVersion: '3.0.0',
        targetVersion: '2.9.0',
        reason: 'batch109',
        startedAt: '2026-06-01T08:00:00.000Z',
        endedAt: '2026-06-01T08:10:00.000Z',
        targetConfirmed: true,
        databaseStrategyConfirmed: true,
        postRollbackPrecheckStatus: 'GO',
        issues: [],
        followUps: [` ${followUp} `],
      });

      expect(report.status).toBe('PASSED');
      expect(report.followUps).toEqual([followUp]);
    },
  );
});

describe('rollback report batch 137 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-11T04:${String(index % 40).padStart(2, '0')}:00.000Z`,
    `2026-05-11T04:${String((index % 40) + 5).padStart(2, '0')}:30.000Z`,
    `issue-batch137-${index}`,
  ] as const))(
    'generated rollback issue requires follow-up %s',
    (startedAt, endedAt, issue) => {
      const report = buildRollbackReport({
        currentVersion: '4.0.0',
        targetVersion: '3.9.0',
        reason: 'batch137',
        startedAt,
        endedAt,
        targetConfirmed: true,
        databaseStrategyConfirmed: true,
        postRollbackPrecheckStatus: 'GO',
        issues: [` ${issue} `],
        followUps: ['  verify manually  '],
      });

      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
      expect(report.durationMinutes).toBe(6);
      expect(report.issues).toEqual([issue]);
      expect(report.followUps).toEqual(['verify manually']);
      expect(report.checks.every((check) => check.status === 'PASS')).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index % 3 !== 0,
    index % 4 === 0 ? 'GO' : 'NO_GO',
  ] as const))(
    'generated rollback check statuses target=%s db=%s precheck=%s',
    (targetConfirmed, databaseStrategyConfirmed, postRollbackPrecheckStatus) => {
      const report = buildRollbackReport({
        currentVersion: '4.0.0',
        targetVersion: '3.9.0',
        reason: 'batch137',
        startedAt: '2026-05-11T04:00:00.000Z',
        endedAt: '2026-05-11T04:10:00.000Z',
        targetConfirmed,
        databaseStrategyConfirmed,
        postRollbackPrecheckStatus,
        issues: [],
        followUps: [],
      });

      expect(report.checks.map((check) => check.status)).toEqual([
        targetConfirmed ? 'PASS' : 'FAIL',
        databaseStrategyConfirmed ? 'PASS' : 'FAIL',
        postRollbackPrecheckStatus === 'GO' ? 'PASS' : 'FAIL',
      ]);
      expect(report.status).toBe(report.checks.every((check) => check.status === 'PASS') ? 'PASSED' : 'FOLLOW_UP_REQUIRED');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-11T09:${String(index % 40).padStart(2, '0')}:15.000Z`,
    `2026-05-11T09:${String((index % 40) + 4).padStart(2, '0')}:45.000Z`,
  ] as const))(
    'calculates generated rounded rollback duration %s to %s',
    (startedAt, endedAt) => {
      const report = buildRollbackReport({
        currentVersion: '5.0.0',
        targetVersion: '4.9.0',
        reason: 'batch155',
        startedAt,
        endedAt,
        targetConfirmed: true,
        databaseStrategyConfirmed: true,
        postRollbackPrecheckStatus: 'GO',
        issues: [' '],
        followUps: [' follow remains informational '],
      });

      expect(report.durationMinutes).toBe(5);
      expect(report.status).toBe('PASSED');
      expect(report.followUps).toEqual(['follow remains informational']);
      expect(report.issues).toEqual([]);
      expect(report.checks.every((check) => check.status === 'PASS')).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index % 3 === 0,
    index % 4 === 0 ? 'GO' : 'NO_GO',
    `issue-batch155-${index}`,
  ] as const))(
    'generated rollback report follows checks and issues target=%s db=%s precheck=%s',
    (targetConfirmed, databaseStrategyConfirmed, postRollbackPrecheckStatus, issue) => {
      const report = buildRollbackReport({
        currentVersion: '5.0.0',
        targetVersion: '4.9.0',
        reason: 'batch155',
        startedAt: '2026-05-11T09:00:00.000Z',
        endedAt: '2026-05-11T09:10:00.000Z',
        targetConfirmed,
        databaseStrategyConfirmed,
        postRollbackPrecheckStatus,
        issues: [' ', ` ${issue} `],
        followUps: [' ', `follow-${issue}`],
      });

      expect(report.checks.map((check) => check.status)).toEqual([
        targetConfirmed ? 'PASS' : 'FAIL',
        databaseStrategyConfirmed ? 'PASS' : 'FAIL',
        postRollbackPrecheckStatus === 'GO' ? 'PASS' : 'FAIL',
      ]);
      expect(report.issues).toEqual([issue]);
      expect(report.followUps).toEqual([`follow-${issue}`]);
      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    },
  );
});

describe('rollback report batch 171 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-11T16:${String(index % 40).padStart(2, '0')}:10.000Z`,
    `2026-05-11T16:${String((index % 40) + 2).padStart(2, '0')}:40.000Z`,
    `follow-batch171-${index}`,
  ] as const))(
    'keeps generated batch171 passed report with informational follow-up %s',
    (startedAt, endedAt, followUp) => {
      const report = buildRollbackReport({
        currentVersion: '6.0.0',
        targetVersion: '5.9.0',
        reason: 'batch171',
        startedAt,
        endedAt,
        targetConfirmed: true,
        databaseStrategyConfirmed: true,
        postRollbackPrecheckStatus: 'GO',
        issues: [' '],
        followUps: [` ${followUp} `],
      });

      expect(report.status).toBe('PASSED');
      expect(report.durationMinutes).toBe(3);
      expect(report.issues).toEqual([]);
      expect(report.followUps).toEqual([followUp]);
      expect(report.recommendation).toContain('Archive');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index % 3 === 0,
    `issue-batch171-${index}`,
  ] as const))(
    'requires generated batch171 follow-up when checks or issues remain %#',
    (targetConfirmed, databaseStrategyConfirmed, issue) => {
      const report = buildRollbackReport({
        currentVersion: '6.0.0',
        targetVersion: '5.9.0',
        reason: 'batch171',
        startedAt: '2026-05-11T17:00:00.000Z',
        endedAt: '2026-05-11T17:10:00.000Z',
        targetConfirmed,
        databaseStrategyConfirmed,
        postRollbackPrecheckStatus: 'NO_GO',
        issues: [` ${issue} `],
        followUps: [' '],
      });

      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
      expect(report.checks.map((check) => check.status)).toEqual([
        targetConfirmed ? 'PASS' : 'FAIL',
        databaseStrategyConfirmed ? 'PASS' : 'FAIL',
        'FAIL',
      ]);
      expect(report.issues).toEqual([issue]);
      expect(report.followUps).toEqual([]);
    },
  );
});
