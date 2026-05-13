import { describe, expect, it } from 'vitest';
import { buildCanaryReport } from './canaryReport';

describe('canary rollout report builder', () => {
  it('marks rollout completed when all stages pass', () => {
    const report = buildCanaryReport({
      version: '1.4.8',
      targetVersion: '1.4.7',
      baseUrl: 'http://localhost:3000',
      startedAt: '2026-05-05T17:00:00.000Z',
      endedAt: '2026-05-05T18:30:00.000Z',
      stages: [
        { id: 'preflight', status: 'PASS' },
        { id: 'canary_5', status: 'PASS' },
        { id: 'canary_25', status: 'PASS' },
        { id: 'canary_50', status: 'PASS' },
        { id: 'full_rollout', status: 'PASS' },
      ],
      generatedAt: new Date('2026-05-05T18:35:00.000Z'),
    });

    expect(report).toEqual({
      mode: 'CANARY_REPORT',
      status: 'COMPLETED',
      generatedAt: '2026-05-05T18:35:00.000Z',
      version: '1.4.8',
      targetVersion: '1.4.7',
      baseUrl: 'http://localhost:3000',
      startedAt: '2026-05-05T17:00:00.000Z',
      endedAt: '2026-05-05T18:30:00.000Z',
      durationMinutes: 90,
      firstFailedStage: null,
      stages: [
        { id: 'preflight', status: 'PASS' },
        { id: 'canary_5', status: 'PASS' },
        { id: 'canary_25', status: 'PASS' },
        { id: 'canary_50', status: 'PASS' },
        { id: 'full_rollout', status: 'PASS' },
      ],
      rollbackCommand: 'npm run rollback:plan --workspace=server -- --current-version 1.4.8 --target-version 1.4.7 --reason canary_failed --database-strategy forward-fix --base-url http://localhost:3000',
      recommendation: 'Archive the canary report and continue normal monitoring.',
    });
  });

  it('recommends rollback when a canary stage fails', () => {
    const report = buildCanaryReport({
      version: '1.4.8',
      targetVersion: '1.4.7',
      baseUrl: 'http://localhost:3000',
      startedAt: '2026-05-05T17:00:00.000Z',
      endedAt: '2026-05-05T17:25:00.000Z',
      stages: [
        { id: 'preflight', status: 'PASS' },
        { id: 'canary_5', status: 'PASS' },
        { id: 'canary_25', status: 'FAIL', note: 'active_alerts' },
      ],
      generatedAt: new Date('2026-05-05T17:30:00.000Z'),
    });

    expect(report.status).toBe('ROLLBACK_RECOMMENDED');
    expect(report.firstFailedStage).toEqual({ id: 'canary_25', status: 'FAIL', note: 'active_alerts' });
    expect(report.recommendation).toContain('Stop rollout and execute rollback plan');
  });

  it('calculates duration in minutes', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      baseUrl: 'http://localhost:3000',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T11:30:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.durationMinutes).toBe(90);
  });

  it('includes rollback command with correct versions', () => {
    const report = buildCanaryReport({
      version: '3.0.0',
      targetVersion: '2.9.0',
      baseUrl: 'http://localhost:3000',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.rollbackCommand).toContain('--current-version 3.0.0');
    expect(report.rollbackCommand).toContain('--target-version 2.9.0');
  });

  it('sets firstFailedStage to null when all pass', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      baseUrl: 'http://localhost:3000',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.firstFailedStage).toBeNull();
  });

  it('defaults baseUrl to localhost when empty string', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      baseUrl: '',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.baseUrl).toBe('http://localhost:3000');
  });

  it('defaults baseUrl to localhost when whitespace only', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      baseUrl: '   ',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.baseUrl).toBe('http://localhost:3000');
  });

  it('returns zero duration when end is before start', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T12:00:00.000Z',
      endedAt: '2026-05-05T10:00:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.durationMinutes).toBe(0);
  });

  it('returns zero duration for invalid date strings', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: 'not-a-date',
      endedAt: 'also-invalid',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.durationMinutes).toBe(0);
  });

  it('picks first failed stage when multiple fail', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T11:00:00.000Z',
      stages: [
        { id: 'preflight', status: 'PASS' },
        { id: 'canary_5', status: 'FAIL', note: 'error1' },
        { id: 'canary_25', status: 'FAIL', note: 'error2' },
      ],
      generatedAt: new Date(),
    });

    expect(report.firstFailedStage!.id).toBe('canary_5');
    expect(report.firstFailedStage!.note).toBe('error1');
  });

  it('handles SKIPPED stages without marking as failed', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      stages: [
        { id: 'preflight', status: 'PASS' },
        { id: 'canary_5', status: 'SKIPPED' },
      ],
      generatedAt: new Date(),
    });

    expect(report.status).toBe('COMPLETED');
    expect(report.firstFailedStage).toBeNull();
  });

  it('computes duration correctly for known interval', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T11:30:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.durationMinutes).toBe(90);
  });

  it('mode is always CANARY_REPORT', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.mode).toBe('CANARY_REPORT');
  });

  it('defaults generatedAt to current time when not provided', () => {
    const before = new Date();
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
    });
    const after = new Date();

    const ts = new Date(report.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('handles empty stages array as completed', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:00:00.000Z',
      stages: [],
      generatedAt: new Date('2026-05-05T10:05:00.000Z'),
    });

    expect(report.status).toBe('COMPLETED');
    expect(report.firstFailedStage).toBeNull();
    expect(report.stages).toEqual([]);
    expect(report.durationMinutes).toBe(0);
  });

  it('computes non-trivial duration in minutes correctly', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T09:00:00.000Z',
      endedAt: '2026-05-05T10:45:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });

    expect(report.durationMinutes).toBe(105);
  });

  it('fails on preflight stage before any canary stage', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:05:00.000Z',
      stages: [
        { id: 'preflight', status: 'FAIL', note: 'health check failed' },
      ],
      generatedAt: new Date(),
    });

    expect(report.status).toBe('ROLLBACK_RECOMMENDED');
    expect(report.firstFailedStage!.id).toBe('preflight');
    expect(report.firstFailedStage!.note).toBe('health check failed');
  });

  it('stages array is a shallow copy not shared with input', () => {
    const inputStages = [{ id: 'preflight' as const, status: 'PASS' as const }];
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      stages: inputStages,
      generatedAt: new Date(),
    });

    inputStages.push({ id: 'canary_5', status: 'FAIL' });
    expect(report.stages).toHaveLength(1);
  });

  it('preserves stage order in report', () => {
    const stages = [
      { id: 'preflight' as const, status: 'PASS' as const },
      { id: 'canary_5' as const, status: 'PASS' as const },
      { id: 'canary_25' as const, status: 'FAIL' as const, note: 'error' },
      { id: 'canary_50' as const, status: 'PASS' as const },
    ];
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T11:00:00.000Z',
      stages,
      generatedAt: new Date(),
    });
    expect(report.stages.map(s => s.id)).toEqual(['preflight', 'canary_5', 'canary_25', 'canary_50']);
  });

  it('preserves version and targetVersion in report', () => {
    const report = buildCanaryReport({
      version: '2.5.0',
      targetVersion: '2.4.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T11:00:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });
    expect(report.version).toBe('2.5.0');
    expect(report.targetVersion).toBe('2.4.0');
  });

  it('computes single-minute duration correctly', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:01:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });
    expect(report.durationMinutes).toBe(1);
  });

  it('returns zero duration when end is before start', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:01:00.000Z',
      endedAt: '2026-05-05T10:00:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });
    expect(report.durationMinutes).toBe(0);
  });

  it('generates report with baseline metrics', () => {
    const report = buildCanaryReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:01:00.000Z',
      stages: [{ id: 'preflight', status: 'PASS' }],
      generatedAt: new Date(),
    });
    expect(report.version).toBe('1.0.0');
    expect(report.mode).toBe('CANARY_REPORT');
  });

  it('report with zero samples has valid structure', () => {
    const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '2026-05-10T10:00:00Z', endedAt: '2026-05-10T10:01:00Z', stages: [], samples: [] });
    expect(report).toBeDefined();
    expect(report.mode).toBe('CANARY_REPORT');
  });

  it('buildCanaryReport handles empty stages array', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '', endedAt: '', stages: [], samples: [] }); expect(report.stages).toHaveLength(0); });

  it('buildCanaryReport handles null samples gracefully', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '', endedAt: '', stages: [], samples: null as any }); expect(report).toBeDefined(); });

  it('buildCanaryReport handles single stage', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '', endedAt: '', stages: [{ name: 'stage1', percentage: 10, duration: '5m' }], samples: [] }); expect(report.stages).toHaveLength(1); });

  it('buildCanaryReport handles empty version strings', () => { const report = buildCanaryReport({ version: '', targetVersion: '', startedAt: '', endedAt: '', stages: [], samples: [] }); expect(report).toBeDefined(); });

  it('buildCanaryReport handles multiple stages', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '2.0.0', startedAt: '', endedAt: '', stages: [{ name: 's1', percentage: 10, duration: '5m' }, { name: 's2', percentage: 50, duration: '10m' }], samples: [] }); expect(report.stages).toHaveLength(2); });

  it('buildCanaryReport handles null stages gracefully', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '', endedAt: '', stages: [] as any, samples: [] }); expect(report).toBeDefined(); });

  it('buildCanaryReport mode is CANARY_REPORT', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '', endedAt: '', stages: [], samples: [] }); expect(report.mode).toBe('CANARY_REPORT'); });

  it('buildCanaryReport handles samples array', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '', endedAt: '', stages: [], samples: [{ timestamp: '', errorRate: 0, latencyP50: 100, latencyP99: 500 }] }); expect(report).toBeDefined(); });

  it('buildCanaryReport handles empty stages and samples', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '', endedAt: '', stages: [] }); expect(report).toBeDefined(); expect(report.mode).toBe('CANARY_REPORT'); });

  it('buildCanaryReport handles multiple samples', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.1', startedAt: '', endedAt: '', stages: [], samples: [{ timestamp: 't1', errorRate: 0, latencyP50: 100, latencyP99: 500 }, { timestamp: 't2', errorRate: 0.1, latencyP50: 150, latencyP99: 600 }] }); expect(report).toBeDefined(); });

  it('buildCanaryReport handles zero duration', () => { const report = buildCanaryReport({ version: '1.0.0', targetVersion: '1.0.0', startedAt: 't1', endedAt: 't1', stages: [], duration: 0 }); expect(report).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-10T10:${String(index % 40).padStart(2, '0')}:00.000Z`,
    `2026-05-10T10:${String((index % 40) + 2).padStart(2, '0')}:30.000Z`,
    index + 1,
  ] as const))('computes generated canary duration %s to %s', (startedAt, endedAt) => {
    const report = buildCanaryReport({
      version: '2.0.0',
      targetVersion: '1.9.0',
      startedAt,
      endedAt,
      stages: [{ id: 'preflight', status: 'PASS' }],
    });

    expect(report.status).toBe('COMPLETED');
    expect(report.durationMinutes).toBe(3);
    expect(report.firstFailedStage).toBeNull();
    expect(report.recommendation).toContain('Archive');
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
    `failure-${index}`,
  ] as const))('recommends rollback for generated failed stage %s', (stageId, note) => {
    const report = buildCanaryReport({
      version: '2.0.0',
      targetVersion: '1.9.0',
      startedAt: '2026-05-10T10:00:00.000Z',
      endedAt: '2026-05-10T10:10:00.000Z',
      stages: [
        { id: 'preflight', status: 'PASS' },
        { id: stageId as 'preflight', status: 'FAIL', note },
      ],
    });

    expect(report.status).toBe('ROLLBACK_RECOMMENDED');
    expect(report.firstFailedStage).toEqual({ id: stageId, status: 'FAIL', note });
    expect(report.recommendation).toContain(stageId);
  });
});

describe('canary report batch 136 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-11T00:${String(index % 40).padStart(2, '0')}:00.000Z`,
    `2026-05-11T01:${String(index % 40).padStart(2, '0')}:00.000Z`,
    `version-${index}`,
    `target-${index}`,
  ] as const))(
    'builds generated completed report duration for %s',
    (startedAt, endedAt, version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt,
        endedAt,
        stages: [
          { id: 'preflight', status: 'PASS' },
          { id: 'canary_5', status: 'SKIPPED' },
        ],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(60);
      expect(report.firstFailedStage).toBeNull();
      expect(report.version).toBe(version);
      expect(report.targetVersion).toBe(targetVersion);
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 4],
    `note-batch136-${index}`,
  ] as const))(
    'uses first generated failed stage %s for rollback recommendation',
    (failedStage, note) => {
      const report = buildCanaryReport({
        version: '3.0.0',
        targetVersion: '2.9.0',
        startedAt: '2026-05-11T02:00:00.000Z',
        endedAt: '2026-05-11T02:30:00.000Z',
        stages: [
          { id: 'preflight', status: 'PASS' },
          { id: failedStage as 'canary_5', status: 'FAIL', note },
          { id: 'full_rollout', status: 'FAIL', note: 'ignored-later-failure' },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: failedStage, status: 'FAIL', note });
      expect(report.recommendation).toContain(failedStage);
    },
  );
});

describe('canary report batch 156 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch156-note-${index}`,
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
  ] as const))(
    'copies generated stage objects before reporting failure %s',
    (note, failedStage) => {
      const stages = [
        { id: 'preflight' as const, status: 'PASS' as const },
        { id: failedStage as 'canary_5', status: 'FAIL' as const, note },
      ];
      const report = buildCanaryReport({
        version: '4.0.0',
        targetVersion: '3.9.0',
        startedAt: '2026-05-11T04:00:00.000Z',
        endedAt: '2026-05-11T04:10:00.000Z',
        stages,
      });

      stages[1].note = 'mutated-after-report';
      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: failedStage, status: 'FAIL', note });
      expect(report.stages[1].note).toBe(note);
      expect(report.recommendation).toContain(failedStage);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const minute = String(index % 50).padStart(2, '0');
    const endMinute = String((index % 50) + 4).padStart(2, '0');
    return [
      `2026-05-11T05:${minute}:15.000Z`,
      `2026-05-11T05:${endMinute}:45.000Z`,
    ] as const;
  }))(
    'rounds generated half-minute duration from %s to %s',
    (startedAt, endedAt) => {
      const report = buildCanaryReport({
        version: '4.1.0',
        targetVersion: '4.0.0',
        startedAt,
        endedAt,
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(5);
      expect(report.firstFailedStage).toBeNull();
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );
});

describe('canary report batch 170 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `5.${index}.0`,
    `4.${index}.0`,
    index % 2 === 0 ? '   ' : undefined,
  ] as const))(
    'uses generated batch170 default base url for blank input %s',
    (version, targetVersion, baseUrl) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        baseUrl,
        startedAt: '2026-05-11T14:00:00.000Z',
        endedAt: '2026-05-11T14:20:00.000Z',
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe('http://localhost:3000');
      expect(report.durationMinutes).toBe(20);
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch170-note-${index}`,
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
  ] as const))(
    'keeps generated batch170 zero duration when end precedes start %s',
    (note, failedStage) => {
      const report = buildCanaryReport({
        version: '5.1.0',
        targetVersion: '5.0.0',
        startedAt: '2026-05-11T15:30:00.000Z',
        endedAt: '2026-05-11T15:00:00.000Z',
        stages: [
          { id: failedStage as 'preflight', status: 'FAIL', note },
          { id: 'full_rollout', status: 'FAIL', note: 'later' },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.durationMinutes).toBe(0);
      expect(report.firstFailedStage).toEqual({ id: failedStage, status: 'FAIL', note });
      expect(report.recommendation).toContain(failedStage);
    },
  );
});

describe('canary report batch 179 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `6.${index}.0`,
    `5.${index}.0`,
    ` https://canary-${index}.example.test `,
  ] as const))(
    'trims generated batch179 canary base url for completed report %s',
    (version, targetVersion, baseUrl) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        baseUrl,
        startedAt: '2026-05-11T20:00:00.000Z',
        endedAt: '2026-05-11T20:45:00.000Z',
        stages: [
          { id: 'preflight', status: 'PASS' },
          { id: 'canary_5', status: 'SKIPPED' },
        ],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe(baseUrl.trim());
      expect(report.durationMinutes).toBe(45);
      expect(report.firstFailedStage).toBeNull();
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
    `batch179-note-${index}`,
  ] as const))(
    'keeps generated batch179 first failed stage before later failures %s',
    (failedStage, note) => {
      const report = buildCanaryReport({
        version: '6.1.0',
        targetVersion: '6.0.0',
        startedAt: '2026-05-11T21:00:00.000Z',
        endedAt: '2026-05-11T21:09:30.000Z',
        stages: [
          { id: failedStage as 'preflight', status: 'FAIL', note },
          { id: 'full_rollout', status: 'FAIL', note: 'later-failure' },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.durationMinutes).toBe(10);
      expect(report.firstFailedStage).toEqual({ id: failedStage, status: 'FAIL', note });
      expect(report.recommendation).toContain(failedStage);
    },
  );
});

describe('canary report batch 180 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `7.${index}.0`,
    `6.${index}.0`,
    index % 2 === 0 ? 'invalid-start' : '2026-05-12T01:00:00.000Z',
    index % 2 === 0 ? '2026-05-12T01:20:00.000Z' : 'invalid-end',
  ] as const))(
    'keeps generated batch180 invalid duration as zero for version %s',
    (version, targetVersion, startedAt, endedAt) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt,
        endedAt,
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(0);
      expect(report.firstFailedStage).toBeNull();
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch180-note-${index}`,
    ['canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 4],
  ] as const))(
    'copies generated batch180 stage objects before mutation %s',
    (note, failedStage) => {
      const stages = [
        { id: 'preflight' as const, status: 'PASS' as const },
        { id: failedStage as 'canary_5', status: 'FAIL' as const, note },
      ];
      const report = buildCanaryReport({
        version: '7.1.0',
        targetVersion: '7.0.0',
        startedAt: '2026-05-12T02:00:00.000Z',
        endedAt: '2026-05-12T02:30:00.000Z',
        stages,
      });

      stages[1].note = 'mutated';
      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: failedStage, status: 'FAIL', note });
      expect(report.stages[1].note).toBe(note);
      expect(report.recommendation).toContain(failedStage);
    },
  );
});

describe('canary report batch 181 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `8.${index}.0`,
    `7.${index}.0`,
    index % 2 === 0 ? undefined : '   ',
  ] as const))(
    'uses generated batch181 default base url when input is blank for version %s',
    (version, targetVersion, baseUrl) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        baseUrl,
        startedAt: '2026-05-12T06:00:00.000Z',
        endedAt: '2026-05-12T06:15:00.000Z',
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe('http://localhost:3000');
      expect(report.durationMinutes).toBe(15);
      expect(report.rollbackCommand).toContain('--base-url http://localhost:3000');
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
    index % 2 === 0 ? 'PASS' : 'SKIPPED',
  ] as const))(
    'treats generated batch181 non-failing stage as completed %s/%s',
    (stageId, status) => {
      const report = buildCanaryReport({
        version: '8.1.0',
        targetVersion: '8.0.0',
        startedAt: '2026-05-12T07:00:00.000Z',
        endedAt: '2026-05-12T07:04:30.000Z',
        stages: [{ id: stageId as 'preflight', status }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(5);
      expect(report.firstFailedStage).toBeNull();
      expect(report.recommendation).toContain('normal monitoring');
    },
  );
});

describe('canary report batch 182 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    index % 2 === 0 ? 29 : 31,
    index % 2 === 0 ? 0 : 1,
  ] as const))(
    'rounds generated batch182 canary duration from seconds %#',
    (minuteOffset, seconds, expectedExtraMinute) => {
      const report = buildCanaryReport({
        version: `9.${minuteOffset}.0`,
        targetVersion: `8.${minuteOffset}.0`,
        startedAt: '2026-05-12T11:00:00.000Z',
        endedAt: `2026-05-12T11:${String(minuteOffset % 50).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.000Z`,
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe((minuteOffset % 50) + expectedExtraMinute);
      expect(report.firstFailedStage).toBeNull();
      expect(report.recommendation).toContain('Archive the canary report');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 4],
    `batch182-failure-${index}`,
  ] as const))(
    'keeps generated batch182 first failure after skipped preflight %s',
    (failedStage, note) => {
      const report = buildCanaryReport({
        version: '9.1.0',
        targetVersion: '9.0.0',
        startedAt: '2026-05-12T12:00:00.000Z',
        endedAt: '2026-05-12T12:10:00.000Z',
        stages: [
          { id: 'preflight', status: 'SKIPPED' },
          { id: failedStage as 'canary_5', status: 'FAIL', note },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: failedStage, status: 'FAIL', note });
      expect(report.recommendation).toContain(failedStage);
      expect(report.rollbackCommand).toContain('--reason canary_failed');
    },
  );
});

describe('canary report batch 183 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-12T15:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `10.${index}.0`,
    `9.${index}.0`,
  ] as const))(
    'generated batch183 empty canary stages complete with supplied timestamp %s',
    (generatedAt, version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-05-12T15:00:00.000Z',
        endedAt: '2026-05-12T15:20:00.000Z',
        stages: [],
        generatedAt: new Date(generatedAt),
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.generatedAt).toBe(generatedAt);
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages).toEqual([]);
      expect(report.durationMinutes).toBe(20);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 4],
  ] as const))(
    'generated batch183 failed stage without note remains first failure %s',
    (failedStage) => {
      const report = buildCanaryReport({
        version: '10.1.0',
        targetVersion: '10.0.0',
        startedAt: '2026-05-12T16:00:00.000Z',
        endedAt: '2026-05-12T16:10:00.000Z',
        stages: [
          { id: 'preflight', status: 'PASS' },
          { id: failedStage as 'canary_5', status: 'FAIL' },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: failedStage, status: 'FAIL' });
      expect(report.recommendation).toContain(failedStage);
      expect(report.durationMinutes).toBe(10);
    },
  );
});

describe('canary report batch 184 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `11.${index}.0`,
    `10.${index}.0`,
    `https://canary-${index}.example.test/path?batch=184`,
  ] as const))(
    'generated batch184 rollback command includes supplied canary base url %s',
    (version, targetVersion, baseUrl) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        baseUrl,
        startedAt: '2026-05-12T21:00:00.000Z',
        endedAt: '2026-05-12T21:01:00.000Z',
        stages: [{ id: 'preflight', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.baseUrl).toBe(baseUrl);
      expect(report.rollbackCommand).toContain(`--current-version ${version}`);
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
      expect(report.rollbackCommand).toContain(`--base-url ${baseUrl}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'invalid-start' : '2026-05-12T22:00:00.000Z',
    index % 2 === 0 ? 'invalid-end' : '2026-05-12T21:59:00.000Z',
  ] as const))(
    'generated batch184 invalid or reverse duration remains zero %#',
    (startedAt, endedAt) => {
      const report = buildCanaryReport({
        version: '11.1.0',
        targetVersion: '11.0.0',
        startedAt,
        endedAt,
        stages: [{ id: 'preflight', status: 'SKIPPED' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(0);
      expect(report.firstFailedStage).toBeNull();
      expect(report.startedAt).toBe(startedAt);
      expect(report.endedAt).toBe(endedAt);
    },
  );
});

describe('canary report batch 185 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `\nhttps://batch185-${index}.example.test\t`,
    `12.${index}.0`,
    `11.${index}.0`,
  ] as const))(
    'generated batch185 trims whitespace around base url %#',
    (baseUrl, version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        baseUrl,
        startedAt: '2026-05-13T00:00:00.000Z',
        endedAt: '2026-05-13T00:30:00.000Z',
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe(baseUrl.trim());
      expect(report.rollbackCommand).toContain(`--base-url ${baseUrl.trim()}`);
      expect(report.durationMinutes).toBe(30);
      expect(report.firstFailedStage).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
    index % 2 === 0 ? 'PASS' : 'SKIPPED',
  ] as const))(
    'generated batch185 stage copy keeps original status after mutation %s',
    (stageId, status) => {
      const stages = [{ id: stageId as 'preflight', status: status as 'PASS' | 'SKIPPED' }];
      const report = buildCanaryReport({
        version: '12.1.0',
        targetVersion: '12.0.0',
        startedAt: '2026-05-13T01:00:00.000Z',
        endedAt: '2026-05-13T01:05:00.000Z',
        stages,
      });

      stages[0].status = 'FAIL' as 'PASS';
      expect(report.status).toBe('COMPLETED');
      expect(report.stages[0].status).toBe(status);
      expect(report.firstFailedStage).toBeNull();
      expect(report.recommendation).toContain('normal monitoring');
    },
  );
});

describe('canary report batch 186 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 50,
  ] as const))(
    'generated batch186 duration rounds exact half minute up %#',
    (minuteOffset) => {
      const report = buildCanaryReport({
        version: `13.${minuteOffset}.0`,
        targetVersion: `12.${minuteOffset}.0`,
        startedAt: '2026-05-13T06:00:00.000Z',
        endedAt: `2026-05-13T06:${String(minuteOffset).padStart(2, '0')}:30.000Z`,
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(minuteOffset + 1);
      expect(report.firstFailedStage).toBeNull();
      expect(report.recommendation).toContain('Archive the canary report');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
    index % 2 === 0 ? 'PASS' : 'SKIPPED',
  ] as const))(
    'generated batch186 report stages are copied from input array %s',
    (stageId, status) => {
      const stages = [{ id: stageId as 'preflight', status: status as 'PASS' | 'SKIPPED' }];
      const report = buildCanaryReport({
        version: '13.1.0',
        targetVersion: '13.0.0',
        startedAt: '2026-05-13T07:00:00.000Z',
        endedAt: '2026-05-13T07:01:00.000Z',
        stages,
      });

      expect(report.stages).not.toBe(stages);
      expect(report.stages[0]).not.toBe(stages[0]);
      expect(report.stages[0]).toEqual(stages[0]);
      expect(report.status).toBe('COMPLETED');
    },
  );
});

describe('canary report batch 187 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? '' : '   \n\t',
    `14.${index}.0`,
  ] as const))(
    'generated batch187 blank base url falls back to localhost %#',
    (baseUrl, version) => {
      const report = buildCanaryReport({
        version,
        targetVersion: '13.0.0',
        baseUrl,
        startedAt: '2026-05-13T11:00:00.000Z',
        endedAt: '2026-05-13T11:02:00.000Z',
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe('http://localhost:3000');
      expect(report.rollbackCommand).toContain('--base-url http://localhost:3000');
      expect(report.durationMinutes).toBe(2);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
    `2026-05-13T12:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch187 failure report keeps generatedAt and failed stage note %s',
    (stageId, generatedAt) => {
      const report = buildCanaryReport({
        version: '14.1.0',
        targetVersion: '14.0.0',
        startedAt: '2026-05-13T12:00:00.000Z',
        endedAt: '2026-05-13T12:10:00.000Z',
        generatedAt: new Date(generatedAt),
        stages: [{ id: stageId as 'preflight', status: 'FAIL', note: `batch187-${stageId}` }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.generatedAt).toBe(generatedAt);
      expect(report.firstFailedStage).toEqual({ id: stageId, status: 'FAIL', note: `batch187-${stageId}` });
      expect(report.recommendation).toContain(stageId);
    },
  );
});

describe('canary report batch 188 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
    ['full_rollout', 'canary_50', 'canary_25', 'canary_5', 'preflight'][index % 5],
  ] as const))(
    'generated batch188 first failed stage follows stage order %#',
    (firstStageId, laterStageId) => {
      const report = buildCanaryReport({
        version: '15.0.0',
        targetVersion: '14.9.0',
        startedAt: '2026-05-13T15:00:00.000Z',
        endedAt: '2026-05-13T15:20:00.000Z',
        stages: [
          { id: firstStageId as 'preflight', status: 'FAIL', note: `first-${firstStageId}` },
          { id: laterStageId as 'preflight', status: 'FAIL', note: `later-${laterStageId}` },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: firstStageId, status: 'FAIL', note: `first-${firstStageId}` });
      expect(report.recommendation).toContain(firstStageId);
      expect(report.durationMinutes).toBe(20);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'not-a-date' : '2026-05-13T16:00:00.000Z',
    index % 2 === 0 ? '2026-05-13T16:05:00.000Z' : 'not-a-date',
  ] as const))(
    'generated batch188 invalid report dates produce zero duration %#',
    (startedAt, endedAt) => {
      const report = buildCanaryReport({
        version: '15.1.0',
        targetVersion: '15.0.0',
        startedAt,
        endedAt,
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.startedAt).toBe(startedAt);
      expect(report.endedAt).toBe(endedAt);
      expect(report.durationMinutes).toBe(0);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 189 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-13T19:${String((index % 50) + 1).padStart(2, '0')}:00.000Z`,
    `2026-05-13T19:${String(index % 50).padStart(2, '0')}:59.000Z`,
  ] as const))(
    'generated batch189 reverse duration is zero %#',
    (startedAt, endedAt) => {
      const report = buildCanaryReport({
        version: '16.0.0',
        targetVersion: '15.9.0',
        startedAt,
        endedAt,
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(0);
      expect(report.firstFailedStage).toBeNull();
      expect(report.recommendation).toContain('normal monitoring');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `16.${index}.0`,
    `15.${index}.0`,
  ] as const))(
    'generated batch189 undefined base url uses default rollback target %s',
    (version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-05-13T20:00:00.000Z',
        endedAt: '2026-05-13T20:01:00.000Z',
        stages: [{ id: 'preflight', status: 'SKIPPED' }],
      });

      expect(report.baseUrl).toBe('http://localhost:3000');
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
      expect(report.rollbackCommand).toContain('--base-url http://localhost:3000');
      expect(report.status).toBe('COMPLETED');
    },
  );
});

describe('canary report batch 190 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'PASS' : 'SKIPPED',
    `2026-05-13T23:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch190 non-failing single stage completes %#',
    (status, generatedAt) => {
      const report = buildCanaryReport({
        version: '17.0.0',
        targetVersion: '16.9.0',
        startedAt: '2026-05-13T23:00:00.000Z',
        endedAt: '2026-05-13T23:00:29.000Z',
        generatedAt: new Date(generatedAt),
        stages: [{ id: 'canary_5', status: status as 'PASS' | 'SKIPPED' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.generatedAt).toBe(generatedAt);
      expect(report.firstFailedStage).toBeNull();
      expect(report.durationMinutes).toBe(0);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch190-${index}.example.test/base?x=${index}`,
    `17.${index}.0`,
  ] as const))(
    'generated batch190 rollback command preserves complex base url %s',
    (baseUrl, version) => {
      const report = buildCanaryReport({
        version,
        targetVersion: '16.0.0',
        baseUrl,
        startedAt: '2026-05-14T00:00:00.000Z',
        endedAt: '2026-05-14T00:02:00.000Z',
        stages: [{ id: 'full_rollout', status: 'FAIL', note: 'batch190' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.baseUrl).toBe(baseUrl);
      expect(report.rollbackCommand).toContain(`--current-version ${version}`);
      expect(report.rollbackCommand).toContain(`--base-url ${baseUrl}`);
    },
  );
});

describe('canary report batch 191 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-14T04:${String(index % 50).padStart(2, '0')}:00.000+08:00`,
    index % 2 === 0 ? 'PASS' : 'SKIPPED',
  ] as const))(
    'generated batch191 generatedAt offset normalizes for completed report %#',
    (generatedAt, status) => {
      const report = buildCanaryReport({
        version: '18.0.0',
        targetVersion: '17.9.0',
        startedAt: '2026-05-14T04:00:00.000Z',
        endedAt: '2026-05-14T04:03:00.000Z',
        generatedAt: new Date(generatedAt),
        stages: [{ id: 'preflight', status: status as 'PASS' | 'SKIPPED' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.generatedAt).toBe(new Date(generatedAt).toISOString());
      expect(report.firstFailedStage).toBeNull();
      expect(report.durationMinutes).toBe(3);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `18.${index}.0`,
  ] as const))(
    'generated batch191 empty stage list remains completed %s',
    (version) => {
      const report = buildCanaryReport({
        version,
        targetVersion: '18.0.0',
        startedAt: '2026-05-14T05:00:00.000Z',
        endedAt: '2026-05-14T05:00:31.000Z',
        stages: [],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.stages).toEqual([]);
      expect(report.firstFailedStage).toBeNull();
      expect(report.durationMinutes).toBe(1);
    },
  );
});

describe('canary report batch 192 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch192-${index}`,
    index % 2 === 0 ? 'PASS' : 'SKIPPED',
  ] as const))(
    'generated batch192 report clones stage objects before external mutation %s',
    (note, initialStatus) => {
      const stages = [{ id: 'canary_25' as const, status: initialStatus as 'PASS' | 'SKIPPED', note }];
      const report = buildCanaryReport({
        version: '19.0.0',
        targetVersion: '18.9.0',
        startedAt: '2026-05-14T08:00:00.000Z',
        endedAt: '2026-05-14T08:02:29.000Z',
        stages,
      });

      stages[0].status = 'FAIL';
      stages[0].note = `${note}-mutated`;

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0]).toEqual({ id: 'canary_25', status: initialStatus, note });
      expect(report.durationMinutes).toBe(2);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? '2026-05-14T09:00:00.000Z' : '2026-05-14T09:00:30.000Z',
    index % 2 === 0 ? '2026-05-14T09:00:00.000Z' : '2026-05-14T09:01:01.000Z',
    index % 2 === 0 ? 0 : 1,
  ] as const))(
    'generated batch192 duration rounds elapsed minutes %#',
    (startedAt, endedAt, expectedDuration) => {
      const report = buildCanaryReport({
        version: '19.1.0',
        targetVersion: '19.0.0',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(expectedDuration);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 193 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `  https://batch193-${index}.example.test/path  `,
    `https://batch193-${index}.example.test/path`,
  ] as const))(
    'generated batch193 trims base url for report and rollback command %#',
    (baseUrl, expectedBaseUrl) => {
      const report = buildCanaryReport({
        version: '20.0.0',
        targetVersion: '19.9.0',
        baseUrl,
        startedAt: '2026-05-14T12:00:00.000Z',
        endedAt: '2026-05-14T12:04:00.000Z',
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe(expectedBaseUrl);
      expect(report.rollbackCommand).toContain(`--base-url ${expectedBaseUrl}`);
      expect(report.durationMinutes).toBe(4);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ` 20.${index}.0 `,
    ` 19.${index}.0 `,
    `20.${index}.0`,
    `19.${index}.0`,
  ] as const))(
    'generated batch193 rollback command trims versions while report preserves input %#',
    (version, targetVersion, trimmedVersion, trimmedTargetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-05-14T13:00:00.000Z',
        endedAt: '2026-05-14T13:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'FAIL', note: 'batch193' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.version).toBe(version);
      expect(report.targetVersion).toBe(targetVersion);
      expect(report.rollbackCommand).toContain(`--current-version ${trimmedVersion}`);
      expect(report.rollbackCommand).toContain(`--target-version ${trimmedTargetVersion}`);
    },
  );
});

describe('canary report batch 194 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ['preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout'][index % 5],
    `batch194-note-${index}`,
  ] as const))(
    'generated batch194 first failure can follow non-failing stages %#',
    (failedStageId, note) => {
      const report = buildCanaryReport({
        version: '21.0.0',
        targetVersion: '20.9.0',
        startedAt: '2026-05-14T16:00:00.000Z',
        endedAt: '2026-05-14T16:05:31.000Z',
        stages: [
          { id: 'preflight', status: 'PASS' },
          { id: failedStageId as 'preflight', status: 'FAIL', note },
          { id: 'full_rollout', status: 'SKIPPED' },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: failedStageId, status: 'FAIL', note });
      expect(report.recommendation).toContain(failedStageId);
      expect(report.durationMinutes).toBe(6);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? '2026-05-14T17:00:29.000Z' : '2026-05-14T17:00:31.000Z',
    index % 2 === 0 ? 0 : 1,
  ] as const))(
    'generated batch194 duration rounds around half minute %#',
    (endedAt, expectedDuration) => {
      const report = buildCanaryReport({
        version: '21.1.0',
        targetVersion: '21.0.0',
        startedAt: '2026-05-14T17:00:00.000Z',
        endedAt,
        stages: [{ id: 'canary_50', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(expectedDuration);
      expect(report.recommendation).toContain('normal monitoring');
    },
  );
});

describe('canary report batch 195 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'SKIPPED' : 'PASS',
  ] as const))(
    'generated batch195 non-failing report keeps completed recommendation %#',
    (status) => {
      const report = buildCanaryReport({
        version: '22.0.0',
        targetVersion: '21.9.0',
        startedAt: '2026-05-14T20:00:00.000Z',
        endedAt: '2026-05-14T20:10:00.000Z',
        stages: [
          { id: 'preflight', status: status as 'PASS' | 'SKIPPED' },
          { id: 'canary_5', status: 'SKIPPED' },
        ],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
      expect(report.durationMinutes).toBe(10);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `22.${index}.0`,
    `21.${index}.0`,
  ] as const))(
    'generated batch195 report keeps rollback command target version %s',
    (version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-05-14T21:00:00.000Z',
        endedAt: '2026-05-14T21:02:00.000Z',
        stages: [{ id: 'full_rollout', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.rollbackCommand).toContain(`--current-version ${version}`);
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
      expect(report.recommendation).toContain('full_rollout');
    },
  );
});

describe('canary report batch 196 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'not-a-date' : '',
    '2026-05-15T00:05:00.000Z',
  ] as const))(
    'generated batch196 invalid startedAt produces zero duration %#',
    (startedAt, endedAt) => {
      const report = buildCanaryReport({
        version: '23.0.0',
        targetVersion: '22.9.0',
        startedAt,
        endedAt,
        stages: [{ id: 'preflight', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.startedAt).toBe(startedAt);
      expect(report.endedAt).toBe(endedAt);
      expect(report.durationMinutes).toBe(0);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `23.${index}.0`,
    index % 2 === 0 ? '' : '   ',
  ] as const))(
    'generated batch196 blank base url falls back to localhost %s',
    (version, baseUrl) => {
      const report = buildCanaryReport({
        version,
        targetVersion: '23.0.0',
        baseUrl,
        startedAt: '2026-05-15T01:00:00.000Z',
        endedAt: '2026-05-15T01:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'SKIPPED' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe('http://localhost:3000');
      expect(report.rollbackCommand).toContain('--base-url http://localhost:3000');
      expect(report.version).toBe(version);
    },
  );
});

describe('canary report batch 197 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch197-note-${index}`,
  ] as const))(
    'generated batch197 empty failure note is copied when later note mutates %s',
    (note) => {
      const stages = [{ id: 'canary_5' as const, status: 'FAIL' as const, note: '' }];
      const report = buildCanaryReport({
        version: '24.0.0',
        targetVersion: '23.9.0',
        startedAt: '2026-05-15T03:00:00.000Z',
        endedAt: '2026-05-15T03:02:00.000Z',
        stages,
      });

      stages[0].note = note;

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: 'canary_5', status: 'FAIL', note: '' });
      expect(report.stages[0].note).toBe('');
      expect(report.recommendation).toContain('canary_5');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? '2026-05-15T04:00:00.000Z' : '2026-05-15T04:00:30.000Z',
    index % 2 === 0 ? '2026-05-15T04:01:29.000Z' : '2026-05-15T04:02:01.000Z',
    index % 2 === 0 ? 1 : 2,
  ] as const))(
    'generated batch197 duration rounds mixed offsets %#',
    (startedAt, endedAt, expectedDuration) => {
      const report = buildCanaryReport({
        version: '24.1.0',
        targetVersion: '24.0.0',
        startedAt,
        endedAt,
        stages: [],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(expectedDuration);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 198 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `  \thttps://batch198-${index}.example.test\n  `,
    `https://batch198-${index}.example.test`,
  ] as const))(
    'generated batch198 trims base url with surrounding whitespace %#',
    (baseUrl, expectedBaseUrl) => {
      const report = buildCanaryReport({
        version: '24.2.0',
        targetVersion: '24.1.0',
        baseUrl,
        startedAt: '2026-05-15T06:00:00.000Z',
        endedAt: '2026-05-15T06:03:00.000Z',
        stages: [{ id: 'canary_25', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe(expectedBaseUrl);
      expect(report.rollbackCommand).toContain(`--base-url ${expectedBaseUrl}`);
      expect(report.durationMinutes).toBe(3);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(`2026-05-15T07:${String(index % 50).padStart(2, '0')}:00.000+08:00`),
  ] as const))(
    'generated batch198 serializes generatedAt with positive offset %#',
    (generatedAt) => {
      const report = buildCanaryReport({
        version: '24.3.0',
        targetVersion: '24.2.0',
        startedAt: '2026-05-15T07:00:00.000+08:00',
        endedAt: '2026-05-15T07:01:00.000+08:00',
        stages: [{ id: 'canary_50', status: 'SKIPPED' }],
        generatedAt,
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.generatedAt).toBe(generatedAt.toISOString());
      expect(report.durationMinutes).toBe(1);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 199 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'SKIPPED' : 'PASS',
  ] as const))(
    'generated batch199 non-failing stage status completes rollout %s',
    (status) => {
      const report = buildCanaryReport({
        version: '24.4.0',
        targetVersion: '24.3.0',
        startedAt: '2026-05-15T09:00:00.000Z',
        endedAt: '2026-05-15T09:04:00.000Z',
        stages: [{ id: 'canary_100', status }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
      expect(report.stages[0].status).toBe(status);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-15T10:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch199 equal start and end produces zero duration %s',
    (timestamp) => {
      const report = buildCanaryReport({
        version: '24.5.0',
        targetVersion: '24.4.0',
        startedAt: timestamp,
        endedAt: timestamp,
        stages: [{ id: 'canary_5', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(0);
      expect(report.startedAt).toBe(timestamp);
      expect(report.endedAt).toBe(timestamp);
    },
  );
});

describe('canary report batch 200 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'canary_25' : 'canary_50',
  ] as const))(
    'generated batch200 first failed stage is selected after earlier non-failures %s',
    (failedStageId) => {
      const report = buildCanaryReport({
        version: '24.6.0',
        targetVersion: '24.5.0',
        startedAt: '2026-05-15T12:00:00.000Z',
        endedAt: '2026-05-15T12:05:00.000Z',
        stages: [
          { id: 'preflight', status: 'PASS' },
          { id: failedStageId, status: 'FAIL' },
          { id: 'full_rollout', status: 'FAIL' },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: failedStageId, status: 'FAIL' });
      expect(report.recommendation).toContain(failedStageId);
      expect(report.durationMinutes).toBe(5);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-15T13:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-05-15T12:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch200 ended before started produces zero duration %#',
    (startedAt, endedAt) => {
      const report = buildCanaryReport({
        version: '24.7.0',
        targetVersion: '24.6.0',
        startedAt,
        endedAt,
        stages: [{ id: 'canary_5', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(0);
      expect(report.startedAt).toBe(startedAt);
      expect(report.endedAt).toBe(endedAt);
    },
  );
});

describe('canary report batch 201 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch201-${index}`,
  ] as const))(
    'generated batch201 failure note is included in first failed stage clone %s',
    (note) => {
      const report = buildCanaryReport({
        version: '24.8.0',
        targetVersion: '24.7.0',
        startedAt: '2026-05-15T17:00:00.000Z',
        endedAt: '2026-05-15T17:07:00.000Z',
        stages: [{ id: 'canary_5', status: 'FAIL', note }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: 'canary_5', status: 'FAIL', note });
      expect(report.stages[0]).toEqual({ id: 'canary_5', status: 'FAIL', note });
      expect(report.recommendation).toContain('canary_5');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 15, 18, index % 50, 0, 500)),
  ] as const))(
    'generated batch201 generatedAt preserves millisecond precision %#',
    (generatedAt) => {
      const report = buildCanaryReport({
        version: '24.9.0',
        targetVersion: '24.8.0',
        startedAt: '2026-05-15T18:00:00.000Z',
        endedAt: '2026-05-15T18:01:00.000Z',
        stages: [{ id: 'canary_25', status: 'PASS' }],
        generatedAt,
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.generatedAt).toBe(generatedAt.toISOString());
      expect(report.durationMinutes).toBe(1);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 202 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `24.${index}.0`,
    `23.${index}.9`,
  ] as const))(
    'generated batch202 rollback command includes version pair %s',
    (version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-05-15T20:00:00.000Z',
        endedAt: '2026-05-15T20:02:00.000Z',
        stages: [{ id: 'canary_50', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.rollbackCommand).toContain(`--current-version ${version}`);
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
      expect(report.recommendation).toContain('canary_50');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'invalid-ended-at' : '',
  ] as const))(
    'generated batch202 invalid endedAt produces zero duration %#',
    (endedAt) => {
      const report = buildCanaryReport({
        version: '25.0.0',
        targetVersion: '24.9.0',
        startedAt: '2026-05-15T21:00:00.000Z',
        endedAt,
        stages: [{ id: 'canary_25', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(0);
      expect(report.endedAt).toBe(endedAt);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 203 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch203-${index}.example.test/path?query=${index}`,
  ] as const))(
    'generated batch203 rollback command preserves complex base url %s',
    (baseUrl) => {
      const report = buildCanaryReport({
        version: '25.1.0',
        targetVersion: '25.0.0',
        baseUrl,
        startedAt: '2026-05-16T00:00:00.000Z',
        endedAt: '2026-05-16T00:04:00.000Z',
        stages: [{ id: 'canary_100', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.baseUrl).toBe(baseUrl);
      expect(report.rollbackCommand).toContain(`--base-url ${baseUrl}`);
      expect(report.recommendation).toContain('canary_100');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'preflight' : 'canary_5',
  ] as const))(
    'generated batch203 skipped stage remains completed with stage id %s',
    (stageId) => {
      const report = buildCanaryReport({
        version: '25.2.0',
        targetVersion: '25.1.0',
        startedAt: '2026-05-16T01:00:00.000Z',
        endedAt: '2026-05-16T01:01:00.000Z',
        stages: [{ id: stageId, status: 'SKIPPED' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0]).toEqual({ id: stageId, status: 'SKIPPED' });
      expect(report.durationMinutes).toBe(1);
    },
  );
});

describe('canary report batch 204 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch204-note-${index}`,
  ] as const))(
    'generated batch204 completed report retains pass stage note %s',
    (note) => {
      const report = buildCanaryReport({
        version: '25.3.0',
        targetVersion: '25.2.0',
        startedAt: '2026-05-16T04:00:00.000Z',
        endedAt: '2026-05-16T04:03:00.000Z',
        stages: [{ id: 'canary_25', status: 'PASS', note }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0]).toEqual({ id: 'canary_25', status: 'PASS', note });
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `  25.${index}.0  `,
    `  25.${index}.1  `,
  ] as const))(
    'generated batch204 versions are retained while rollback command uses trimmed arguments %#',
    (version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-05-16T05:00:00.000Z',
        endedAt: '2026-05-16T05:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.version).toBe(version);
      expect(report.targetVersion).toBe(targetVersion);
      expect(report.rollbackCommand).toContain(`--current-version ${version.trim()}`);
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion.trim()}`);
    },
  );
});

describe('canary report batch 205 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch205-failure-note-${index}`,
  ] as const))(
    'generated batch205 first failed stage includes copied note %s',
    (note) => {
      const report = buildCanaryReport({
        version: '25.4.0',
        targetVersion: '25.3.0',
        startedAt: '2026-05-17T02:00:00.000Z',
        endedAt: '2026-05-17T02:04:00.000Z',
        stages: [
          { id: 'preflight', status: 'PASS' },
          { id: 'canary_25', status: 'FAIL', note },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: 'canary_25', status: 'FAIL', note });
      expect(report.recommendation).toContain('canary_25');
      expect(report.stages[1]).toEqual({ id: 'canary_25', status: 'FAIL', note });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 29 : 31,
    index % 2 === 0 ? 0 : 1,
  ] as const))(
    'generated batch205 rounds sub-minute duration boundaries %#',
    (seconds, expectedDuration) => {
      const report = buildCanaryReport({
        version: '25.5.0',
        targetVersion: '25.4.0',
        startedAt: '2026-05-17T03:00:00.000Z',
        endedAt: `2026-05-17T03:00:${String(seconds).padStart(2, '0')}.000Z`,
        stages: [{ id: 'canary_5', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(expectedDuration);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 206 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50' as const, status: 'FAIL' as const, note: `batch206-note-${index}` },
  ] as const))(
    'generated batch206 first failed stage is copied from input %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.6.0',
        targetVersion: '25.5.0',
        startedAt: '2026-05-18T02:00:00.000Z',
        endedAt: '2026-05-18T02:02:00.000Z',
        stages: [stage],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual(stage);
      expect(report.firstFailedStage).not.toBe(stage);
      expect(report.stages[0]).not.toBe(stage);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 18, 3, index % 50, 0, index % 10)),
  ] as const))(
    'generated batch206 completed report preserves generatedAt %#',
    (generatedAt) => {
      const report = buildCanaryReport({
        version: '25.7.0',
        targetVersion: '25.6.0',
        startedAt: '2026-05-18T03:00:00.000Z',
        endedAt: '2026-05-18T03:01:00.000Z',
        generatedAt,
        stages: [{ id: 'canary_100', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.generatedAt).toBe(generatedAt.toISOString());
      expect(report.rollbackCommand).toContain('--database-strategy forward-fix');
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );
});

describe('canary report batch 207 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `   https://batch207-${index}.example.test/path   `,
  ] as const))(
    'generated batch207 baseUrl is trimmed for report and command %s',
    (baseUrl) => {
      const report = buildCanaryReport({
        version: '25.8.0',
        targetVersion: '25.7.0',
        baseUrl,
        startedAt: '2026-05-19T02:00:00.000Z',
        endedAt: '2026-05-19T02:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.baseUrl).toBe(baseUrl.trim());
      expect(report.rollbackCommand).toContain(`--base-url ${baseUrl.trim()}`);
      expect(report.rollbackCommand).not.toContain(baseUrl);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch207-invalid-start-${index}`,
    `2026-05-19T03:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch207 invalid start is preserved with zero duration %#',
    (startedAt, endedAt) => {
      const report = buildCanaryReport({
        version: '25.9.0',
        targetVersion: '25.8.0',
        startedAt,
        endedAt,
        stages: [{ id: 'canary_25', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.startedAt).toBe(startedAt);
      expect(report.endedAt).toBe(endedAt);
      expect(report.durationMinutes).toBe(0);
    },
  );
});

describe('canary report batch 208 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'canary_50' : 'full_rollout',
  ] as const))(
    'generated batch208 first failed stage wins over later failures %s',
    (firstId) => {
      const report = buildCanaryReport({
        version: '25.10.0',
        targetVersion: '25.9.0',
        startedAt: '2026-05-20T02:00:00.000Z',
        endedAt: '2026-05-20T02:05:00.000Z',
        stages: [
          { id: firstId, status: 'FAIL' },
          { id: 'full_rollout', status: 'FAIL', note: 'later' },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: firstId, status: 'FAIL' });
      expect(report.recommendation).toContain(firstId);
      expect(report.stages).toHaveLength(2);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch208-ended-${index}`,
  ] as const))(
    'generated batch208 invalid endedAt is preserved with zero duration %s',
    (endedAt) => {
      const report = buildCanaryReport({
        version: '25.11.0',
        targetVersion: '25.10.0',
        startedAt: '2026-05-20T03:00:00.000Z',
        endedAt,
        stages: [{ id: 'canary_100', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.endedAt).toBe(endedAt);
      expect(report.durationMinutes).toBe(0);
      expect(report.baseUrl).toBe('http://localhost:3000');
    },
  );
});

describe('canary report batch 209 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '   ',
    `25.12.${index}`,
    `25.11.${index}`,
  ] as const))(
    'generated batch209 whitespace baseUrl falls back to localhost %#',
    (baseUrl, version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        baseUrl,
        startedAt: '2026-05-21T03:00:00.000Z',
        endedAt: '2026-05-21T03:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.baseUrl).toBe('http://localhost:3000');
      expect(report.rollbackCommand).toContain('--base-url http://localhost:3000');
      expect(report.rollbackCommand).toContain(`--current-version ${version}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch209-pass-note-${index}`,
  ] as const))(
    'generated batch209 skipped note is retained in completed report %s',
    (note) => {
      const report = buildCanaryReport({
        version: '25.13.0',
        targetVersion: '25.12.0',
        startedAt: '2026-05-21T04:00:00.000Z',
        endedAt: '2026-05-21T04:01:00.000Z',
        stages: [{ id: 'preflight', status: 'SKIPPED', note }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0]).toEqual({ id: 'preflight', status: 'SKIPPED', note });
      expect(report.durationMinutes).toBe(1);
    },
  );
});

describe('canary report batch 210 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? '' : '   ',
  ] as const))(
    'generated batch210 blank target version is omitted from rollback command %#',
    (targetVersion) => {
      const report = buildCanaryReport({
        version: '25.14.0',
        targetVersion,
        startedAt: '2026-05-22T03:00:00.000Z',
        endedAt: '2026-05-22T03:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.targetVersion).toBe(targetVersion);
      expect(report.rollbackCommand).not.toContain('--target-version');
      expect(report.rollbackCommand).toContain('--current-version 25.14.0');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch210-failure-note-${index}`,
  ] as const))(
    'generated batch210 skipped stage before failure is not selected %s',
    (note) => {
      const report = buildCanaryReport({
        version: '25.15.0',
        targetVersion: '25.14.0',
        startedAt: '2026-05-22T04:00:00.000Z',
        endedAt: '2026-05-22T04:02:00.000Z',
        stages: [
          { id: 'preflight', status: 'SKIPPED', note: 'skip preflight' },
          { id: 'canary_25', status: 'FAIL', note },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: 'canary_25', status: 'FAIL', note });
      expect(report.recommendation).toContain('canary_25');
      expect(report.durationMinutes).toBe(2);
    },
  );
});

describe('canary report batch 211 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `   25.16.${index}   `,
    `   25.15.${index}   `,
  ] as const))(
    'generated batch211 rollback command trims version fields %#',
    (version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-05-23T03:00:00.000Z',
        endedAt: '2026-05-23T03:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.version).toBe(version);
      expect(report.targetVersion).toBe(targetVersion);
      expect(report.rollbackCommand).toContain(`--current-version ${version.trim()}`);
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion.trim()}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 89 : 90,
    index % 2 === 0 ? 1 : 2,
  ] as const))(
    'generated batch211 rounds near ninety second duration %#',
    (seconds, expectedDuration) => {
      const report = buildCanaryReport({
        version: '25.17.0',
        targetVersion: '25.16.0',
        startedAt: '2026-05-23T04:00:00.000Z',
        endedAt: `2026-05-23T04:01:${String(seconds - 60).padStart(2, '0')}.000Z`,
        stages: [{ id: 'canary_25', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(expectedDuration);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 212 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch212-${index}.example.test/root?stage=canary`,
  ] as const))(
    'generated batch212 completed report carries complex baseUrl into rollback command %s',
    (baseUrl) => {
      const report = buildCanaryReport({
        version: '25.18.0',
        targetVersion: '25.17.0',
        baseUrl,
        startedAt: '2026-05-24T03:00:00.000Z',
        endedAt: '2026-05-24T03:01:00.000Z',
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe(baseUrl);
      expect(report.rollbackCommand).toContain(`--base-url ${baseUrl}`);
      expect(report.firstFailedStage).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch212-skipped-note-${index}`,
  ] as const))(
    'generated batch212 all skipped stages complete with no failed stage %s',
    (note) => {
      const report = buildCanaryReport({
        version: '25.19.0',
        targetVersion: '25.18.0',
        startedAt: '2026-05-24T04:00:00.000Z',
        endedAt: '2026-05-24T04:00:29.000Z',
        stages: [
          { id: 'preflight', status: 'SKIPPED', note },
          { id: 'canary_5', status: 'SKIPPED' },
        ],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.durationMinutes).toBe(0);
      expect(report.stages[0]).toEqual({ id: 'preflight', status: 'SKIPPED', note });
    },
  );
});

describe('canary report batch 213 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? '' : '   ',
  ] as const))(
    'generated batch213 blank version uses current release in rollback command %#',
    (version) => {
      const report = buildCanaryReport({
        version,
        targetVersion: '25.19.0',
        startedAt: '2026-05-25T03:00:00.000Z',
        endedAt: '2026-05-25T03:01:00.000Z',
        stages: [{ id: 'canary_50', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.version).toBe(version);
      expect(report.rollbackCommand).toContain('--current-version current-release');
      expect(report.rollbackCommand).toContain('--target-version 25.19.0');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch213-stage-note-${index}`,
  ] as const))(
    'generated batch213 stage mutation after report does not change copied stages %s',
    (note) => {
      const stage = { id: 'canary_5' as const, status: 'PASS' as const, note };
      const report = buildCanaryReport({
        version: '25.20.0',
        targetVersion: '25.19.0',
        startedAt: '2026-05-25T04:00:00.000Z',
        endedAt: '2026-05-25T04:01:00.000Z',
        stages: [stage],
      });
      stage.note = 'mutated';

      expect(report.status).toBe('COMPLETED');
      expect(report.stages[0]).toEqual({ id: 'canary_5', status: 'PASS', note });
      expect(report.stages[0]).not.toBe(stage);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 214 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 26, 3, index % 50, 0, index % 10)),
  ] as const))(
    'generated batch214 rollback report preserves generatedAt %#',
    (generatedAt) => {
      const report = buildCanaryReport({
        version: '25.21.0',
        targetVersion: '25.20.0',
        startedAt: '2026-05-26T03:00:00.000Z',
        endedAt: '2026-05-26T03:01:00.000Z',
        generatedAt,
        stages: [{ id: 'full_rollout', status: 'FAIL' }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.generatedAt).toBe(generatedAt.toISOString());
      expect(report.firstFailedStage).toEqual({ id: 'full_rollout', status: 'FAIL' });
      expect(report.recommendation).toContain('full_rollout');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch214-note-${index}`,
  ] as const))(
    'generated batch214 stages array mutation after report is isolated %s',
    (note) => {
      const stages = [{ id: 'canary_5' as const, status: 'PASS' as const, note }];
      const report = buildCanaryReport({
        version: '25.22.0',
        targetVersion: '25.21.0',
        startedAt: '2026-05-26T04:00:00.000Z',
        endedAt: '2026-05-26T04:01:00.000Z',
        stages,
      });
      stages.push({ id: 'canary_25', status: 'FAIL', note: 'late mutation' });

      expect(report.status).toBe('COMPLETED');
      expect(report.stages).toHaveLength(1);
      expect(report.stages[0]).toEqual({ id: 'canary_5', status: 'PASS', note });
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 215 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `25.23.${index}`,
    `25.22.${index}`,
  ] as const))(
    'generated batch215 report keeps raw version fields while command uses same values %#',
    (version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-05-27T03:00:00.000Z',
        endedAt: '2026-05-27T03:02:00.000Z',
        stages: [{ id: 'canary_50', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.version).toBe(version);
      expect(report.targetVersion).toBe(targetVersion);
      expect(report.rollbackCommand).toContain(`--current-version ${version}`);
      expect(report.rollbackCommand).toContain(`--target-version ${targetVersion}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-27T04:${String(index % 50).padStart(2, '0')}:30.000Z`,
  ] as const))(
    'generated batch215 equal minute duration rounds to one minute %s',
    (endedAt) => {
      const report = buildCanaryReport({
        version: '25.24.0',
        targetVersion: '25.23.0',
        startedAt: endedAt.replace(':30.000Z', ':00.000Z'),
        endedAt,
        stages: [{ id: 'canary_25', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(1);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 216 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch216.example.com/${index}?stage=canary#rollout`,
  ] as const))(
    'generated batch216 trims baseUrl for report and rollback command %s',
    (baseUrl) => {
      const report = buildCanaryReport({
        version: '25.25.0',
        targetVersion: '25.24.0',
        baseUrl: `  ${baseUrl}  `,
        startedAt: '2026-05-28T03:00:00.000Z',
        endedAt: '2026-05-28T03:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe(baseUrl);
      expect(report.rollbackCommand).toContain(`--base-url ${baseUrl}`);
      expect(report.durationMinutes).toBe(1);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch216 note ${index}`,
  ] as const))(
    'generated batch216 failed stage note is copied into first failed stage %s',
    (note) => {
      const report = buildCanaryReport({
        version: '25.25.1',
        targetVersion: '25.24.1',
        startedAt: '2026-05-28T04:00:00.000Z',
        endedAt: '2026-05-28T04:02:00.000Z',
        stages: [
          { id: 'canary_5', status: 'SKIPPED' },
          { id: 'canary_25', status: 'FAIL', note },
        ],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: 'canary_25', status: 'FAIL', note });
      expect(report.recommendation).toContain('canary_25');
    },
  );
});

describe('canary report batch 217 matrices', () => {
  it.each(Array.from({ length: 80 }, () => [
    ' \n\t ',
  ] as const))(
    'generated batch217 blank whitespace baseUrl falls back to localhost %#',
    (baseUrl) => {
      const report = buildCanaryReport({
        version: '25.26.0',
        targetVersion: '25.25.0',
        baseUrl,
        startedAt: '2026-05-29T03:00:00.000Z',
        endedAt: '2026-05-29T03:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe('http://localhost:3000');
      expect(report.rollbackCommand).toContain('--base-url http://localhost:3000');
      expect(report.durationMinutes).toBe(1);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    { text: `batch217-note-${index}` },
  ] as const))(
    'generated batch217 failed stage note keeps shallow-copied object identity %#',
    (note) => {
      const report = buildCanaryReport({
        version: '25.26.1',
        targetVersion: '25.25.1',
        startedAt: '2026-05-29T04:00:00.000Z',
        endedAt: '2026-05-29T04:02:00.000Z',
        stages: [{ id: 'canary_50', status: 'FAIL', note: note as unknown as string }],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage?.note).toBe(note);
      expect(report.stages[0].note).toBe(note);
    },
  );
});

describe('canary report batch 218 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch218-note-${index}`,
  ] as const))(
    'generated batch218 original failed stage mutation does not change report copy %s',
    (note) => {
      const stage = { id: 'canary_25' as const, status: 'FAIL' as const, note };
      const report = buildCanaryReport({
        version: '25.27.0',
        targetVersion: '25.26.0',
        startedAt: '2026-05-30T03:00:00.000Z',
        endedAt: '2026-05-30T03:02:00.000Z',
        stages: [stage],
      });
      stage.status = 'PASS' as 'FAIL';
      stage.note = 'mutated';

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual({ id: 'canary_25', status: 'FAIL', note });
      expect(report.stages[0]).toEqual({ id: 'canary_25', status: 'FAIL', note });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-30T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch218 equal timestamps keep zero minute duration %s',
    (timestamp) => {
      const report = buildCanaryReport({
        version: '25.27.1',
        targetVersion: '25.26.1',
        startedAt: timestamp,
        endedAt: timestamp,
        stages: [{ id: 'canary_100', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(0);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 219 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `operator-${index}`,
  ] as const))(
    'generated batch219 stage extra enumerable field is shallow copied %s',
    (operator) => {
      const report = buildCanaryReport({
        version: '25.28.0',
        targetVersion: '25.27.0',
        startedAt: '2026-05-31T03:00:00.000Z',
        endedAt: '2026-05-31T03:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'PASS', operator }],
      });

      expect(report.status).toBe('COMPLETED');
      expect((report.stages[0] as unknown as { operator: string }).operator).toBe(operator);
      expect(report.firstFailedStage).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-31T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch219 eighty-nine second duration rounds to one minute %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 89000).toISOString();
      const report = buildCanaryReport({
        version: '25.28.1',
        targetVersion: '25.27.1',
        startedAt,
        endedAt,
        stages: [{ id: 'canary_100', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(1);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 220 matrices', () => {
  it.each(Array.from({ length: 80 }, () => [
    Object.create({ id: 'canary_5', status: 'FAIL', note: 'inherited' }),
  ] as const))(
    'generated batch220 inherited stage fields are not copied %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.29.0',
        targetVersion: '25.28.0',
        startedAt: '2026-06-01T03:00:00.000Z',
        endedAt: '2026-06-01T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0]).toEqual({});
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(Date.UTC(2026, 5, 1, 4, index % 50, 0, index % 10)),
  ] as const))(
    'generated batch220 generatedAt is independent of canary timestamps %#',
    (generatedAt) => {
      const report = buildCanaryReport({
        version: '25.29.1',
        targetVersion: '25.28.1',
        startedAt: '2026-06-01T04:00:00.000Z',
        endedAt: '2026-06-01T04:02:00.000Z',
        stages: [{ id: 'canary_100', status: 'PASS' }],
        generatedAt,
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.generatedAt).toBe(generatedAt.toISOString());
      expect(report.durationMinutes).toBe(2);
    },
  );
});

describe('canary report batch 221 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `25.30.${index}+build`,
    `25.29.${index}+target`,
  ] as const))(
    'generated batch221 build metadata versions remain raw in report %#',
    (version, targetVersion) => {
      const report = buildCanaryReport({
        version,
        targetVersion,
        startedAt: '2026-06-02T03:00:00.000Z',
        endedAt: '2026-06-02T03:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.version).toBe(version);
      expect(report.targetVersion).toBe(targetVersion);
      expect(report.rollbackCommand).toContain(`--current-version ${version}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-02T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch221 twenty-nine second duration rounds to zero minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 29000).toISOString();
      const report = buildCanaryReport({
        version: '25.30.1',
        targetVersion: '25.29.1',
        startedAt,
        endedAt,
        stages: [{ id: 'canary_100', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(0);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 222 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `\n https://batch222-${index}.example.com \t`,
    `https://batch222-${index}.example.com`,
  ] as const))(
    'generated batch222 multiline baseUrl is trimmed in report %#',
    (baseUrl, expectedBaseUrl) => {
      const report = buildCanaryReport({
        version: '25.31.0',
        targetVersion: '25.30.0',
        baseUrl,
        startedAt: '2026-06-03T03:00:00.000Z',
        endedAt: '2026-06-03T03:01:00.000Z',
        stages: [{ id: 'canary_5', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.baseUrl).toBe(expectedBaseUrl);
      expect(report.rollbackCommand).toContain(`--base-url ${expectedBaseUrl}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-03T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch222 ninety second duration rounds to two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 90000).toISOString();
      const report = buildCanaryReport({
        version: '25.31.1',
        targetVersion: '25.30.1',
        startedAt,
        endedAt,
        stages: [{ id: 'canary_100', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(2);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 223 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: 'FAIL' as const, note: `batch223-${index}` },
  ] as const))(
    'generated batch223 failed stage is copied before source mutation %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.32.0',
        targetVersion: '25.31.0',
        startedAt: '2026-06-04T03:00:00.000Z',
        endedAt: '2026-06-04T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });
      stage.status = 'PASS';

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toBe(report.stages[0]);
      expect(report.firstFailedStage?.status).toBe('FAIL');
      expect(report.stages[0].note).toBe(stage.note);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-04T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch223 thirty second duration rounds to one minute %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 30000).toISOString();
      const report = buildCanaryReport({
        version: '25.32.1',
        targetVersion: '25.31.1',
        startedAt,
        endedAt,
        stages: [{ id: 'canary_100', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(1);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 224 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: 'fail' as unknown as 'FAIL', note: `batch224-${index}` },
  ] as const))(
    'generated batch224 lowercase failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.33.0',
        targetVersion: '25.32.0',
        startedAt: '2026-06-05T03:00:00.000Z',
        endedAt: '2026-06-05T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe('fail');
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-05T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch224 one hundred nineteen second duration rounds to two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 119000).toISOString();
      const report = buildCanaryReport({
        version: '25.33.1',
        targetVersion: '25.32.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(2);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 225 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new String('FAIL') as unknown as 'FAIL', note: `batch225-${index}` },
  ] as const))(
    'generated batch225 String object failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.34.0',
        targetVersion: '25.33.0',
        startedAt: '2026-06-06T03:00:00.000Z',
        endedAt: '2026-06-06T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-06T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch225 one hundred forty-nine second duration rounds to two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 149000).toISOString();
      const report = buildCanaryReport({
        version: '25.34.1',
        targetVersion: '25.33.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(2);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 226 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: Symbol(`FAIL-${index}`) as unknown as 'FAIL', note: `batch226-${index}` },
  ] as const))(
    'generated batch226 Symbol failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.35.0',
        targetVersion: '25.34.0',
        startedAt: '2026-06-07T03:00:00.000Z',
        endedAt: '2026-06-07T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-07T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch226 one hundred fifty second duration rounds to three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 150000).toISOString();
      const report = buildCanaryReport({
        version: '25.35.1',
        targetVersion: '25.34.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(3);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 227 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch227-${index}`,
    `changed-${index}`,
  ] as const))(
    'generated batch227 firstFailedStage shares copied stage reference %#',
    (note, changedNote) => {
      const report = buildCanaryReport({
        version: '25.36.0',
        targetVersion: '25.35.0',
        startedAt: '2026-06-08T03:00:00.000Z',
        endedAt: '2026-06-08T03:01:00.000Z',
        stages: [{ id: 'canary_25', status: 'FAIL', note }],
      });
      report.stages[0].note = changedNote;

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toBe(report.stages[0]);
      expect(report.firstFailedStage?.note).toBe(changedNote);
      expect(report.recommendation).toContain('canary_25');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-08T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch227 one hundred fifty-one second duration rounds to three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 151000).toISOString();
      const report = buildCanaryReport({
        version: '25.36.1',
        targetVersion: '25.35.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(3);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 228 matrices', () => {
  it.each(Array.from({ length: 80 }, () => [
    Object.create({ id: 'canary_25', status: 'FAIL', note: 'inherited-batch228' }),
  ] as const))(
    'generated batch228 inherited failed stage fields are not copied %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.37.0',
        targetVersion: '25.36.0',
        startedAt: '2026-06-09T03:00:00.000Z',
        endedAt: '2026-06-09T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0]).toEqual({});
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-09T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch228 two hundred nine second duration rounds to three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 209000).toISOString();
      const report = buildCanaryReport({
        version: '25.37.1',
        targetVersion: '25.36.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(3);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 229 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    Object.assign(Object.create(null), {
      id: 'canary_50',
      status: 'FAIL',
      note: `batch229-${index}`,
    }),
  ] as const))(
    'generated batch229 null-prototype failed stage is copied and triggers rollback %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.38.0',
        targetVersion: '25.37.0',
        startedAt: '2026-06-10T03:00:00.000Z',
        endedAt: '2026-06-10T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toEqual(stage);
      expect(report.firstFailedStage).toBe(report.stages[0]);
      expect(report.recommendation).toContain('canary_50');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-10T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch229 two hundred ten second duration rounds to four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 210000).toISOString();
      const report = buildCanaryReport({
        version: '25.38.1',
        targetVersion: '25.37.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(4);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 230 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: undefined, status: 'FAIL' as const, note: `batch230-${index}` },
  ] as const))(
    'generated batch230 failed stage with undefined id still triggers rollback %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.39.0',
        targetVersion: '25.38.0',
        startedAt: '2026-06-11T03:00:00.000Z',
        endedAt: '2026-06-11T03:01:00.000Z',
        stages: [stage as unknown as CanaryStageResult],
      });

      expect(report.status).toBe('ROLLBACK_RECOMMENDED');
      expect(report.firstFailedStage).toBe(report.stages[0]);
      expect(report.firstFailedStage?.id).toBeUndefined();
      expect(report.recommendation).toContain('undefined');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-11T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch230 two hundred seventy second duration rounds to five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 270000).toISOString();
      const report = buildCanaryReport({
        version: '25.39.1',
        targetVersion: '25.38.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(5);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 231 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: true as unknown as 'FAIL', note: `batch231-${index}` },
  ] as const))(
    'generated batch231 boolean failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.40.0',
        targetVersion: '25.39.0',
        startedAt: '2026-06-12T03:00:00.000Z',
        endedAt: '2026-06-12T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(true);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-12T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch231 three hundred twenty-nine second duration rounds to five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 329000).toISOString();
      const report = buildCanaryReport({
        version: '25.40.1',
        targetVersion: '25.39.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(5);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 232 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: 'FAIL ' as unknown as 'FAIL', note: `batch232-${index}` },
  ] as const))(
    'generated batch232 padded failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.41.0',
        targetVersion: '25.40.0',
        startedAt: '2026-06-13T03:00:00.000Z',
        endedAt: '2026-06-13T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe('FAIL ');
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-13T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch232 three hundred thirty second duration rounds to six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 330000).toISOString();
      const report = buildCanaryReport({
        version: '25.41.1',
        targetVersion: '25.40.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(6);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 233 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: 0 as unknown as 'FAIL', note: `batch233-${index}` },
  ] as const))(
    'generated batch233 numeric failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.42.0',
        targetVersion: '25.41.0',
        startedAt: '2026-06-14T03:00:00.000Z',
        endedAt: '2026-06-14T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(0);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-14T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch233 three hundred eighty-nine second duration rounds to six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 389000).toISOString();
      const report = buildCanaryReport({
        version: '25.42.1',
        targetVersion: '25.41.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(6);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 234 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: 'FAIL\n' as unknown as 'FAIL', note: `batch234-${index}` },
  ] as const))(
    'generated batch234 newline failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.43.0',
        targetVersion: '25.42.0',
        startedAt: '2026-06-15T03:00:00.000Z',
        endedAt: '2026-06-15T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe('FAIL\n');
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-15T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch234 three hundred ninety second duration rounds to seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 390000).toISOString();
      const report = buildCanaryReport({
        version: '25.43.1',
        targetVersion: '25.42.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(7);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 235 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Boolean(true) as unknown as 'FAIL', note: `batch235-${index}` },
  ] as const))(
    'generated batch235 Boolean object failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.44.0',
        targetVersion: '25.43.0',
        startedAt: '2026-06-16T03:00:00.000Z',
        endedAt: '2026-06-16T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-16T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch235 four hundred forty-nine second duration rounds to seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 449000).toISOString();
      const report = buildCanaryReport({
        version: '25.44.1',
        targetVersion: '25.43.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(7);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 236 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new Number(index) as unknown as 'FAIL', note: `batch236-${index}` },
  ] as const))(
    'generated batch236 Number object failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.45.0',
        targetVersion: '25.44.0',
        startedAt: '2026-06-17T03:00:00.000Z',
        endedAt: '2026-06-17T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-17T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch236 four hundred fifty second duration rounds to eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 450000).toISOString();
      const report = buildCanaryReport({
        version: '25.45.1',
        targetVersion: '25.44.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(8);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 237 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new String('FAIL') as unknown as 'FAIL', note: `batch237-${index}` },
  ] as const))(
    'generated batch237 String object failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.46.0',
        targetVersion: '25.45.0',
        startedAt: '2026-06-18T03:00:00.000Z',
        endedAt: '2026-06-18T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-18T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch237 five hundred ten second duration rounds to nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 510000).toISOString();
      const report = buildCanaryReport({
        version: '25.46.1',
        targetVersion: '25.45.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(9);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 238 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new String('PASS') as unknown as 'FAIL', note: `batch238-${index}` },
  ] as const))(
    'generated batch238 String object pass-like status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.47.0',
        targetVersion: '25.46.0',
        startedAt: '2026-06-19T03:00:00.000Z',
        endedAt: '2026-06-19T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-19T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch238 five hundred sixty-nine second duration rounds to nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 569000).toISOString();
      const report = buildCanaryReport({
        version: '25.47.1',
        targetVersion: '25.46.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(9);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 239 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: Symbol(`FAIL-${index}`) as unknown as 'FAIL', note: `batch239-${index}` },
  ] as const))(
    'generated batch239 Symbol failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.48.0',
        targetVersion: '25.47.0',
        startedAt: '2026-06-20T03:00:00.000Z',
        endedAt: '2026-06-20T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-20T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch239 five hundred seventy second duration rounds to ten minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 570000).toISOString();
      const report = buildCanaryReport({
        version: '25.48.1',
        targetVersion: '25.47.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(10);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 240 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new Boolean(false) as unknown as 'FAIL', note: `batch240-${index}` },
  ] as const))(
    'generated batch240 Boolean false object failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.49.0',
        targetVersion: '25.48.0',
        startedAt: '2026-06-21T03:00:00.000Z',
        endedAt: '2026-06-21T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-21T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch240 six hundred twenty-nine second duration rounds to ten minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 629000).toISOString();
      const report = buildCanaryReport({
        version: '25.49.1',
        targetVersion: '25.48.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(10);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 241 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: [] as unknown as 'FAIL', note: `batch241-${index}` },
  ] as const))(
    'generated batch241 Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.50.0',
        targetVersion: '25.49.0',
        startedAt: '2026-06-22T03:00:00.000Z',
        endedAt: '2026-06-22T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-22T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch241 six hundred thirty second duration rounds to eleven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 630000).toISOString();
      const report = buildCanaryReport({
        version: '25.50.1',
        targetVersion: '25.49.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(11);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 242 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Date(`2026-06-23T03:${String(index % 50).padStart(2, '0')}:00.000Z`) as unknown as 'FAIL', note: `batch242-${index}` },
  ] as const))(
    'generated batch242 Date failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.51.0',
        targetVersion: '25.50.0',
        startedAt: '2026-06-23T03:00:00.000Z',
        endedAt: '2026-06-23T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-23T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch242 six hundred eighty-nine second duration rounds to eleven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 689000).toISOString();
      const report = buildCanaryReport({
        version: '25.51.1',
        targetVersion: '25.50.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(11);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 243 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new Map([[index, 'FAIL']]) as unknown as 'FAIL', note: `batch243-${index}` },
  ] as const))(
    'generated batch243 Map failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.52.0',
        targetVersion: '25.51.0',
        startedAt: '2026-06-24T03:00:00.000Z',
        endedAt: '2026-06-24T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-24T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch243 six hundred ninety second duration rounds to twelve minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 690000).toISOString();
      const report = buildCanaryReport({
        version: '25.52.1',
        targetVersion: '25.51.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(12);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 244 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Set([`FAIL-${index}`]) as unknown as 'FAIL', note: `batch244-${index}` },
  ] as const))(
    'generated batch244 Set failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.53.0',
        targetVersion: '25.52.0',
        startedAt: '2026-06-25T03:00:00.000Z',
        endedAt: '2026-06-25T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-25T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch244 seven hundred forty-nine second duration rounds to twelve minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 749000).toISOString();
      const report = buildCanaryReport({
        version: '25.53.1',
        targetVersion: '25.52.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(12);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 245 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Uint8Array([index % 255]) as unknown as 'FAIL', note: `batch245-${index}` },
  ] as const))(
    'generated batch245 Uint8Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.54.0',
        targetVersion: '25.53.0',
        startedAt: '2026-06-26T03:00:00.000Z',
        endedAt: '2026-06-26T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-26T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch245 seven hundred fifty second duration rounds to thirteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 750000).toISOString();
      const report = buildCanaryReport({
        version: '25.54.1',
        targetVersion: '25.53.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(13);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 246 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: Promise.resolve(`FAIL-${index}`) as unknown as 'FAIL', note: `batch246-${index}` },
  ] as const))(
    'generated batch246 Promise failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.55.0',
        targetVersion: '25.54.0',
        startedAt: '2026-06-27T03:00:00.000Z',
        endedAt: '2026-06-27T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-27T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch246 seven hundred fifty-one second duration rounds to thirteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 751000).toISOString();
      const report = buildCanaryReport({
        version: '25.55.1',
        targetVersion: '25.54.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(13);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 247 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new WeakMap<object, string>([[{}, `FAIL-${index}`]]) as unknown as 'FAIL', note: `batch247-${index}` },
  ] as const))(
    'generated batch247 WeakMap failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.56.0',
        targetVersion: '25.55.0',
        startedAt: '2026-06-28T03:00:00.000Z',
        endedAt: '2026-06-28T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-28T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch247 eight hundred nine second duration rounds to thirteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 809000).toISOString();
      const report = buildCanaryReport({
        version: '25.56.1',
        targetVersion: '25.55.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(13);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 248 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new URL(`https://batch248.example/fail/${index}`) as unknown as 'FAIL', note: `batch248-${index}` },
  ] as const))(
    'generated batch248 URL failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.57.0',
        targetVersion: '25.56.0',
        startedAt: '2026-06-29T03:00:00.000Z',
        endedAt: '2026-06-29T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-29T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch248 eight hundred ten second duration rounds to fourteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 810000).toISOString();
      const report = buildCanaryReport({
        version: '25.57.1',
        targetVersion: '25.56.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(14);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 249 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new URLSearchParams([['status', `FAIL-${index}`]]) as unknown as 'FAIL', note: `batch249-${index}` },
  ] as const))(
    'generated batch249 URLSearchParams failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.58.0',
        targetVersion: '25.57.0',
        startedAt: '2026-06-30T03:00:00.000Z',
        endedAt: '2026-06-30T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-30T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch249 eight hundred sixty-nine second duration rounds to fourteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 869000).toISOString();
      const report = buildCanaryReport({
        version: '25.58.1',
        targetVersion: '25.57.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(14);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 250 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new Int16Array([index]) as unknown as 'FAIL', note: `batch250-${index}` },
  ] as const))(
    'generated batch250 Int16Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.59.0',
        targetVersion: '25.58.0',
        startedAt: '2026-07-01T03:00:00.000Z',
        endedAt: '2026-07-01T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-01T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch250 eight hundred seventy second duration rounds to fifteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 870000).toISOString();
      const report = buildCanaryReport({
        version: '25.59.1',
        targetVersion: '25.58.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(15);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 251 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Int32Array([index]) as unknown as 'FAIL', note: `batch251-${index}` },
  ] as const))(
    'generated batch251 Int32Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.60.0',
        targetVersion: '25.59.0',
        startedAt: '2026-07-02T03:00:00.000Z',
        endedAt: '2026-07-02T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-02T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch251 nine hundred twenty-nine second duration rounds to fifteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 929000).toISOString();
      const report = buildCanaryReport({
        version: '25.60.1',
        targetVersion: '25.59.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(15);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 252 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new Uint8ClampedArray([index % 255]) as unknown as 'FAIL', note: `batch252-${index}` },
  ] as const))(
    'generated batch252 Uint8ClampedArray failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.61.0',
        targetVersion: '25.60.0',
        startedAt: '2026-07-03T03:00:00.000Z',
        endedAt: '2026-07-03T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-03T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch252 nine hundred thirty second duration rounds to sixteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 930000).toISOString();
      const report = buildCanaryReport({
        version: '25.61.1',
        targetVersion: '25.60.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(16);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 253 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new Float32Array([index + 0.5]) as unknown as 'FAIL', note: `batch253-${index}` },
  ] as const))(
    'generated batch253 Float32Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.62.0',
        targetVersion: '25.61.0',
        startedAt: '2026-07-04T03:00:00.000Z',
        endedAt: '2026-07-04T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-04T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch253 nine hundred eighty-nine second duration rounds to sixteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 989000).toISOString();
      const report = buildCanaryReport({
        version: '25.62.1',
        targetVersion: '25.61.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(16);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 254 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Float64Array([index + 0.75]) as unknown as 'FAIL', note: `batch254-${index}` },
  ] as const))(
    'generated batch254 Float64Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.63.0',
        targetVersion: '25.62.0',
        startedAt: '2026-07-05T03:00:00.000Z',
        endedAt: '2026-07-05T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-05T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch254 nine hundred ninety second duration rounds to seventeen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 990000).toISOString();
      const report = buildCanaryReport({
        version: '25.63.1',
        targetVersion: '25.62.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(17);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 255 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new Int8Array([index % 127]) as unknown as 'FAIL', note: `batch255-${index}` },
  ] as const))(
    'generated batch255 Int8Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.64.0',
        targetVersion: '25.63.0',
        startedAt: '2026-07-06T03:00:00.000Z',
        endedAt: '2026-07-06T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-06T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch255 one thousand fifty second duration rounds to eighteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1050000).toISOString();
      const report = buildCanaryReport({
        version: '25.64.1',
        targetVersion: '25.63.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(18);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 256 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new Uint16Array([index]) as unknown as 'FAIL', note: `batch256-${index}` },
  ] as const))(
    'generated batch256 Uint16Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.65.0',
        targetVersion: '25.64.0',
        startedAt: '2026-07-07T03:00:00.000Z',
        endedAt: '2026-07-07T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-07T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch256 one thousand one hundred ten second duration rounds to nineteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1110000).toISOString();
      const report = buildCanaryReport({
        version: '25.65.1',
        targetVersion: '25.64.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(19);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 257 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Uint32Array([index]) as unknown as 'FAIL', note: `batch257-${index}` },
  ] as const))(
    'generated batch257 Uint32Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.66.0',
        targetVersion: '25.65.0',
        startedAt: '2026-07-08T03:00:00.000Z',
        endedAt: '2026-07-08T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-08T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch257 one thousand one hundred sixty-nine second duration rounds to nineteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1169000).toISOString();
      const report = buildCanaryReport({
        version: '25.66.1',
        targetVersion: '25.65.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(19);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 258 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new DataView(new ArrayBuffer(index % 4 + 1)) as unknown as 'FAIL', note: `batch258-${index}` },
  ] as const))(
    'generated batch258 DataView failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.67.0',
        targetVersion: '25.66.0',
        startedAt: '2026-07-09T03:00:00.000Z',
        endedAt: '2026-07-09T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-09T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch258 one thousand one hundred seventy second duration rounds to twenty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1170000).toISOString();
      const report = buildCanaryReport({
        version: '25.67.1',
        targetVersion: '25.66.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(20);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 259 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new BigInt64Array([BigInt(index + 1)]) as unknown as 'FAIL', note: `batch259-${index}` },
  ] as const))(
    'generated batch259 BigInt64Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.68.0',
        targetVersion: '25.67.0',
        startedAt: '2026-07-10T03:00:00.000Z',
        endedAt: '2026-07-10T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-10T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch259 one thousand two hundred thirty second duration rounds to twenty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1230000).toISOString();
      const report = buildCanaryReport({
        version: '25.68.1',
        targetVersion: '25.67.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(21);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 260 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new BigUint64Array([BigInt(index + 2)]) as unknown as 'FAIL', note: `batch260-${index}` },
  ] as const))(
    'generated batch260 BigUint64Array failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.69.0',
        targetVersion: '25.68.0',
        startedAt: '2026-07-11T03:00:00.000Z',
        endedAt: '2026-07-11T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-11T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch260 one thousand two hundred ninety second duration rounds to twenty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1290000).toISOString();
      const report = buildCanaryReport({
        version: '25.69.1',
        targetVersion: '25.68.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(22);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 261 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new Map([['status', 'FAIL']]) as unknown as 'FAIL', note: `batch261-${index}` },
  ] as const))(
    'generated batch261 Map failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.70.0',
        targetVersion: '25.69.0',
        startedAt: '2026-07-12T03:00:00.000Z',
        endedAt: '2026-07-12T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-12T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch261 one thousand three hundred fifty second duration rounds to twenty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1350000).toISOString();
      const report = buildCanaryReport({
        version: '25.70.1',
        targetVersion: '25.69.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(23);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 262 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new Set(['FAIL', `batch262-${index}`]) as unknown as 'FAIL', note: `batch262-${index}` },
  ] as const))(
    'generated batch262 Set failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.71.0',
        targetVersion: '25.70.0',
        startedAt: '2026-07-13T03:00:00.000Z',
        endedAt: '2026-07-13T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-13T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch262 one thousand four hundred ten second duration rounds to twenty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1410000).toISOString();
      const report = buildCanaryReport({
        version: '25.71.1',
        targetVersion: '25.70.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(24);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 263 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Date(`2026-07-14T03:${String(index % 50).padStart(2, '0')}:00.000Z`) as unknown as 'FAIL', note: `batch263-${index}` },
  ] as const))(
    'generated batch263 Date failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.72.0',
        targetVersion: '25.71.0',
        startedAt: '2026-07-14T03:00:00.000Z',
        endedAt: '2026-07-14T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-14T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch263 one thousand four hundred seventy second duration rounds to twenty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1470000).toISOString();
      const report = buildCanaryReport({
        version: '25.72.1',
        targetVersion: '25.71.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(25);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 264 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new URLSearchParams({ status: 'FAIL', batch: `264-${index}` }) as unknown as 'FAIL', note: `batch264-${index}` },
  ] as const))(
    'generated batch264 URLSearchParams failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.73.0',
        targetVersion: '25.72.0',
        startedAt: '2026-07-15T03:00:00.000Z',
        endedAt: '2026-07-15T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-15T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch264 one thousand five hundred thirty second duration rounds to twenty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1530000).toISOString();
      const report = buildCanaryReport({
        version: '25.73.1',
        targetVersion: '25.72.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(26);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 265 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new WeakMap<object, object>([[{ batch: index }, { status: 'FAIL' }]]) as unknown as 'FAIL', note: `batch265-${index}` },
  ] as const))(
    'generated batch265 WeakMap failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.74.0',
        targetVersion: '25.73.0',
        startedAt: '2026-07-16T03:00:00.000Z',
        endedAt: '2026-07-16T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-16T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch265 one thousand five hundred ninety second duration rounds to twenty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1590000).toISOString();
      const report = buildCanaryReport({
        version: '25.74.1',
        targetVersion: '25.73.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(27);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 266 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: Promise.resolve(`FAIL-${index}`) as unknown as 'FAIL', note: `batch266-${index}` },
  ] as const))(
    'generated batch266 Promise failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.75.0',
        targetVersion: '25.74.0',
        startedAt: '2026-07-17T03:00:00.000Z',
        endedAt: '2026-07-17T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-17T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch266 one thousand six hundred fifty second duration rounds to twenty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1650000).toISOString();
      const report = buildCanaryReport({
        version: '25.75.1',
        targetVersion: '25.74.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(28);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 267 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'health_check', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch267-${index}` },
  ] as const))(
    'generated batch267 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.76.0',
        targetVersion: '25.75.0',
        startedAt: '2026-07-18T03:00:00.000Z',
        endedAt: '2026-07-18T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-18T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch267 one thousand seven hundred ten second duration rounds to twenty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1710000).toISOString();
      const report = buildCanaryReport({
        version: '25.76.1',
        targetVersion: '25.75.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(29);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 268 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch268-${index}` },
  ] as const))(
    'generated batch268 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.77.0',
        targetVersion: '25.76.0',
        startedAt: '2026-07-19T03:00:00.000Z',
        endedAt: '2026-07-19T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-19T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch268 one thousand seven hundred seventy second duration rounds to thirty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1770000).toISOString();
      const report = buildCanaryReport({
        version: '25.77.1',
        targetVersion: '25.76.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(30);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 269 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch269-${index}` },
  ] as const))(
    'generated batch269 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.78.0',
        targetVersion: '25.77.0',
        startedAt: '2026-07-20T03:00:00.000Z',
        endedAt: '2026-07-20T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-20T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch269 one thousand eight hundred thirty second duration rounds to thirty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1830000).toISOString();
      const report = buildCanaryReport({
        version: '25.78.1',
        targetVersion: '25.77.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(31);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 270 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch270-${index}` },
  ] as const))(
    'generated batch270 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.79.0',
        targetVersion: '25.78.0',
        startedAt: '2026-07-21T03:00:00.000Z',
        endedAt: '2026-07-21T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-21T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch270 one thousand eight hundred ninety second duration rounds to thirty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1890000).toISOString();
      const report = buildCanaryReport({
        version: '25.79.1',
        targetVersion: '25.78.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(32);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 271 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch271-${index}` },
  ] as const))(
    'generated batch271 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.80.0',
        targetVersion: '25.79.0',
        startedAt: '2026-07-22T03:00:00.000Z',
        endedAt: '2026-07-22T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-22T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch271 one thousand nine hundred fifty second duration rounds to thirty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 1950000).toISOString();
      const report = buildCanaryReport({
        version: '25.80.1',
        targetVersion: '25.79.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(33);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 272 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'health_check', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch272-${index}` },
  ] as const))(
    'generated batch272 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.81.0',
        targetVersion: '25.80.0',
        startedAt: '2026-07-23T03:00:00.000Z',
        endedAt: '2026-07-23T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-23T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch272 two thousand ten second duration rounds to thirty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2010000).toISOString();
      const report = buildCanaryReport({
        version: '25.81.1',
        targetVersion: '25.80.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(34);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 273 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch273-${index}` },
  ] as const))(
    'generated batch273 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.82.0',
        targetVersion: '25.81.0',
        startedAt: '2026-07-24T03:00:00.000Z',
        endedAt: '2026-07-24T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-24T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch273 two thousand seventy second duration rounds to thirty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2070000).toISOString();
      const report = buildCanaryReport({
        version: '25.82.1',
        targetVersion: '25.81.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(35);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 274 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch274-${index}` },
  ] as const))(
    'generated batch274 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.83.0',
        targetVersion: '25.82.0',
        startedAt: '2026-07-25T03:00:00.000Z',
        endedAt: '2026-07-25T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-25T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch274 two thousand one hundred thirty second duration rounds to thirty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2130000).toISOString();
      const report = buildCanaryReport({
        version: '25.83.1',
        targetVersion: '25.82.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(36);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 275 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch275-${index}` },
  ] as const))(
    'generated batch275 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.84.0',
        targetVersion: '25.83.0',
        startedAt: '2026-07-26T03:00:00.000Z',
        endedAt: '2026-07-26T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-26T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch275 two thousand one hundred ninety second duration rounds to thirty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2190000).toISOString();
      const report = buildCanaryReport({
        version: '25.84.1',
        targetVersion: '25.83.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(37);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 276 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch276-${index}` },
  ] as const))(
    'generated batch276 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.85.0',
        targetVersion: '25.84.0',
        startedAt: '2026-07-27T03:00:00.000Z',
        endedAt: '2026-07-27T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-27T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch276 two thousand two hundred fifty second duration rounds to thirty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2250000).toISOString();
      const report = buildCanaryReport({
        version: '25.85.1',
        targetVersion: '25.84.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(38);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 277 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'health_check', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch277-${index}` },
  ] as const))(
    'generated batch277 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.86.0',
        targetVersion: '25.85.0',
        startedAt: '2026-07-28T03:00:00.000Z',
        endedAt: '2026-07-28T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-28T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch277 two thousand three hundred ten second duration rounds to thirty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2310000).toISOString();
      const report = buildCanaryReport({
        version: '25.86.1',
        targetVersion: '25.85.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(39);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 278 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch278-${index}` },
  ] as const))(
    'generated batch278 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.87.0',
        targetVersion: '25.86.0',
        startedAt: '2026-07-29T03:00:00.000Z',
        endedAt: '2026-07-29T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-29T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch278 two thousand three hundred seventy second duration rounds to forty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2370000).toISOString();
      const report = buildCanaryReport({
        version: '25.87.1',
        targetVersion: '25.86.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(40);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 279 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch279-${index}` },
  ] as const))(
    'generated batch279 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.88.0',
        targetVersion: '25.87.0',
        startedAt: '2026-07-30T03:00:00.000Z',
        endedAt: '2026-07-30T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-30T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch279 two thousand four hundred thirty second duration rounds to forty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2430000).toISOString();
      const report = buildCanaryReport({
        version: '25.88.1',
        targetVersion: '25.87.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(41);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 280 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch280-${index}` },
  ] as const))(
    'generated batch280 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.89.0',
        targetVersion: '25.88.0',
        startedAt: '2026-07-31T03:00:00.000Z',
        endedAt: '2026-07-31T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-31T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch280 two thousand four hundred ninety second duration rounds to forty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2490000).toISOString();
      const report = buildCanaryReport({
        version: '25.89.1',
        targetVersion: '25.88.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(42);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 281 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch281-${index}` },
  ] as const))(
    'generated batch281 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.90.0',
        targetVersion: '25.89.0',
        startedAt: '2026-08-01T03:00:00.000Z',
        endedAt: '2026-08-01T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-01T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch281 two thousand five hundred fifty second duration rounds to forty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2550000).toISOString();
      const report = buildCanaryReport({
        version: '25.90.1',
        targetVersion: '25.89.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(43);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 282 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch282-${index}` },
  ] as const))(
    'generated batch282 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.91.0',
        targetVersion: '25.90.0',
        startedAt: '2026-08-02T03:00:00.000Z',
        endedAt: '2026-08-02T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-02T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch282 two thousand six hundred ten second duration rounds to forty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2610000).toISOString();
      const report = buildCanaryReport({
        version: '25.91.1',
        targetVersion: '25.90.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(44);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 283 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch283-${index}` },
  ] as const))(
    'generated batch283 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.92.0',
        targetVersion: '25.91.0',
        startedAt: '2026-08-03T03:00:00.000Z',
        endedAt: '2026-08-03T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-03T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch283 two thousand six hundred seventy second duration rounds to forty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2670000).toISOString();
      const report = buildCanaryReport({
        version: '25.92.1',
        targetVersion: '25.91.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(45);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 284 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch284-${index}` },
  ] as const))(
    'generated batch284 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.93.0',
        targetVersion: '25.92.0',
        startedAt: '2026-08-04T03:00:00.000Z',
        endedAt: '2026-08-04T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-04T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch284 two thousand seven hundred thirty second duration rounds to forty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2730000).toISOString();
      const report = buildCanaryReport({
        version: '25.93.1',
        targetVersion: '25.92.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(46);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 285 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch285-${index}` },
  ] as const))(
    'generated batch285 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.94.0',
        targetVersion: '25.93.0',
        startedAt: '2026-08-05T03:00:00.000Z',
        endedAt: '2026-08-05T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-05T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch285 two thousand seven hundred ninety second duration rounds to forty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2790000).toISOString();
      const report = buildCanaryReport({
        version: '25.94.1',
        targetVersion: '25.93.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(47);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 286 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch286-${index}` },
  ] as const))(
    'generated batch286 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.95.0',
        targetVersion: '25.94.0',
        startedAt: '2026-08-06T03:00:00.000Z',
        endedAt: '2026-08-06T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-06T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch286 two thousand eight hundred fifty second duration rounds to forty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2850000).toISOString();
      const report = buildCanaryReport({
        version: '25.95.1',
        targetVersion: '25.94.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(48);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 287 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch287-${index}` },
  ] as const))(
    'generated batch287 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.96.0',
        targetVersion: '25.95.0',
        startedAt: '2026-08-07T03:00:00.000Z',
        endedAt: '2026-08-07T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-07T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch287 two thousand nine hundred ten second duration rounds to forty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2910000).toISOString();
      const report = buildCanaryReport({
        version: '25.96.1',
        targetVersion: '25.95.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(49);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 288 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch288-${index}` },
  ] as const))(
    'generated batch288 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.97.0',
        targetVersion: '25.96.0',
        startedAt: '2026-08-08T03:00:00.000Z',
        endedAt: '2026-08-08T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-08T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch288 two thousand nine hundred seventy second duration rounds to fifty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 2970000).toISOString();
      const report = buildCanaryReport({
        version: '25.97.1',
        targetVersion: '25.96.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(50);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 289 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch289-${index}` },
  ] as const))(
    'generated batch289 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.98.0',
        targetVersion: '25.97.0',
        startedAt: '2026-08-09T03:00:00.000Z',
        endedAt: '2026-08-09T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-09T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch289 three thousand thirty second duration rounds to fifty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3030000).toISOString();
      const report = buildCanaryReport({
        version: '25.98.1',
        targetVersion: '25.97.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(51);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 290 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch290-${index}` },
  ] as const))(
    'generated batch290 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.99.0',
        targetVersion: '25.98.0',
        startedAt: '2026-08-10T03:00:00.000Z',
        endedAt: '2026-08-10T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-10T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch290 three thousand ninety second duration rounds to fifty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3090000).toISOString();
      const report = buildCanaryReport({
        version: '25.99.1',
        targetVersion: '25.98.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(52);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 291 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch291-${index}` },
  ] as const))(
    'generated batch291 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.100.0',
        targetVersion: '25.99.0',
        startedAt: '2026-08-11T03:00:00.000Z',
        endedAt: '2026-08-11T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-11T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch291 three thousand one hundred fifty second duration rounds to fifty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3150000).toISOString();
      const report = buildCanaryReport({
        version: '25.100.1',
        targetVersion: '25.99.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(53);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 292 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch292-${index}` },
  ] as const))(
    'generated batch292 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.101.0',
        targetVersion: '25.100.0',
        startedAt: '2026-08-12T03:00:00.000Z',
        endedAt: '2026-08-12T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-12T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch292 three thousand two hundred ten second duration rounds to fifty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3210000).toISOString();
      const report = buildCanaryReport({
        version: '25.101.1',
        targetVersion: '25.100.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(54);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 293 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch293-${index}` },
  ] as const))(
    'generated batch293 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.102.0',
        targetVersion: '25.101.0',
        startedAt: '2026-08-13T03:00:00.000Z',
        endedAt: '2026-08-13T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-13T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch293 three thousand two hundred seventy second duration rounds to fifty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3270000).toISOString();
      const report = buildCanaryReport({
        version: '25.102.1',
        targetVersion: '25.101.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(55);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 294 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch294-${index}` },
  ] as const))(
    'generated batch294 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.103.0',
        targetVersion: '25.102.0',
        startedAt: '2026-08-14T03:00:00.000Z',
        endedAt: '2026-08-14T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-14T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch294 three thousand three hundred thirty second duration rounds to fifty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3330000).toISOString();
      const report = buildCanaryReport({
        version: '25.103.1',
        targetVersion: '25.102.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(56);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 295 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch295-${index}` },
  ] as const))(
    'generated batch295 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.104.0',
        targetVersion: '25.103.0',
        startedAt: '2026-08-15T03:00:00.000Z',
        endedAt: '2026-08-15T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-15T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch295 three thousand three hundred ninety second duration rounds to fifty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3390000).toISOString();
      const report = buildCanaryReport({
        version: '25.104.1',
        targetVersion: '25.103.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(57);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 296 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch296-${index}` },
  ] as const))(
    'generated batch296 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.105.0',
        targetVersion: '25.104.0',
        startedAt: '2026-08-16T03:00:00.000Z',
        endedAt: '2026-08-16T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-16T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch296 three thousand four hundred fifty second duration rounds to fifty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3450000).toISOString();
      const report = buildCanaryReport({
        version: '25.105.1',
        targetVersion: '25.104.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(58);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 297 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch297-${index}` },
  ] as const))(
    'generated batch297 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.106.0',
        targetVersion: '25.105.0',
        startedAt: '2026-08-17T03:00:00.000Z',
        endedAt: '2026-08-17T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-17T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch297 three thousand five hundred ten second duration rounds to fifty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3510000).toISOString();
      const report = buildCanaryReport({
        version: '25.106.1',
        targetVersion: '25.105.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(59);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 298 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch298-${index}` },
  ] as const))(
    'generated batch298 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.107.0',
        targetVersion: '25.106.0',
        startedAt: '2026-08-18T03:00:00.000Z',
        endedAt: '2026-08-18T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-18T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch298 three thousand five hundred seventy second duration rounds to sixty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3570000).toISOString();
      const report = buildCanaryReport({
        version: '25.107.1',
        targetVersion: '25.106.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(60);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 299 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch299-${index}` },
  ] as const))(
    'generated batch299 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.108.0',
        targetVersion: '25.107.0',
        startedAt: '2026-08-19T03:00:00.000Z',
        endedAt: '2026-08-19T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-19T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch299 three thousand six hundred thirty second duration rounds to sixty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3630000).toISOString();
      const report = buildCanaryReport({
        version: '25.108.1',
        targetVersion: '25.107.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(61);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 300 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch300-${index}` },
  ] as const))(
    'generated batch300 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.109.0',
        targetVersion: '25.108.0',
        startedAt: '2026-08-20T03:00:00.000Z',
        endedAt: '2026-08-20T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-20T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch300 three thousand six hundred ninety second duration rounds to sixty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3690000).toISOString();
      const report = buildCanaryReport({
        version: '25.109.1',
        targetVersion: '25.108.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(62);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 301 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch301-${index}` },
  ] as const))(
    'generated batch301 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.110.0',
        targetVersion: '25.109.0',
        startedAt: '2026-08-21T03:00:00.000Z',
        endedAt: '2026-08-21T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-21T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch301 three thousand seven hundred fifty second duration rounds to sixty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3750000).toISOString();
      const report = buildCanaryReport({
        version: '25.110.1',
        targetVersion: '25.109.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(63);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 302 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch302-${index}` },
  ] as const))(
    'generated batch302 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.111.0',
        targetVersion: '25.110.0',
        startedAt: '2026-08-22T03:00:00.000Z',
        endedAt: '2026-08-22T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-22T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch302 three thousand eight hundred ten second duration rounds to sixty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3810000).toISOString();
      const report = buildCanaryReport({
        version: '25.111.1',
        targetVersion: '25.110.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(64);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 303 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch303-${index}` },
  ] as const))(
    'generated batch303 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.112.0',
        targetVersion: '25.111.0',
        startedAt: '2026-08-23T03:00:00.000Z',
        endedAt: '2026-08-23T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-23T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch303 three thousand eight hundred seventy second duration rounds to sixty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3870000).toISOString();
      const report = buildCanaryReport({
        version: '25.112.1',
        targetVersion: '25.111.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(65);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 304 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch304-${index}` },
  ] as const))(
    'generated batch304 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.113.0',
        targetVersion: '25.112.0',
        startedAt: '2026-08-24T03:00:00.000Z',
        endedAt: '2026-08-24T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-24T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch304 three thousand nine hundred thirty second duration rounds to sixty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3930000).toISOString();
      const report = buildCanaryReport({
        version: '25.113.1',
        targetVersion: '25.112.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(66);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 305 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch305-${index}` },
  ] as const))(
    'generated batch305 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.114.0',
        targetVersion: '25.113.0',
        startedAt: '2026-08-25T03:00:00.000Z',
        endedAt: '2026-08-25T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-25T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch305 three thousand nine hundred ninety second duration rounds to sixty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 3990000).toISOString();
      const report = buildCanaryReport({
        version: '25.114.1',
        targetVersion: '25.113.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(67);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 306 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch306-${index}` },
  ] as const))(
    'generated batch306 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.115.0',
        targetVersion: '25.114.0',
        startedAt: '2026-08-26T03:00:00.000Z',
        endedAt: '2026-08-26T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-26T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch306 four thousand fifty second duration rounds to sixty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4050000).toISOString();
      const report = buildCanaryReport({
        version: '25.115.1',
        targetVersion: '25.114.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(68);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 307 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch307-${index}` },
  ] as const))(
    'generated batch307 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.116.0',
        targetVersion: '25.115.0',
        startedAt: '2026-08-27T03:00:00.000Z',
        endedAt: '2026-08-27T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-27T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch307 four thousand one hundred ten second duration rounds to sixty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4110000).toISOString();
      const report = buildCanaryReport({
        version: '25.116.1',
        targetVersion: '25.115.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(69);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 308 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch308-${index}` },
  ] as const))(
    'generated batch308 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.117.0',
        targetVersion: '25.116.0',
        startedAt: '2026-08-28T03:00:00.000Z',
        endedAt: '2026-08-28T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-28T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch308 four thousand one hundred seventy second duration rounds to seventy minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4170000).toISOString();
      const report = buildCanaryReport({
        version: '25.117.1',
        targetVersion: '25.116.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(70);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 309 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch309-${index}` },
  ] as const))(
    'generated batch309 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.118.0',
        targetVersion: '25.117.0',
        startedAt: '2026-08-29T03:00:00.000Z',
        endedAt: '2026-08-29T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-29T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch309 four thousand two hundred thirty second duration rounds to seventy one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4230000).toISOString();
      const report = buildCanaryReport({
        version: '25.118.1',
        targetVersion: '25.117.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(71);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 310 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch310-${index}` },
  ] as const))(
    'generated batch310 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.119.0',
        targetVersion: '25.118.0',
        startedAt: '2026-08-30T03:00:00.000Z',
        endedAt: '2026-08-30T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-30T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch310 four thousand two hundred ninety second duration rounds to seventy two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4290000).toISOString();
      const report = buildCanaryReport({
        version: '25.119.1',
        targetVersion: '25.118.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(72);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 311 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch311-${index}` },
  ] as const))(
    'generated batch311 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.120.0',
        targetVersion: '25.119.0',
        startedAt: '2026-08-31T03:00:00.000Z',
        endedAt: '2026-08-31T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-31T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch311 four thousand three hundred fifty second duration rounds to seventy three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4350000).toISOString();
      const report = buildCanaryReport({
        version: '25.120.1',
        targetVersion: '25.119.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(73);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 312 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch312-${index}` },
  ] as const))(
    'generated batch312 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.121.0',
        targetVersion: '25.120.0',
        startedAt: '2026-09-01T03:00:00.000Z',
        endedAt: '2026-09-01T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-01T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch312 four thousand four hundred ten second duration rounds to seventy four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4410000).toISOString();
      const report = buildCanaryReport({
        version: '25.121.1',
        targetVersion: '25.120.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(74);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 313 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch313-${index}` },
  ] as const))(
    'generated batch313 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.122.0',
        targetVersion: '25.121.0',
        startedAt: '2026-09-02T03:00:00.000Z',
        endedAt: '2026-09-02T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-02T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch313 four thousand four hundred seventy second duration rounds to seventy five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4470000).toISOString();
      const report = buildCanaryReport({
        version: '25.122.1',
        targetVersion: '25.121.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(75);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 314 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch314-${index}` },
  ] as const))(
    'generated batch314 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.123.0',
        targetVersion: '25.122.0',
        startedAt: '2026-09-03T03:00:00.000Z',
        endedAt: '2026-09-03T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-03T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch314 four thousand five hundred thirty second duration rounds to seventy six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4530000).toISOString();
      const report = buildCanaryReport({
        version: '25.123.1',
        targetVersion: '25.122.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(76);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 315 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch315-${index}` },
  ] as const))(
    'generated batch315 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.124.0',
        targetVersion: '25.123.0',
        startedAt: '2026-09-04T03:00:00.000Z',
        endedAt: '2026-09-04T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-04T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch315 four thousand five hundred ninety second duration rounds to seventy seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4590000).toISOString();
      const report = buildCanaryReport({
        version: '25.124.1',
        targetVersion: '25.123.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(77);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 316 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch316-${index}` },
  ] as const))(
    'generated batch316 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.125.0',
        targetVersion: '25.124.0',
        startedAt: '2026-09-05T03:00:00.000Z',
        endedAt: '2026-09-05T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-05T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch316 four thousand six hundred fifty second duration rounds to seventy eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4650000).toISOString();
      const report = buildCanaryReport({
        version: '25.125.1',
        targetVersion: '25.124.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(78);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 317 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([new Error(`inner-${index}`)], `FAIL-${index}`) as unknown as 'FAIL', note: `batch317-${index}` },
  ] as const))(
    'generated batch317 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.126.0',
        targetVersion: '25.125.0',
        startedAt: '2026-09-06T03:00:00.000Z',
        endedAt: '2026-09-06T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-06T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch317 four thousand seven hundred ten second duration rounds to seventy nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4710000).toISOString();
      const report = buildCanaryReport({
        version: '25.126.1',
        targetVersion: '25.125.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(79);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 318 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch318-${index}` },
  ] as const))(
    'generated batch318 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.127.0',
        targetVersion: '25.126.0',
        startedAt: '2026-09-07T03:00:00.000Z',
        endedAt: '2026-09-07T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-07T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch318 four thousand seven hundred seventy second duration rounds to eighty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4770000).toISOString();
      const report = buildCanaryReport({
        version: '25.127.1',
        targetVersion: '25.126.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(80);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 319 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch319-${index}` },
  ] as const))(
    'generated batch319 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.128.0',
        targetVersion: '25.127.0',
        startedAt: '2026-09-08T03:00:00.000Z',
        endedAt: '2026-09-08T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-08T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch319 four thousand eight hundred thirty second duration rounds to eighty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4830000).toISOString();
      const report = buildCanaryReport({
        version: '25.128.1',
        targetVersion: '25.127.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(81);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 320 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch320-${index}` },
  ] as const))(
    'generated batch320 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.129.0',
        targetVersion: '25.128.0',
        startedAt: '2026-09-09T03:00:00.000Z',
        endedAt: '2026-09-09T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-09T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch320 four thousand eight hundred ninety second duration rounds to eighty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4890000).toISOString();
      const report = buildCanaryReport({
        version: '25.129.1',
        targetVersion: '25.128.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(82);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 321 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch321-${index}` },
  ] as const))(
    'generated batch321 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.130.0',
        targetVersion: '25.129.0',
        startedAt: '2026-09-10T03:00:00.000Z',
        endedAt: '2026-09-10T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-10T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch321 four thousand nine hundred fifty second duration rounds to eighty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 4950000).toISOString();
      const report = buildCanaryReport({
        version: '25.130.1',
        targetVersion: '25.129.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(83);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 322 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    {
      id: 'canary_50',
      status: new AggregateError([new Error('inner')], `FAIL-${index}`) as unknown as 'FAIL',
      note: `batch322-${index}`,
    },
  ] as const))(
    'generated batch322 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.131.0',
        targetVersion: '25.130.0',
        startedAt: '2026-09-11T03:00:00.000Z',
        endedAt: '2026-09-11T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-11T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch322 five thousand ten second duration rounds to eighty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5010000).toISOString();
      const report = buildCanaryReport({
        version: '25.131.1',
        targetVersion: '25.130.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(84);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 323 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch323-${index}` },
  ] as const))(
    'generated batch323 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.132.0',
        targetVersion: '25.131.0',
        startedAt: '2026-09-12T03:00:00.000Z',
        endedAt: '2026-09-12T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-12T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch323 five thousand seventy second duration rounds to eighty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5070000).toISOString();
      const report = buildCanaryReport({
        version: '25.132.1',
        targetVersion: '25.131.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(85);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 324 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch324-${index}` },
  ] as const))(
    'generated batch324 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.133.0',
        targetVersion: '25.132.0',
        startedAt: '2026-09-13T03:00:00.000Z',
        endedAt: '2026-09-13T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-13T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch324 five thousand one hundred thirty second duration rounds to eighty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5130000).toISOString();
      const report = buildCanaryReport({
        version: '25.133.1',
        targetVersion: '25.132.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(86);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 325 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch325-${index}` },
  ] as const))(
    'generated batch325 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.134.0',
        targetVersion: '25.133.0',
        startedAt: '2026-09-14T03:00:00.000Z',
        endedAt: '2026-09-14T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-14T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch325 five thousand one hundred ninety second duration rounds to eighty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5190000).toISOString();
      const report = buildCanaryReport({
        version: '25.134.1',
        targetVersion: '25.133.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(87);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 326 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch326-${index}` },
  ] as const))(
    'generated batch326 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.135.0',
        targetVersion: '25.134.0',
        startedAt: '2026-09-15T03:00:00.000Z',
        endedAt: '2026-09-15T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-15T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch326 five thousand two hundred fifty second duration rounds to eighty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5250000).toISOString();
      const report = buildCanaryReport({
        version: '25.135.1',
        targetVersion: '25.134.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(88);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 327 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch327-${index}` },
  ] as const))(
    'generated batch327 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.136.0',
        targetVersion: '25.135.0',
        startedAt: '2026-09-16T03:00:00.000Z',
        endedAt: '2026-09-16T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-16T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch327 five thousand three hundred ten second duration rounds to eighty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5310000).toISOString();
      const report = buildCanaryReport({
        version: '25.136.1',
        targetVersion: '25.135.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(89);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 328 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch328-${index}` },
  ] as const))(
    'generated batch328 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.137.0',
        targetVersion: '25.136.0',
        startedAt: '2026-09-17T03:00:00.000Z',
        endedAt: '2026-09-17T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-17T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch328 five thousand three hundred seventy second duration rounds to ninety minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5370000).toISOString();
      const report = buildCanaryReport({
        version: '25.137.1',
        targetVersion: '25.136.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(90);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 329 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch329-${index}` },
  ] as const))(
    'generated batch329 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.138.0',
        targetVersion: '25.137.0',
        startedAt: '2026-09-18T03:00:00.000Z',
        endedAt: '2026-09-18T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-18T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch329 five thousand four hundred thirty second duration rounds to ninety one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5430000).toISOString();
      const report = buildCanaryReport({
        version: '25.138.1',
        targetVersion: '25.137.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(91);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 330 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    {
      id: 'canary_50',
      status: new AggregateError([new Error('inner')], `FAIL-${index}`) as unknown as 'FAIL',
      note: `batch330-${index}`,
    },
  ] as const))(
    'generated batch330 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.139.0',
        targetVersion: '25.138.0',
        startedAt: '2026-09-19T03:00:00.000Z',
        endedAt: '2026-09-19T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-19T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch330 five thousand four hundred ninety second duration rounds to ninety two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5490000).toISOString();
      const report = buildCanaryReport({
        version: '25.139.1',
        targetVersion: '25.138.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(92);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 331 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch331-${index}` },
  ] as const))(
    'generated batch331 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.140.0',
        targetVersion: '25.139.0',
        startedAt: '2026-09-20T03:00:00.000Z',
        endedAt: '2026-09-20T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-20T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch331 five thousand five hundred fifty second duration rounds to ninety three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5550000).toISOString();
      const report = buildCanaryReport({
        version: '25.140.1',
        targetVersion: '25.139.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(93);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 332 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch332-${index}` },
  ] as const))(
    'generated batch332 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.141.0',
        targetVersion: '25.140.0',
        startedAt: '2026-09-21T03:00:00.000Z',
        endedAt: '2026-09-21T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-21T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch332 five thousand six hundred ten second duration rounds to ninety four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5610000).toISOString();
      const report = buildCanaryReport({
        version: '25.141.1',
        targetVersion: '25.140.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(94);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 333 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch333-${index}` },
  ] as const))(
    'generated batch333 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.142.0',
        targetVersion: '25.141.0',
        startedAt: '2026-09-22T03:00:00.000Z',
        endedAt: '2026-09-22T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-22T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch333 five thousand six hundred seventy second duration rounds to ninety five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5670000).toISOString();
      const report = buildCanaryReport({
        version: '25.142.1',
        targetVersion: '25.141.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(95);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 334 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch334-${index}` },
  ] as const))(
    'generated batch334 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.143.0',
        targetVersion: '25.142.0',
        startedAt: '2026-09-23T03:00:00.000Z',
        endedAt: '2026-09-23T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-23T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch334 five thousand seven hundred thirty second duration rounds to ninety six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5730000).toISOString();
      const report = buildCanaryReport({
        version: '25.143.1',
        targetVersion: '25.142.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(96);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 335 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch335-${index}` },
  ] as const))(
    'generated batch335 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.144.0',
        targetVersion: '25.143.0',
        startedAt: '2026-09-24T03:00:00.000Z',
        endedAt: '2026-09-24T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-24T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch335 five thousand seven hundred ninety second duration rounds to ninety seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5790000).toISOString();
      const report = buildCanaryReport({
        version: '25.144.1',
        targetVersion: '25.143.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(97);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 336 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch336-${index}` },
  ] as const))(
    'generated batch336 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.145.0',
        targetVersion: '25.144.0',
        startedAt: '2026-09-25T03:00:00.000Z',
        endedAt: '2026-09-25T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-25T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch336 five thousand eight hundred fifty second duration rounds to ninety eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5850000).toISOString();
      const report = buildCanaryReport({
        version: '25.145.1',
        targetVersion: '25.144.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(98);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 337 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch337-${index}` },
  ] as const))(
    'generated batch337 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.146.0',
        targetVersion: '25.145.0',
        startedAt: '2026-09-26T03:00:00.000Z',
        endedAt: '2026-09-26T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-26T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch337 five thousand nine hundred ten second duration rounds to ninety nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5910000).toISOString();
      const report = buildCanaryReport({
        version: '25.146.1',
        targetVersion: '25.145.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(99);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 338 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch338-${index}` },
  ] as const))(
    'generated batch338 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.147.0',
        targetVersion: '25.146.0',
        startedAt: '2026-09-27T03:00:00.000Z',
        endedAt: '2026-09-27T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-27T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch338 five thousand nine hundred seventy second duration rounds to one hundred minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 5970000).toISOString();
      const report = buildCanaryReport({
        version: '25.147.1',
        targetVersion: '25.146.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(100);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 339 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch339-${index}` },
  ] as const))(
    'generated batch339 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.148.0',
        targetVersion: '25.147.0',
        startedAt: '2026-09-28T03:00:00.000Z',
        endedAt: '2026-09-28T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-28T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch339 six thousand thirty second duration rounds to one hundred one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6030000).toISOString();
      const report = buildCanaryReport({
        version: '25.148.1',
        targetVersion: '25.147.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(101);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 340 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch340-${index}` },
  ] as const))(
    'generated batch340 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.149.0',
        targetVersion: '25.148.0',
        startedAt: '2026-09-29T03:00:00.000Z',
        endedAt: '2026-09-29T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-29T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch340 six thousand ninety second duration rounds to one hundred two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6090000).toISOString();
      const report = buildCanaryReport({
        version: '25.149.1',
        targetVersion: '25.148.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(102);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 341 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch341-${index}` },
  ] as const))(
    'generated batch341 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.150.0',
        targetVersion: '25.149.0',
        startedAt: '2026-09-30T03:00:00.000Z',
        endedAt: '2026-09-30T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-30T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch341 six thousand one hundred fifty second duration rounds to one hundred three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6150000).toISOString();
      const report = buildCanaryReport({
        version: '25.150.1',
        targetVersion: '25.149.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(103);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 342 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch342-${index}` },
  ] as const))(
    'generated batch342 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.151.0',
        targetVersion: '25.150.0',
        startedAt: '2026-10-01T03:00:00.000Z',
        endedAt: '2026-10-01T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-01T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch342 six thousand two hundred ten second duration rounds to one hundred four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6210000).toISOString();
      const report = buildCanaryReport({
        version: '25.151.1',
        targetVersion: '25.150.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(104);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 343 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch343-${index}` },
  ] as const))(
    'generated batch343 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.152.0',
        targetVersion: '25.151.0',
        startedAt: '2026-10-02T03:00:00.000Z',
        endedAt: '2026-10-02T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-02T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch343 six thousand two hundred seventy second duration rounds to one hundred five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6270000).toISOString();
      const report = buildCanaryReport({
        version: '25.152.1',
        targetVersion: '25.151.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(105);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 344 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch344-${index}` },
  ] as const))(
    'generated batch344 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.153.0',
        targetVersion: '25.152.0',
        startedAt: '2026-10-03T03:00:00.000Z',
        endedAt: '2026-10-03T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-03T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch344 six thousand three hundred thirty second duration rounds to one hundred six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6330000).toISOString();
      const report = buildCanaryReport({
        version: '25.153.1',
        targetVersion: '25.152.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(106);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 345 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch345-${index}` },
  ] as const))(
    'generated batch345 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.154.0',
        targetVersion: '25.153.0',
        startedAt: '2026-10-04T03:00:00.000Z',
        endedAt: '2026-10-04T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-04T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch345 six thousand three hundred ninety second duration rounds to one hundred seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6390000).toISOString();
      const report = buildCanaryReport({
        version: '25.154.1',
        targetVersion: '25.153.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(107);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 346 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch346-${index}` },
  ] as const))(
    'generated batch346 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.155.0',
        targetVersion: '25.154.0',
        startedAt: '2026-10-05T03:00:00.000Z',
        endedAt: '2026-10-05T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-05T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch346 six thousand four hundred fifty second duration rounds to one hundred eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6450000).toISOString();
      const report = buildCanaryReport({
        version: '25.155.1',
        targetVersion: '25.154.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(108);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 347 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch347-${index}` },
  ] as const))(
    'generated batch347 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.156.0',
        targetVersion: '25.155.0',
        startedAt: '2026-10-06T03:00:00.000Z',
        endedAt: '2026-10-06T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-06T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch347 six thousand five hundred ten second duration rounds to one hundred nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6510000).toISOString();
      const report = buildCanaryReport({
        version: '25.156.1',
        targetVersion: '25.155.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(109);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 348 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch348-${index}` },
  ] as const))(
    'generated batch348 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.157.0',
        targetVersion: '25.156.0',
        startedAt: '2026-10-07T03:00:00.000Z',
        endedAt: '2026-10-07T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-07T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch348 six thousand five hundred seventy second duration rounds to one hundred ten minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6570000).toISOString();
      const report = buildCanaryReport({
        version: '25.157.1',
        targetVersion: '25.156.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(110);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 349 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch349-${index}` },
  ] as const))(
    'generated batch349 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.158.0',
        targetVersion: '25.157.0',
        startedAt: '2026-10-08T03:00:00.000Z',
        endedAt: '2026-10-08T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-08T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch349 six thousand six hundred thirty second duration rounds to one hundred eleven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6630000).toISOString();
      const report = buildCanaryReport({
        version: '25.158.1',
        targetVersion: '25.157.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(111);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 350 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch350-${index}` },
  ] as const))(
    'generated batch350 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.159.0',
        targetVersion: '25.158.0',
        startedAt: '2026-10-09T03:00:00.000Z',
        endedAt: '2026-10-09T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-09T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch350 six thousand six hundred ninety second duration rounds to one hundred twelve minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6690000).toISOString();
      const report = buildCanaryReport({
        version: '25.159.1',
        targetVersion: '25.158.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(112);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 351 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch351-${index}` },
  ] as const))(
    'generated batch351 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.160.0',
        targetVersion: '25.159.0',
        startedAt: '2026-10-10T03:00:00.000Z',
        endedAt: '2026-10-10T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-10T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch351 six thousand seven hundred fifty second duration rounds to one hundred thirteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6750000).toISOString();
      const report = buildCanaryReport({
        version: '25.160.1',
        targetVersion: '25.159.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(113);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 352 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch352-${index}` },
  ] as const))(
    'generated batch352 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.161.0',
        targetVersion: '25.160.0',
        startedAt: '2026-10-11T03:00:00.000Z',
        endedAt: '2026-10-11T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-11T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch352 six thousand eight hundred ten second duration rounds to one hundred fourteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6810000).toISOString();
      const report = buildCanaryReport({
        version: '25.161.1',
        targetVersion: '25.160.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(114);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 353 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch353-${index}` },
  ] as const))(
    'generated batch353 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.162.0',
        targetVersion: '25.161.0',
        startedAt: '2026-10-12T03:00:00.000Z',
        endedAt: '2026-10-12T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-12T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch353 six thousand eight hundred seventy second duration rounds to one hundred fifteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6870000).toISOString();
      const report = buildCanaryReport({
        version: '25.162.1',
        targetVersion: '25.161.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(115);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 354 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch354-${index}` },
  ] as const))(
    'generated batch354 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.163.0',
        targetVersion: '25.162.0',
        startedAt: '2026-10-13T03:00:00.000Z',
        endedAt: '2026-10-13T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-13T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch354 six thousand nine hundred thirty second duration rounds to one hundred sixteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6930000).toISOString();
      const report = buildCanaryReport({
        version: '25.163.1',
        targetVersion: '25.162.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(116);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 355 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch355-${index}` },
  ] as const))(
    'generated batch355 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.164.0',
        targetVersion: '25.163.0',
        startedAt: '2026-10-14T03:00:00.000Z',
        endedAt: '2026-10-14T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-14T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch355 six thousand nine hundred ninety second duration rounds to one hundred seventeen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 6990000).toISOString();
      const report = buildCanaryReport({
        version: '25.164.1',
        targetVersion: '25.163.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(117);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 356 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch356-${index}` },
  ] as const))(
    'generated batch356 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.165.0',
        targetVersion: '25.164.0',
        startedAt: '2026-10-15T03:00:00.000Z',
        endedAt: '2026-10-15T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-15T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch356 seven thousand fifty second duration rounds to one hundred eighteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7050000).toISOString();
      const report = buildCanaryReport({
        version: '25.165.1',
        targetVersion: '25.164.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(118);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 357 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch357-${index}` },
  ] as const))(
    'generated batch357 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.166.0',
        targetVersion: '25.165.0',
        startedAt: '2026-10-16T03:00:00.000Z',
        endedAt: '2026-10-16T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-16T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch357 seven thousand one hundred ten second duration rounds to one hundred nineteen minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7110000).toISOString();
      const report = buildCanaryReport({
        version: '25.166.1',
        targetVersion: '25.165.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(119);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 358 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch358-${index}` },
  ] as const))(
    'generated batch358 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.167.0',
        targetVersion: '25.166.0',
        startedAt: '2026-10-17T03:00:00.000Z',
        endedAt: '2026-10-17T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-17T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch358 seven thousand one hundred seventy second duration rounds to one hundred twenty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7170000).toISOString();
      const report = buildCanaryReport({
        version: '25.167.1',
        targetVersion: '25.166.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(120);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 359 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch359-${index}` },
  ] as const))(
    'generated batch359 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.168.0',
        targetVersion: '25.167.0',
        startedAt: '2026-10-18T03:00:00.000Z',
        endedAt: '2026-10-18T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-18T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch359 seven thousand two hundred thirty second duration rounds to one hundred twenty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7230000).toISOString();
      const report = buildCanaryReport({
        version: '25.168.1',
        targetVersion: '25.167.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(121);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 360 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch360-${index}` },
  ] as const))(
    'generated batch360 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.169.0',
        targetVersion: '25.168.0',
        startedAt: '2026-10-19T03:00:00.000Z',
        endedAt: '2026-10-19T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-19T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch360 seven thousand two hundred ninety second duration rounds to one hundred twenty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7290000).toISOString();
      const report = buildCanaryReport({
        version: '25.169.1',
        targetVersion: '25.168.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(122);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 361 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch361-${index}` },
  ] as const))(
    'generated batch361 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.170.0',
        targetVersion: '25.169.0',
        startedAt: '2026-10-20T03:00:00.000Z',
        endedAt: '2026-10-20T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-20T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch361 seven thousand three hundred fifty second duration rounds to one hundred twenty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7350000).toISOString();
      const report = buildCanaryReport({
        version: '25.170.1',
        targetVersion: '25.169.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(123);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 362 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new TypeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch362-${index}` },
  ] as const))(
    'generated batch362 TypeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.171.0',
        targetVersion: '25.170.0',
        startedAt: '2026-10-21T03:00:00.000Z',
        endedAt: '2026-10-21T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-21T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch362 seven thousand four hundred ten second duration rounds to one hundred twenty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7410000).toISOString();
      const report = buildCanaryReport({
        version: '25.171.1',
        targetVersion: '25.170.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(124);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 363 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch363-${index}` },
  ] as const))(
    'generated batch363 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.172.0',
        targetVersion: '25.171.0',
        startedAt: '2026-10-22T03:00:00.000Z',
        endedAt: '2026-10-22T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-22T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch363 seven thousand four hundred seventy second duration rounds to one hundred twenty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7470000).toISOString();
      const report = buildCanaryReport({
        version: '25.172.1',
        targetVersion: '25.171.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(125);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 364 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch364-${index}` },
  ] as const))(
    'generated batch364 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.173.0',
        targetVersion: '25.172.0',
        startedAt: '2026-10-23T03:00:00.000Z',
        endedAt: '2026-10-23T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-23T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch364 seven thousand five hundred thirty second duration rounds to one hundred twenty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7530000).toISOString();
      const report = buildCanaryReport({
        version: '25.173.1',
        targetVersion: '25.172.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(126);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 365 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch365-${index}` },
  ] as const))(
    'generated batch365 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.174.0',
        targetVersion: '25.173.0',
        startedAt: '2026-10-24T03:00:00.000Z',
        endedAt: '2026-10-24T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-24T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch365 seven thousand five hundred ninety second duration rounds to one hundred twenty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7590000).toISOString();
      const report = buildCanaryReport({
        version: '25.174.1',
        targetVersion: '25.173.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(127);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 366 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch366-${index}` },
  ] as const))(
    'generated batch366 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.175.0',
        targetVersion: '25.174.0',
        startedAt: '2026-10-25T03:00:00.000Z',
        endedAt: '2026-10-25T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-25T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch366 seven thousand six hundred fifty second duration rounds to one hundred twenty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7650000).toISOString();
      const report = buildCanaryReport({
        version: '25.175.1',
        targetVersion: '25.174.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(128);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 367 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch367-${index}` },
  ] as const))(
    'generated batch367 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.176.0',
        targetVersion: '25.175.0',
        startedAt: '2026-10-26T03:00:00.000Z',
        endedAt: '2026-10-26T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-26T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch367 seven thousand seven hundred ten second duration rounds to one hundred twenty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7710000).toISOString();
      const report = buildCanaryReport({
        version: '25.176.1',
        targetVersion: '25.175.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(129);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 368 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch368-${index}` },
  ] as const))(
    'generated batch368 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.177.0',
        targetVersion: '25.176.0',
        startedAt: '2026-10-27T03:00:00.000Z',
        endedAt: '2026-10-27T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-27T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch368 seven thousand seven hundred seventy second duration rounds to one hundred thirty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7770000).toISOString();
      const report = buildCanaryReport({
        version: '25.177.1',
        targetVersion: '25.176.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(130);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 369 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch369-${index}` },
  ] as const))(
    'generated batch369 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.178.0',
        targetVersion: '25.177.0',
        startedAt: '2026-10-28T03:00:00.000Z',
        endedAt: '2026-10-28T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-28T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch369 seven thousand eight hundred thirty second duration rounds to one hundred thirty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7830000).toISOString();
      const report = buildCanaryReport({
        version: '25.178.1',
        targetVersion: '25.177.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(131);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 370 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch370-${index}` },
  ] as const))(
    'generated batch370 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.179.0',
        targetVersion: '25.178.0',
        startedAt: '2026-10-29T03:00:00.000Z',
        endedAt: '2026-10-29T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-29T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch370 seven thousand eight hundred ninety second duration rounds to one hundred thirty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7890000).toISOString();
      const report = buildCanaryReport({
        version: '25.179.1',
        targetVersion: '25.178.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(132);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 371 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch371-${index}` },
  ] as const))(
    'generated batch371 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.180.0',
        targetVersion: '25.179.0',
        startedAt: '2026-10-30T03:00:00.000Z',
        endedAt: '2026-10-30T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-30T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch371 seven thousand nine hundred fifty second duration rounds to one hundred thirty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 7950000).toISOString();
      const report = buildCanaryReport({
        version: '25.180.1',
        targetVersion: '25.179.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(133);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 372 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch372-${index}` },
  ] as const))(
    'generated batch372 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.181.0',
        targetVersion: '25.180.0',
        startedAt: '2026-10-31T03:00:00.000Z',
        endedAt: '2026-10-31T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-31T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch372 eight thousand ten second duration rounds to one hundred thirty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8010000).toISOString();
      const report = buildCanaryReport({
        version: '25.181.1',
        targetVersion: '25.180.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(134);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 373 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_75', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch373-${index}` },
  ] as const))(
    'generated batch373 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.182.0',
        targetVersion: '25.181.0',
        startedAt: '2026-11-01T03:00:00.000Z',
        endedAt: '2026-11-01T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-01T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch373 eight thousand seventy second duration rounds to one hundred thirty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8070000).toISOString();
      const report = buildCanaryReport({
        version: '25.182.1',
        targetVersion: '25.181.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(135);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 374 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_100', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch374-${index}` },
  ] as const))(
    'generated batch374 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.183.0',
        targetVersion: '25.182.0',
        startedAt: '2026-11-02T03:00:00.000Z',
        endedAt: '2026-11-02T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-02T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch374 eight thousand one hundred thirty second duration rounds to one hundred thirty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8130000).toISOString();
      const report = buildCanaryReport({
        version: '25.183.1',
        targetVersion: '25.182.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(136);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 375 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch375-${index}` },
  ] as const))(
    'generated batch375 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.184.0',
        targetVersion: '25.183.0',
        startedAt: '2026-11-03T03:00:00.000Z',
        endedAt: '2026-11-03T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-03T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch375 eight thousand one hundred ninety second duration rounds to one hundred thirty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8190000).toISOString();
      const report = buildCanaryReport({
        version: '25.184.1',
        targetVersion: '25.183.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(137);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 376 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch376-${index}` },
  ] as const))(
    'generated batch376 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.185.0',
        targetVersion: '25.184.0',
        startedAt: '2026-11-04T03:00:00.000Z',
        endedAt: '2026-11-04T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-04T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch376 eight thousand two hundred fifty second duration rounds to one hundred thirty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8250000).toISOString();
      const report = buildCanaryReport({
        version: '25.185.1',
        targetVersion: '25.184.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(138);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 377 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'full_rollout', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch377-${index}` },
  ] as const))(
    'generated batch377 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.186.0',
        targetVersion: '25.185.0',
        startedAt: '2026-11-05T03:00:00.000Z',
        endedAt: '2026-11-05T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-05T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch377 eight thousand three hundred ten second duration rounds to one hundred thirty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8310000).toISOString();
      const report = buildCanaryReport({
        version: '25.186.1',
        targetVersion: '25.185.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(139);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 378 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch378-${index}` },
  ] as const))(
    'generated batch378 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.187.0',
        targetVersion: '25.186.0',
        startedAt: '2026-11-06T03:00:00.000Z',
        endedAt: '2026-11-06T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-06T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch378 eight thousand three hundred seventy second duration rounds to one hundred forty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8370000).toISOString();
      const report = buildCanaryReport({
        version: '25.187.1',
        targetVersion: '25.186.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(140);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 379 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch379-${index}` },
  ] as const))(
    'generated batch379 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.188.0',
        targetVersion: '25.187.0',
        startedAt: '2026-11-07T03:00:00.000Z',
        endedAt: '2026-11-07T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-07T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch379 eight thousand four hundred thirty second duration rounds to one hundred forty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8430000).toISOString();
      const report = buildCanaryReport({
        version: '25.188.1',
        targetVersion: '25.187.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(141);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 380 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_75', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch380-${index}` },
  ] as const))(
    'generated batch380 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.189.0',
        targetVersion: '25.188.0',
        startedAt: '2026-11-08T03:00:00.000Z',
        endedAt: '2026-11-08T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-08T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch380 eight thousand four hundred ninety second duration rounds to one hundred forty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8490000).toISOString();
      const report = buildCanaryReport({
        version: '25.189.1',
        targetVersion: '25.188.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(142);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 381 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch381-${index}` },
  ] as const))(
    'generated batch381 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.190.0',
        targetVersion: '25.189.0',
        startedAt: '2026-11-09T03:00:00.000Z',
        endedAt: '2026-11-09T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-09T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch381 eight thousand five hundred fifty second duration rounds to one hundred forty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8550000).toISOString();
      const report = buildCanaryReport({
        version: '25.190.1',
        targetVersion: '25.189.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(143);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 382 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch382-${index}` },
  ] as const))(
    'generated batch382 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.191.0',
        targetVersion: '25.190.0',
        startedAt: '2026-11-10T03:00:00.000Z',
        endedAt: '2026-11-10T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-10T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch382 eight thousand six hundred ten second duration rounds to one hundred forty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8610000).toISOString();
      const report = buildCanaryReport({
        version: '25.191.1',
        targetVersion: '25.190.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(144);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 383 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch383-${index}` },
  ] as const))(
    'generated batch383 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.192.0',
        targetVersion: '25.191.0',
        startedAt: '2026-11-11T03:00:00.000Z',
        endedAt: '2026-11-11T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-11T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch383 eight thousand six hundred seventy second duration rounds to one hundred forty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8670000).toISOString();
      const report = buildCanaryReport({
        version: '25.192.1',
        targetVersion: '25.191.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(145);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 384 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_75', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch384-${index}` },
  ] as const))(
    'generated batch384 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.193.0',
        targetVersion: '25.192.0',
        startedAt: '2026-11-12T03:00:00.000Z',
        endedAt: '2026-11-12T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-12T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch384 eight thousand seven hundred thirty second duration rounds to one hundred forty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8730000).toISOString();
      const report = buildCanaryReport({
        version: '25.193.1',
        targetVersion: '25.192.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(146);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 385 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch385-${index}` },
  ] as const))(
    'generated batch385 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.194.0',
        targetVersion: '25.193.0',
        startedAt: '2026-11-13T03:00:00.000Z',
        endedAt: '2026-11-13T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-13T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch385 eight thousand seven hundred ninety second duration rounds to one hundred forty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8790000).toISOString();
      const report = buildCanaryReport({
        version: '25.194.1',
        targetVersion: '25.193.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(147);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 386 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_25', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch386-${index}` },
  ] as const))(
    'generated batch386 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.195.0',
        targetVersion: '25.194.0',
        startedAt: '2026-11-14T03:00:00.000Z',
        endedAt: '2026-11-14T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-14T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch386 eight thousand eight hundred fifty second duration rounds to one hundred forty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8850000).toISOString();
      const report = buildCanaryReport({
        version: '25.195.1',
        targetVersion: '25.194.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(148);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 387 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_50', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch387-${index}` },
  ] as const))(
    'generated batch387 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.196.0',
        targetVersion: '25.195.0',
        startedAt: '2026-11-15T03:00:00.000Z',
        endedAt: '2026-11-15T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-15T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch387 eight thousand nine hundred ten second duration rounds to one hundred forty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8910000).toISOString();
      const report = buildCanaryReport({
        version: '25.196.1',
        targetVersion: '25.195.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(149);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 388 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_75', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch388-${index}` },
  ] as const))(
    'generated batch388 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.197.0',
        targetVersion: '25.196.0',
        startedAt: '2026-11-16T03:00:00.000Z',
        endedAt: '2026-11-16T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-16T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch388 eight thousand nine hundred seventy second duration rounds to one hundred fifty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 8970000).toISOString();
      const report = buildCanaryReport({
        version: '25.197.1',
        targetVersion: '25.196.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(150);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 389 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch389-${index}` },
  ] as const))(
    'generated batch389 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.198.0',
        targetVersion: '25.197.0',
        startedAt: '2026-11-17T03:00:00.000Z',
        endedAt: '2026-11-17T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-17T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch389 nine thousand thirty second duration rounds to one hundred fifty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9030000).toISOString();
      const report = buildCanaryReport({
        version: '25.198.1',
        targetVersion: '25.197.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(151);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 390 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch390-${index}` },
  ] as const))(
    'generated batch390 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.199.0',
        targetVersion: '25.198.0',
        startedAt: '2026-11-18T03:00:00.000Z',
        endedAt: '2026-11-18T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-18T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch390 nine thousand ninety second duration rounds to one hundred fifty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9090000).toISOString();
      const report = buildCanaryReport({
        version: '25.199.1',
        targetVersion: '25.198.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(152);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 391 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch391-${index}` },
  ] as const))(
    'generated batch391 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.200.0',
        targetVersion: '25.199.0',
        startedAt: '2026-11-19T03:00:00.000Z',
        endedAt: '2026-11-19T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-19T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch391 nine thousand one hundred fifty second duration rounds to one hundred fifty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9150000).toISOString();
      const report = buildCanaryReport({
        version: '25.200.1',
        targetVersion: '25.199.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(153);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 392 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch392-${index}` },
  ] as const))(
    'generated batch392 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.201.0',
        targetVersion: '25.200.0',
        startedAt: '2026-11-20T03:00:00.000Z',
        endedAt: '2026-11-20T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-20T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch392 nine thousand two hundred ten second duration rounds to one hundred fifty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9210000).toISOString();
      const report = buildCanaryReport({
        version: '25.201.1',
        targetVersion: '25.200.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(154);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 393 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch393-${index}` },
  ] as const))(
    'generated batch393 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.202.0',
        targetVersion: '25.201.0',
        startedAt: '2026-11-21T03:00:00.000Z',
        endedAt: '2026-11-21T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-21T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch393 nine thousand two hundred seventy second duration rounds to one hundred fifty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9270000).toISOString();
      const report = buildCanaryReport({
        version: '25.202.1',
        targetVersion: '25.201.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(155);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 394 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch394-${index}` },
  ] as const))(
    'generated batch394 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.203.0',
        targetVersion: '25.202.0',
        startedAt: '2026-11-22T03:00:00.000Z',
        endedAt: '2026-11-22T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-22T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch394 nine thousand three hundred thirty second duration rounds to one hundred fifty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9330000).toISOString();
      const report = buildCanaryReport({
        version: '25.203.1',
        targetVersion: '25.202.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(156);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 395 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch395-${index}` },
  ] as const))(
    'generated batch395 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.204.0',
        targetVersion: '25.203.0',
        startedAt: '2026-11-23T03:00:00.000Z',
        endedAt: '2026-11-23T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-23T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch395 nine thousand three hundred ninety second duration rounds to one hundred fifty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9390000).toISOString();
      const report = buildCanaryReport({
        version: '25.204.1',
        targetVersion: '25.203.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(157);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 396 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch396-${index}` },
  ] as const))(
    'generated batch396 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.205.0',
        targetVersion: '25.204.0',
        startedAt: '2026-11-24T03:00:00.000Z',
        endedAt: '2026-11-24T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-24T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch396 nine thousand four hundred fifty second duration rounds to one hundred fifty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9450000).toISOString();
      const report = buildCanaryReport({
        version: '25.205.1',
        targetVersion: '25.204.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(158);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 397 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch397-${index}` },
  ] as const))(
    'generated batch397 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.206.0',
        targetVersion: '25.205.0',
        startedAt: '2026-11-25T03:00:00.000Z',
        endedAt: '2026-11-25T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-25T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch397 nine thousand five hundred ten second duration rounds to one hundred fifty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9510000).toISOString();
      const report = buildCanaryReport({
        version: '25.206.1',
        targetVersion: '25.205.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(159);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 398 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch398-${index}` },
  ] as const))(
    'generated batch398 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.207.0',
        targetVersion: '25.206.0',
        startedAt: '2026-11-26T03:00:00.000Z',
        endedAt: '2026-11-26T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-26T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch398 nine thousand five hundred seventy second duration rounds to one hundred sixty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9570000).toISOString();
      const report = buildCanaryReport({
        version: '25.207.1',
        targetVersion: '25.206.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(160);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 399 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch399-${index}` },
  ] as const))(
    'generated batch399 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.208.0',
        targetVersion: '25.207.0',
        startedAt: '2026-11-27T03:00:00.000Z',
        endedAt: '2026-11-27T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-27T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch399 nine thousand six hundred thirty second duration rounds to one hundred sixty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9630000).toISOString();
      const report = buildCanaryReport({
        version: '25.208.1',
        targetVersion: '25.207.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(161);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 400 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch400-${index}` },
  ] as const))(
    'generated batch400 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.209.0',
        targetVersion: '25.208.0',
        startedAt: '2026-11-28T03:00:00.000Z',
        endedAt: '2026-11-28T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-28T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch400 nine thousand six hundred ninety second duration rounds to one hundred sixty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9690000).toISOString();
      const report = buildCanaryReport({
        version: '25.209.1',
        targetVersion: '25.208.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(162);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 401 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch401-${index}` },
  ] as const))(
    'generated batch401 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.210.0',
        targetVersion: '25.209.0',
        startedAt: '2026-11-29T03:00:00.000Z',
        endedAt: '2026-11-29T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-29T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch401 nine thousand seven hundred fifty second duration rounds to one hundred sixty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9750000).toISOString();
      const report = buildCanaryReport({
        version: '25.210.1',
        targetVersion: '25.209.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(163);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 402 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch402-${index}` },
  ] as const))(
    'generated batch402 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.211.0',
        targetVersion: '25.210.0',
        startedAt: '2026-11-30T03:00:00.000Z',
        endedAt: '2026-11-30T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-30T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch402 nine thousand eight hundred ten second duration rounds to one hundred sixty four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9810000).toISOString();
      const report = buildCanaryReport({
        version: '25.211.1',
        targetVersion: '25.210.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(164);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 403 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch403-${index}` },
  ] as const))(
    'generated batch403 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.212.0',
        targetVersion: '25.211.0',
        startedAt: '2026-12-01T03:00:00.000Z',
        endedAt: '2026-12-01T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-01T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch403 nine thousand eight hundred seventy second duration rounds to one hundred sixty five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9870000).toISOString();
      const report = buildCanaryReport({
        version: '25.212.1',
        targetVersion: '25.211.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(165);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 404 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch404-${index}` },
  ] as const))(
    'generated batch404 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.213.0',
        targetVersion: '25.212.0',
        startedAt: '2026-12-02T03:00:00.000Z',
        endedAt: '2026-12-02T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-02T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch404 nine thousand nine hundred thirty second duration rounds to one hundred sixty six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9930000).toISOString();
      const report = buildCanaryReport({
        version: '25.213.1',
        targetVersion: '25.212.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(166);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 405 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch405-${index}` },
  ] as const))(
    'generated batch405 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.214.0',
        targetVersion: '25.213.0',
        startedAt: '2026-12-03T03:00:00.000Z',
        endedAt: '2026-12-03T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-03T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch405 nine thousand nine hundred ninety second duration rounds to one hundred sixty seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 9990000).toISOString();
      const report = buildCanaryReport({
        version: '25.214.1',
        targetVersion: '25.213.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(167);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 406 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch406-${index}` },
  ] as const))(
    'generated batch406 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.215.0',
        targetVersion: '25.214.0',
        startedAt: '2026-12-04T03:00:00.000Z',
        endedAt: '2026-12-04T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-04T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch406 ten thousand fifty second duration rounds to one hundred sixty eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10050000).toISOString();
      const report = buildCanaryReport({
        version: '25.215.1',
        targetVersion: '25.214.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(168);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 407 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch407-${index}` },
  ] as const))(
    'generated batch407 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.216.0',
        targetVersion: '25.215.0',
        startedAt: '2026-12-05T03:00:00.000Z',
        endedAt: '2026-12-05T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-05T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch407 ten thousand one hundred ten second duration rounds to one hundred sixty nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10110000).toISOString();
      const report = buildCanaryReport({
        version: '25.216.1',
        targetVersion: '25.215.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(169);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 408 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch408-${index}` },
  ] as const))(
    'generated batch408 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.217.0',
        targetVersion: '25.216.0',
        startedAt: '2026-12-06T03:00:00.000Z',
        endedAt: '2026-12-06T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-06T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch408 ten thousand one hundred seventy second duration rounds to one hundred seventy minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10170000).toISOString();
      const report = buildCanaryReport({
        version: '25.217.1',
        targetVersion: '25.216.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(170);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 409 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch409-${index}` },
  ] as const))(
    'generated batch409 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.218.0',
        targetVersion: '25.217.0',
        startedAt: '2026-12-07T03:00:00.000Z',
        endedAt: '2026-12-07T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-07T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch409 ten thousand two hundred thirty second duration rounds to one hundred seventy one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10230000).toISOString();
      const report = buildCanaryReport({
        version: '25.218.1',
        targetVersion: '25.217.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(171);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 410 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch410-${index}` },
  ] as const))(
    'generated batch410 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.219.0',
        targetVersion: '25.218.0',
        startedAt: '2026-12-08T03:00:00.000Z',
        endedAt: '2026-12-08T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-08T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch410 ten thousand two hundred ninety second duration rounds to one hundred seventy two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10290000).toISOString();
      const report = buildCanaryReport({
        version: '25.219.1',
        targetVersion: '25.218.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(172);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 411 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch411-${index}` },
  ] as const))(
    'generated batch411 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.220.0',
        targetVersion: '25.219.0',
        startedAt: '2026-12-09T03:00:00.000Z',
        endedAt: '2026-12-09T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-09T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch411 ten thousand three hundred fifty second duration rounds to one hundred seventy three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10350000).toISOString();
      const report = buildCanaryReport({
        version: '25.220.1',
        targetVersion: '25.219.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(173);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 412 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch412-${index}` },
  ] as const))(
    'generated batch412 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.221.0',
        targetVersion: '25.220.0',
        startedAt: '2026-12-10T03:00:00.000Z',
        endedAt: '2026-12-10T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-10T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch412 ten thousand four hundred ten second duration rounds to one hundred seventy four minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10410000).toISOString();
      const report = buildCanaryReport({
        version: '25.221.1',
        targetVersion: '25.220.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(174);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 413 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new AggregateError([], `FAIL-${index}`) as unknown as 'FAIL', note: `batch413-${index}` },
  ] as const))(
    'generated batch413 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.222.0',
        targetVersion: '25.221.0',
        startedAt: '2026-12-11T03:00:00.000Z',
        endedAt: '2026-12-11T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-11T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch413 ten thousand four hundred seventy second duration rounds to one hundred seventy five minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10470000).toISOString();
      const report = buildCanaryReport({
        version: '25.222.1',
        targetVersion: '25.221.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(175);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 414 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch414-${index}` },
  ] as const))(
    'generated batch414 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.223.0',
        targetVersion: '25.222.0',
        startedAt: '2026-12-12T03:00:00.000Z',
        endedAt: '2026-12-12T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-12T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch414 ten thousand five hundred thirty second duration rounds to one hundred seventy six minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10530000).toISOString();
      const report = buildCanaryReport({
        version: '25.223.1',
        targetVersion: '25.222.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(176);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 415 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new RangeError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch415-${index}` },
  ] as const))(
    'generated batch415 RangeError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.224.0',
        targetVersion: '25.223.0',
        startedAt: '2026-12-13T03:00:00.000Z',
        endedAt: '2026-12-13T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-13T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch415 ten thousand five hundred ninety second duration rounds to one hundred seventy seven minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10590000).toISOString();
      const report = buildCanaryReport({
        version: '25.224.1',
        targetVersion: '25.223.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(177);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 416 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new SyntaxError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch416-${index}` },
  ] as const))(
    'generated batch416 SyntaxError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.225.0',
        targetVersion: '25.224.0',
        startedAt: '2026-12-14T03:00:00.000Z',
        endedAt: '2026-12-14T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-14T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch416 ten thousand six hundred fifty second duration rounds to one hundred seventy eight minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10650000).toISOString();
      const report = buildCanaryReport({
        version: '25.225.1',
        targetVersion: '25.224.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(178);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 417 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new URIError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch417-${index}` },
  ] as const))(
    'generated batch417 URIError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.226.0',
        targetVersion: '25.225.0',
        startedAt: '2026-12-15T03:00:00.000Z',
        endedAt: '2026-12-15T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-15T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch417 ten thousand seven hundred ten second duration rounds to one hundred seventy nine minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10710000).toISOString();
      const report = buildCanaryReport({
        version: '25.226.1',
        targetVersion: '25.225.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(179);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 418 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new ReferenceError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch418-${index}` },
  ] as const))(
    'generated batch418 ReferenceError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.227.0',
        targetVersion: '25.226.0',
        startedAt: '2026-12-16T03:00:00.000Z',
        endedAt: '2026-12-16T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-16T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch418 ten thousand seven hundred seventy second duration rounds to one hundred eighty minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10770000).toISOString();
      const report = buildCanaryReport({
        version: '25.227.1',
        targetVersion: '25.226.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(180);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 419 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new EvalError(`FAIL-${index}`) as unknown as 'FAIL', note: `batch419-${index}` },
  ] as const))(
    'generated batch419 EvalError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.228.0',
        targetVersion: '25.227.0',
        startedAt: '2026-12-17T03:00:00.000Z',
        endedAt: '2026-12-17T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-17T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch419 ten thousand eight hundred thirty second duration rounds to one hundred eighty one minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10830000).toISOString();
      const report = buildCanaryReport({
        version: '25.228.1',
        targetVersion: '25.227.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(181);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 420 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new AggregateError([`err-${index}`], `FAIL-${index}`) as unknown as 'FAIL', note: `batch420-${index}` },
  ] as const))(
    'generated batch420 AggregateError failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.229.0',
        targetVersion: '25.228.0',
        startedAt: '2026-12-18T03:00:00.000Z',
        endedAt: '2026-12-18T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-18T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch420 ten thousand eight hundred ninety second duration rounds to one hundred eighty two minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10890000).toISOString();
      const report = buildCanaryReport({
        version: '25.229.1',
        targetVersion: '25.228.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(182);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});

describe('canary report batch 421 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { id: 'canary_5', status: new Error(`FAIL-${index}`) as unknown as 'FAIL', note: `batch421-${index}` },
  ] as const))(
    'generated batch421 Error failed stage status is not treated as failure %#',
    (stage) => {
      const report = buildCanaryReport({
        version: '25.230.0',
        targetVersion: '25.229.0',
        startedAt: '2026-12-19T03:00:00.000Z',
        endedAt: '2026-12-19T03:01:00.000Z',
        stages: [stage as CanaryStageResult],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.firstFailedStage).toBeNull();
      expect(report.stages[0].status).toBe(stage.status);
      expect(report.recommendation).toBe('Archive the canary report and continue normal monitoring.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-19T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch421 ten thousand nine hundred fifty second duration rounds to one hundred eighty three minutes %s',
    (startedAt) => {
      const endedAt = new Date(new Date(startedAt).getTime() + 10950000).toISOString();
      const report = buildCanaryReport({
        version: '25.230.1',
        targetVersion: '25.229.1',
        startedAt,
        endedAt,
        stages: [{ id: 'full_rollout', status: 'PASS' }],
      });

      expect(report.status).toBe('COMPLETED');
      expect(report.durationMinutes).toBe(183);
      expect(report.firstFailedStage).toBeNull();
    },
  );
});
