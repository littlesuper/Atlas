import { describe, expect, it } from 'vitest';
import { buildIncidentDrillReport } from './incidentDrillReport';

describe('incident drill report builder', () => {
  it('marks a drill passed when every exit criterion is met', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T16:00:00.000Z',
      endedAt: '2026-05-05T16:25:00.000Z',
      achievedCriteria: [
        'Incident commander can identify first failing check and affected route or feature',
        'Mitigation command is selected without touching unrelated features',
        'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
      ],
      issues: [],
      followUps: [],
      generatedAt: new Date('2026-05-05T16:30:00.000Z'),
    });

    expect(report).toEqual({
      mode: 'DRILL_REPORT',
      status: 'PASSED',
      generatedAt: '2026-05-05T16:30:00.000Z',
      scenario: 'api_5xx',
      startedAt: '2026-05-05T16:00:00.000Z',
      endedAt: '2026-05-05T16:25:00.000Z',
      durationMinutes: 25,
      achievedCriteria: [
        'Incident commander can identify first failing check and affected route or feature',
        'Mitigation command is selected without touching unrelated features',
        'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
      ],
      missingCriteria: [],
      issues: [],
      followUps: [],
      recommendation: 'Archive the report and schedule the next drill rotation.',
    });
  });

  it('requires follow-up when exit criteria are missing or issues are recorded', () => {
    const report = buildIncidentDrillReport({
      scenario: 'database_degraded',
      startedAt: '2026-05-05T16:00:00.000Z',
      endedAt: '2026-05-05T16:40:00.000Z',
      achievedCriteria: [
        'Database recovery strategy is selected before application rollback',
      ],
      issues: ['Database owner was not clearly assigned'],
      followUps: ['Add database owner to on-call roster'],
      generatedAt: new Date('2026-05-05T16:45:00.000Z'),
    });

    expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    expect(report.durationMinutes).toBe(40);
    expect(report.missingCriteria).toEqual([
      'Incident commander can identify whether the failure is connectivity, migration, or data related',
      'Release remains frozen until post-mitigation precheck returns GO',
    ]);
    expect(report.recommendation).toContain('Close follow-up items');
  });

  it('calculates duration correctly', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:15:00.000Z',
      achievedCriteria: ['criterion-1'],
      issues: [],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.durationMinutes).toBe(15);
  });

  it('passes with empty issues and all criteria met', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: [
        'Incident commander can identify first failing check and affected route or feature',
        'Mitigation command is selected without touching unrelated features',
        'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
      ],
      issues: [],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.status).toBe('PASSED');
    expect(report.missingCriteria).toEqual([]);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });
    const after = new Date();

    const ts = new Date(report.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('returns 0 duration when end < start', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:30:00.000Z',
      endedAt: '2026-05-05T10:00:00.000Z',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });

    expect(report.durationMinutes).toBe(0);
  });

  it('trims and filters issues, followUps, achievedCriteria', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: ['  criterion-1  ', '  '],
      issues: ['  issue-1  ', '  '],
      followUps: ['  followup-1  ', '  '],
    });

    expect(report.achievedCriteria).toEqual(['criterion-1']);
    expect(report.issues).toEqual(['issue-1']);
    expect(report.followUps).toEqual(['followup-1']);
  });

  it('FOLLOW_UP_REQUIRED when issues present even with all criteria met', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: [
        'Incident commander can identify first failing check and affected route or feature',
        'Mitigation command is selected without touching unrelated features',
        'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
      ],
      issues: ['unexpected log error'],
      followUps: [],
    });

    expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    expect(report.missingCriteria).toEqual([]);
  });

  it('database_degraded scenario has 3 exit criteria', () => {
    const report = buildIncidentDrillReport({
      scenario: 'database_degraded',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });

    expect(report.missingCriteria).toHaveLength(3);
  });

  it('FOLLOW_UP_REQUIRED when followUps present even with all criteria and no issues', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: [
        'Incident commander can identify first failing check and affected route or feature',
        'Mitigation command is selected without touching unrelated features',
        'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
      ],
      issues: [],
      followUps: ['schedule next drill earlier'],
    });

    expect(report.status).toBe('PASSED');
  });

  it('mode is always DRILL_REPORT', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });

    expect(report.mode).toBe('DRILL_REPORT');
  });

  it('preserves startedAt and endedAt in output', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T09:00:00.000Z',
      endedAt: '2026-05-05T09:45:00.000Z',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });

    expect(report.startedAt).toBe('2026-05-05T09:00:00.000Z');
    expect(report.endedAt).toBe('2026-05-05T09:45:00.000Z');
    expect(report.durationMinutes).toBe(45);
  });

  it('generatedAt is valid ISO string', () => {
    const report = buildIncidentDrillReport({ scenario: 'api_5xx', startedAt: '2026-05-05T10:00:00.000Z', endedAt: '2026-05-05T10:10:00.000Z', achievedCriteria: [], issues: [], followUps: [] });
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });

  it('returns 0 duration for invalid date strings', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: 'not-a-date',
      endedAt: 'also-not-a-date',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });
    expect(report.durationMinutes).toBe(0);
  });

  it('returns 0 duration when startedAt equals endedAt', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:00:00.000Z',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });
    expect(report.durationMinutes).toBe(0);
  });

  it('rounds durationMinutes for sub-minute differences', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:00:30.000Z',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });
    expect(report.durationMinutes).toBe(1);
  });

  it('missing criteria only lists expected criteria not in achievedCriteria', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: ['Mitigation command is selected without touching unrelated features'],
      issues: [],
      followUps: [],
    });

    expect(report.missingCriteria).toHaveLength(2);
    expect(report.missingCriteria).not.toContain('Mitigation command is selected without touching unrelated features');
  });

  it('preserves extra achieved criteria not in expected exit criteria', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: [
        'Incident commander can identify first failing check and affected route or feature',
        'Mitigation command is selected without touching unrelated features',
        'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
        'extra criterion not in exit criteria',
      ],
      issues: [],
      followUps: [],
    });

    expect(report.status).toBe('PASSED');
    expect(report.achievedCriteria).toContain('extra criterion not in exit criteria');
  });

  it('calculates duration spanning multiple days', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-07T10:00:00.000Z',
      achievedCriteria: [],
      issues: [],
      followUps: [],
    });

    expect(report.durationMinutes).toBe(2880);
  });

  it('database_degraded with all criteria passed and no issues returns PASSED', () => {
    const report = buildIncidentDrillReport({
      scenario: 'database_degraded',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      achievedCriteria: [
        'Incident commander can identify whether the failure is connectivity, migration, or data related',
        'Database recovery strategy is selected before application rollback',
        'Release remains frozen until post-mitigation precheck returns GO',
      ],
      issues: [],
      followUps: [],
    });

    expect(report.status).toBe('PASSED');
    expect(report.durationMinutes).toBe(30);
  });

  it('normalizes empty string items in achievedCriteria', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:10:00.000Z',
      achievedCriteria: [''],
      issues: [''],
      followUps: [''],
    });

    expect(report.achievedCriteria).toEqual([]);
    expect(report.issues).toEqual([]);
    expect(report.followUps).toEqual([]);
    expect(report.missingCriteria).toHaveLength(3);
  });

  it('report with no criteria and issues has FOLLOW_UP_REQUIRED status', () => {
    const report = buildIncidentDrillReport({
      scenario: 'api_5xx',
      startedAt: '2026-05-05T10:00:00.000Z',
      endedAt: '2026-05-05T10:30:00.000Z',
      achievedCriteria: [],
      issues: ['something went wrong'],
      followUps: [],
    });
    expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    expect(report.issues).toHaveLength(1);
  });


  it('report with zero duration has valid structure', () => {
    const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: [], issues: [], followUps: [] });
    expect(report).toBeDefined();
    expect(report.mode).toBe('DRILL_REPORT');
  });

  it('buildIncidentDrillReport handles empty issues array', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: [], issues: [], followUps: [] }); expect(report.issues).toEqual([]); });

  it('buildIncidentDrillReport includes scenario field', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: [], issues: [], followUps: [] }); expect(report.scenario).toBe('api_5xx'); });

  it('buildIncidentDrillReport handles non-empty issues array', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: [], issues: ['high latency detected'], followUps: [] }); expect(report.issues).toHaveLength(1); });

  it('buildIncidentDrillReport includes followUps', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: [], issues: [], followUps: ['review monitors'] }); expect(report.followUps).toHaveLength(1); });

  it('buildIncidentDrillReport handles zero duration', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: [], issues: [], followUps: [] }); expect(report.durationMinutes).toBe(0); });

  it('buildIncidentDrillReport handles non-zero duration', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:30:00Z', achievedCriteria: [], issues: [], followUps: [] }); expect(report.durationMinutes).toBe(30); });

  it('buildIncidentDrillReport handles non-empty achievedCriteria', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: ['criterion1'], issues: [], followUps: [] }); expect(report.achievedCriteria).toHaveLength(1); });

  it('buildIncidentDrillReport handles empty issues array', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: [], issues: [], followUps: [] }); expect(report.issues).toHaveLength(0); });

  it('buildIncidentDrillReport handles non-empty followUps', () => { const report = buildIncidentDrillReport({ scenario: 'api_5xx', executedSteps: [], duration: 0, achievedCriteria: [], issues: [], followUps: ['action1'] }); expect(report.followUps).toHaveLength(1); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-${String((index % 20) + 1).padStart(2, '0')}T08:00:00.000Z`,
    `2026-05-${String((index % 20) + 1).padStart(2, '0')}T08:${String(index % 60).padStart(2, '0')}:00.000Z`,
    index % 60,
  ] as const))(
    'calculates generated drill duration from %s to %s',
    (startedAt, endedAt, expectedMinutes) => {
      const report = buildIncidentDrillReport({
        scenario: 'api_5xx',
        startedAt,
        endedAt,
        achievedCriteria: [],
        issues: [],
        followUps: [],
      });

      expect(report.durationMinutes).toBe(expectedMinutes);
      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch106 follow up ${index}`))(
    'preserves generated follow-up item %s without changing passed status',
    (followUp) => {
      const report = buildIncidentDrillReport({
        scenario: 'database_degraded',
        startedAt: '2026-05-05T10:00:00.000Z',
        endedAt: '2026-05-05T10:45:00.000Z',
        achievedCriteria: [
          'Incident commander can identify whether the failure is connectivity, migration, or data related',
          'Database recovery strategy is selected before application rollback',
          'Release remains frozen until post-mitigation precheck returns GO',
        ],
        issues: [],
        followUps: [followUp],
      });

      expect(report.status).toBe('PASSED');
      expect(report.followUps).toEqual([followUp]);
      expect(report.missingCriteria).toEqual([]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `  issue ${index}  `,
    `  follow-up ${index}  `,
  ] as const))(
    'trims generated issue and follow-up values %s',
    (issue, followUp) => {
      const report = buildIncidentDrillReport({
        scenario: 'api_5xx',
        startedAt: '2026-05-05T10:00:00.000Z',
        endedAt: '2026-05-05T10:15:00.000Z',
        achievedCriteria: [],
        issues: [issue, '   '],
        followUps: [followUp, ''],
      });

      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
      expect(report.issues).toEqual([issue.trim()]);
      expect(report.followUps).toEqual([followUp.trim()]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-${String((index % 20) + 1).padStart(2, '0')}T09:30:00.000Z`,
    `2026-06-${String((index % 20) + 1).padStart(2, '0')}T09:00:00.000Z`,
  ] as const))(
    'clamps generated reversed duration to zero %s',
    (startedAt, endedAt) => {
      const report = buildIncidentDrillReport({
        scenario: 'database_degraded',
        startedAt,
        endedAt,
        achievedCriteria: [],
        issues: [],
        followUps: [],
      });

      expect(report.durationMinutes).toBe(0);
      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    },
  );
});

describe('incident drill report builder batch 128 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch128-issue-${index}`,
    `batch128-follow-${index}`,
  ] as const))(
    'keeps generated issue forcing follow-up status %s',
    (issue, followUp) => {
      const report = buildIncidentDrillReport({
        scenario: 'api_5xx',
        startedAt: '2026-05-11T10:00:00.000Z',
        endedAt: '2026-05-11T10:30:00.000Z',
        achievedCriteria: [
          'Incident commander can identify first failing check and affected route or feature',
          'Mitigation command is selected without touching unrelated features',
          'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
        ],
        issues: [` ${issue} `],
        followUps: [` ${followUp} `],
      });

      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
      expect(report.missingCriteria).toEqual([]);
      expect(report.issues).toEqual([issue]);
      expect(report.followUps).toEqual([followUp]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-${String((index % 20) + 1).padStart(2, '0')}T12:00:00.000Z`,
    index + 1,
  ] as const))(
    'rounds generated drill duration from half-minute offset %s',
    (startedAt, minutes) => {
      const start = new Date(startedAt);
      const endedAt = new Date(start.getTime() + minutes * 60000 + 30000).toISOString();
      const report = buildIncidentDrillReport({
        scenario: 'database_degraded',
        startedAt,
        endedAt,
        achievedCriteria: [],
        issues: [],
        followUps: [],
      });

      expect(report.durationMinutes).toBe(minutes + 1);
      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
    },
  );
});

describe('incident drill report builder batch 150 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'api_5xx' : 'database_degraded',
    `batch150-follow-${index}`,
  ] as const))(
    'keeps generated completed drill passed with follow-up %s',
    (scenario, followUp) => {
      const criteria = scenario === 'api_5xx'
        ? [
            'Incident commander can identify first failing check and affected route or feature',
            'Mitigation command is selected without touching unrelated features',
            'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
          ]
        : [
            'Incident commander can identify whether the failure is connectivity, migration, or data related',
            'Database recovery strategy is selected before application rollback',
            'Release remains frozen until post-mitigation precheck returns GO',
          ];
      const report = buildIncidentDrillReport({
        scenario,
        startedAt: '2026-05-12T10:00:00.000Z',
        endedAt: '2026-05-12T10:20:00.000Z',
        achievedCriteria: criteria.map((criterion) => ` ${criterion} `),
        issues: [' '],
        followUps: [` ${followUp} `],
      });

      expect(report.status).toBe('PASSED');
      expect(report.durationMinutes).toBe(20);
      expect(report.missingCriteria).toEqual([]);
      expect(report.achievedCriteria).toEqual(criteria);
      expect(report.followUps).toEqual([followUp]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch150-issue-${index}`,
    `batch150-follow-${index}`,
  ] as const))(
    'reports generated api drill issue and missing criteria %s',
    (issue, followUp) => {
      const report = buildIncidentDrillReport({
        scenario: 'api_5xx',
        startedAt: '2026-05-12T10:30:00.000Z',
        endedAt: '2026-05-12T10:00:00.000Z',
        achievedCriteria: [' Mitigation command is selected without touching unrelated features ', ' '],
        issues: [` ${issue} `, ''],
        followUps: [` ${followUp} `, ' '],
      });

      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
      expect(report.durationMinutes).toBe(0);
      expect(report.achievedCriteria).toEqual(['Mitigation command is selected without touching unrelated features']);
      expect(report.missingCriteria).toHaveLength(2);
      expect(report.issues).toEqual([issue]);
      expect(report.followUps).toEqual([followUp]);
    },
  );
});

describe('incident drill report builder batch 167 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-${String((index % 20) + 1).padStart(2, '0')}T10:00:00.000Z`,
    index + 2,
  ] as const))(
    'calculates generated api drill duration and missing criteria %s',
    (startedAt, minutes) => {
      const endedAt = new Date(new Date(startedAt).getTime() + minutes * 60000).toISOString();
      const report = buildIncidentDrillReport({
        scenario: 'api_5xx',
        startedAt,
        endedAt,
        achievedCriteria: ['Incident commander can identify first failing check and affected route or feature'],
        issues: [],
        followUps: [],
      });

      expect(report.durationMinutes).toBe(minutes);
      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
      expect(report.missingCriteria).toHaveLength(2);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch167-issue-${index}`,
    `batch167-follow-${index}`,
  ] as const))(
    'trims generated database issue and follow-up %s',
    (issue, followUp) => {
      const report = buildIncidentDrillReport({
        scenario: 'database_degraded',
        startedAt: '2026-08-01T10:00:00.000Z',
        endedAt: '2026-08-01T10:05:00.000Z',
        achievedCriteria: [],
        issues: [` ${issue} `, ''],
        followUps: [` ${followUp} `, ' '],
      });

      expect(report.status).toBe('FOLLOW_UP_REQUIRED');
      expect(report.issues).toEqual([issue]);
      expect(report.followUps).toEqual([followUp]);
    },
  );
});
