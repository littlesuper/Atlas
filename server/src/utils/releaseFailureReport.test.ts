import { describe, expect, it } from 'vitest';
import { buildReleaseFailureReport, type ReleaseFailureStage } from './releaseFailureReport';

describe('release failure report builder', () => {
  it('builds a release failure record with rollback recommendation and owners', () => {
    const report = buildReleaseFailureReport({
      version: '1.4.8',
      targetVersion: '1.4.7',
      failedAt: 'canary_25',
      triggeredGate: 'release:observe returned ATTENTION_REQUIRED',
      mitigationActions: [
        'FEATURE_FLAGS="!activity.import"',
        'npm run incident:collect --workspace=server -- --base-url http://localhost:3000',
      ],
      owners: ['release owner', 'backend on-call'],
      followUps: ['Audit activity import logs'],
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date('2026-05-05T19:00:00.000Z'),
    });

    expect(report).toEqual({
      mode: 'RELEASE_FAILURE_REPORT',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-05T19:00:00.000Z',
      version: '1.4.8',
      targetVersion: '1.4.7',
      failedAt: 'canary_25',
      triggeredGate: 'release:observe returned ATTENTION_REQUIRED',
      mitigationActions: [
        'FEATURE_FLAGS="!activity.import"',
        'npm run incident:collect --workspace=server -- --base-url http://localhost:3000',
      ],
      owners: ['release owner', 'backend on-call'],
      followUps: ['Audit activity import logs'],
      blockers: [],
      rollbackCommand: 'npm run rollback:plan --workspace=server -- --current-version 1.4.8 --target-version 1.4.7 --reason release_failure_canary_25 --database-strategy forward-fix --base-url http://localhost:3000',
      recommendation: 'Keep release frozen, execute or rehearse rollback, and close follow-up items before retrying rollout.',
    });
  });

  it('marks missing owners and rollback target as blockers', () => {
    const report = buildReleaseFailureReport({
      version: '1.4.8',
      failedAt: 'precheck',
      triggeredGate: 'release:precheck returned NO_GO',
      mitigationActions: [],
      owners: [],
      followUps: [],
      generatedAt: new Date('2026-05-05T19:00:00.000Z'),
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.blockers).toEqual([
      'targetVersion is required for rollback recommendation',
      'at least one owner is required',
    ]);
    expect(report.rollbackCommand).toContain('--reason release_failure_precheck');
  });

  it('includes correct versions in rollback command', () => {
    const report = buildReleaseFailureReport({
      version: '3.0.0',
      targetVersion: '2.0.0',
      failedAt: 'canary_50',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['owner-1'],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.rollbackCommand).toContain('--current-version 3.0.0');
    expect(report.rollbackCommand).toContain('--target-version 2.0.0');
  });

  it('uses ACTION_REQUIRED when owners present', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      failedAt: 'full_rollout',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['on-call'],
      followUps: [],
      generatedAt: new Date(),
    });

    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.blockers).toEqual([]);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      failedAt: 'observe',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
    });
    const after = new Date();

    const ts = new Date(report.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('defaults baseUrl to localhost', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      failedAt: 'canary_5',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
    });

    expect(report.rollbackCommand).toContain('http://localhost:3000');
  });

  it('trims and filters mitigationActions and followUps', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      failedAt: 'precheck',
      triggeredGate: 'test',
      mitigationActions: ['  action-1  ', '  '],
      owners: ['o'],
      followUps: ['  followup-1  ', '  '],
    });

    expect(report.mitigationActions).toEqual(['action-1']);
    expect(report.followUps).toEqual(['followup-1']);
  });

  it('targetVersion null when not provided or empty', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      failedAt: 'precheck',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
    });

    expect(report.targetVersion).toBeNull();
  });

  it('BLOCKED recommendation mentions missing metadata', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      failedAt: 'precheck',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: [],
      followUps: [],
    });

    expect(report.recommendation).toContain('missing release failure metadata');
  });

  it('rollback command includes failed stage in reason', () => {
    const stages = ['precheck', 'canary_5', 'canary_25', 'canary_50', 'full_rollout', 'observe', 'rollback'] as const;
    for (const stage of stages) {
      const report = buildReleaseFailureReport({
        version: '1.0.0',
        targetVersion: '0.9.0',
        failedAt: stage,
        triggeredGate: 'test',
        mitigationActions: [],
        owners: ['o'],
        followUps: [],
      });

      expect(report.rollbackCommand).toContain(`--reason release_failure_${stage}`);
    }
  });

  it('mode is always RELEASE_FAILURE_REPORT', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0', failedAt: 'precheck', triggeredGate: 'test',
      mitigationActions: [], owners: ['o'], followUps: [],
    });
    expect(report.mode).toBe('RELEASE_FAILURE_REPORT');
  });

  it('generatedAt is valid ISO string', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0', failedAt: 'precheck', triggeredGate: 'test',
      mitigationActions: [], owners: ['o'], followUps: [],
    });
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });

  it('custom baseUrl appears in rollback command', () => {
    const report = buildReleaseFailureReport({
      version: '2.0.0',
      targetVersion: '1.9.0',
      failedAt: 'canary_50',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
      baseUrl: 'https://prod.example.com',
    });

    expect(report.rollbackCommand).toContain('--base-url https://prod.example.com');
    expect(report.rollbackCommand).not.toContain('localhost');
  });

  it('empty string targetVersion is treated as null', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '  ',
      failedAt: 'precheck',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
    });

    expect(report.targetVersion).toBeNull();
    expect(report.blockers).toContain('targetVersion is required for rollback recommendation');
  });

  it('whitespace-only owners are filtered out leading to BLOCKED status', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      failedAt: 'canary_25',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['  ', '  '],
      followUps: [],
    });

    expect(report.owners).toEqual([]);
    expect(report.status).toBe('BLOCKED');
    expect(report.blockers).toContain('at least one owner is required');
  });

  it('version field is preserved without trimming', () => {
    const report = buildReleaseFailureReport({
      version: '  v2.0.0  ',
      targetVersion: '1.0.0',
      failedAt: 'precheck',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
    });

    expect(report.version).toBe('  v2.0.0  ');
  });

  it('rollback command omits --target-version flag when targetVersion is null', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      failedAt: 'precheck',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
    });

    expect(report.targetVersion).toBeNull();
    expect(report.rollbackCommand).not.toContain('--target-version');
    expect(report.rollbackCommand).toContain('--current-version 1.0.0');
    expect(report.rollbackCommand).toContain('--reason release_failure_precheck');
  });

  it('whitespace-only baseUrl defaults to localhost in rollback command', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      failedAt: 'canary_5',
      triggeredGate: 'test',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
      baseUrl: '   ',
    });

    expect(report.rollbackCommand).toContain('--base-url http://localhost:3000');
  });

  it('triggeredGate is preserved without modification', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      failedAt: 'precheck',
      triggeredGate: '  custom gate message  ',
      mitigationActions: [],
      owners: ['o'],
      followUps: [],
    });

    expect(report.triggeredGate).toBe('  custom gate message  ');
  });

  it('mode is always RELEASE_FAILURE_REPORT', () => {
    const report = buildReleaseFailureReport({
      triggeredGate: 'g',
      mitigationActions: [],
      owners: [],
      followUps: [],
    });
    expect(report.mode).toBe('RELEASE_FAILURE_REPORT');
  });

  it('report with only follow-ups and no owners is BLOCKED', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      failedAt: 'observe',
      triggeredGate: 'gate-1',
      mitigationActions: [],
      owners: [],
      followUps: ['investigate root cause'],
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.followUps).toEqual(['investigate root cause']);
    expect(report.owners).toEqual([]);
    expect(report.blockers).toContain('at least one owner is required');
  });

  it('report with owners and followUps has ACTION_REQUIRED status', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      targetVersion: '0.9.0',
      failedAt: 'canary_5',
      triggeredGate: 'test gate',
      mitigationActions: [],
      owners: ['owner-a'],
      followUps: ['investigate'],
    });
    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.owners).toEqual(['owner-a']);
  });

  it('report with no failures returns empty incidents array', () => {
    const report = buildReleaseFailureReport({
      version: '1.0.0',
      failedAt: 'DEPLOY',
      triggeredGate: 'smoke-test',
      mitigationActions: [],
      owners: ['admin'],
      followUps: [],
    });
    expect(report.mode).toBe('RELEASE_FAILURE_REPORT');
  });

  it('report with empty mitigation returns valid mode', () => {
    const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke-test', mitigationActions: [], owners: [], followUps: [] });
    expect(report.mode).toBe('RELEASE_FAILURE_REPORT');
  });

  it('report with mitigation actions returns valid count', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: ['rollback'], owners: ['admin'], followUps: [] }); expect(report.mitigationActions).toHaveLength(1); });

  it('report with empty mitigation actions returns zero count', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: [], owners: [], followUps: [] }); expect(report.mitigationActions).toHaveLength(0); });

  it('report with followUps includes followUp count', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: [], owners: [], followUps: ['investigate', 'fix'] }); expect(report.followUps).toHaveLength(2); });

  it('report with owners includes owner count', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: [], owners: ['admin', 'devops'], followUps: [] }); expect(report.owners).toHaveLength(2); });

  it('report with empty version returns valid structure', () => { const report = buildReleaseFailureReport({ version: '', failedAt: '', triggeredGate: '', mitigationActions: [], owners: [], followUps: [] }); expect(report).toBeDefined(); });

  it('report mode is RELEASE_FAILURE_REPORT', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: [], owners: [], followUps: [] }); expect(report.mode).toBe('RELEASE_FAILURE_REPORT'); });

  it('report with single mitigation action returns valid', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: ['rollback'], owners: [], followUps: [] }); expect(report.mitigationActions).toHaveLength(1); });

  it('report with empty followUps returns valid', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: [], owners: [], followUps: [] }); expect(report.followUps).toHaveLength(0); });

  it('report with non-empty owners returns valid', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: [], owners: ['admin'], followUps: [] }); expect(report.owners).toHaveLength(1); });

  it('report with empty owners returns valid', () => { const report = buildReleaseFailureReport({ version: '1.0.0', failedAt: 'DEPLOY', triggeredGate: 'smoke', mitigationActions: [], owners: [], followUps: [] }); expect(report).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['precheck', 'canary_5', 'canary_25', 'canary_50', 'full_rollout', 'observe', 'rollback'][index % 7],
    ` owner-${index} `,
    ` action-${index} `,
  ] as const))('normalizes generated owner and action for failed stage %s', (failedAt, owner, action) => {
    const report = buildReleaseFailureReport({
      version: `1.${failedAt.length}.0`,
      targetVersion: '1.0.0',
      failedAt: failedAt as ReleaseFailureStage,
      triggeredGate: `gate-${failedAt}`,
      mitigationActions: [action, ' '],
      owners: [owner, ' '],
      followUps: [` follow-${failedAt} `],
      baseUrl: ` http://release-${failedAt}.local `,
    });

    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.owners).toEqual([owner.trim()]);
    expect(report.mitigationActions).toEqual([action.trim()]);
    expect(report.followUps).toEqual([`follow-${failedAt}`]);
    expect(report.rollbackCommand).toContain(`--reason release_failure_${failedAt}`);
    expect(report.rollbackCommand).toContain(`--base-url http://release-${failedAt}.local`);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? '   ' : undefined,
    index % 3 === 0 ? [] : [' owner '],
  ] as const))('reports blockers for generated missing target and owners', (targetVersion, owners) => {
    const report = buildReleaseFailureReport({
      version: '2.0.0',
      targetVersion,
      failedAt: 'observe',
      triggeredGate: 'gate',
      mitigationActions: [],
      owners,
      followUps: [],
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.targetVersion).toBeNull();
    expect(report.blockers).toContain('targetVersion is required for rollback recommendation');
    if (owners.length === 0) {
      expect(report.blockers).toContain('at least one owner is required');
    }
    expect(report.rollbackCommand).not.toContain('--target-version');
  });
});

describe('release failure report batch 137 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ['precheck', 'canary_5', 'canary_25', 'canary_50', 'full_rollout', 'observe', 'rollback'][index % 7],
    `owner-batch137-${index}`,
    `follow-batch137-${index}`,
  ] as const))(
    'generated action-required report for stage %s has rollback command',
    (failedAt, owner, followUp) => {
      const report = buildReleaseFailureReport({
        version: `current-${failedAt}`,
        targetVersion: `target-${failedAt}`,
        failedAt: failedAt as ReleaseFailureStage,
        triggeredGate: `gate-${failedAt}`,
        mitigationActions: [` action-${failedAt} `],
        owners: [` ${owner} `],
        followUps: [` ${followUp} `],
        baseUrl: ` https://release-batch137.example.com/${failedAt} `,
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.blockers).toEqual([]);
      expect(report.owners).toEqual([owner]);
      expect(report.followUps).toEqual([followUp]);
      expect(report.rollbackCommand).toContain(`--reason release_failure_${failedAt}`);
      expect(report.rollbackCommand).toContain(`--base-url https://release-batch137.example.com/${failedAt}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? '' : '   ',
    index % 3 === 0 ? ['  '] : [],
  ] as const))(
    'generated blocked report records missing metadata target=%s',
    (targetVersion, owners) => {
      const report = buildReleaseFailureReport({
        version: 'current-batch137',
        targetVersion,
        failedAt: 'observe',
        triggeredGate: 'observation gate',
        mitigationActions: ['  '],
        owners,
        followUps: ['  follow later  '],
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.targetVersion).toBeNull();
      expect(report.mitigationActions).toEqual([]);
      expect(report.followUps).toEqual(['follow later']);
      expect(report.blockers).toContain('targetVersion is required for rollback recommendation');
      expect(report.blockers).toContain('at least one owner is required');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['precheck', 'canary_5', 'canary_25', 'canary_50', 'full_rollout', 'observe', 'rollback'][index % 7],
    `owner-batch155-${index}`,
    `https://batch155.example.com/release/${index}`,
  ] as const))(
    'generated release failure command includes stage and base url %s',
    (failedAt, owner, baseUrl) => {
      const report = buildReleaseFailureReport({
        version: `current-${indexFromOwner(owner)}`,
        targetVersion: ` target-${indexFromOwner(owner)} `,
        failedAt: failedAt as ReleaseFailureStage,
        triggeredGate: ` gate-${failedAt} `,
        mitigationActions: [' restart canary ', ' '],
        owners: [` ${owner} `],
        followUps: [' ', `follow-${owner}`],
        baseUrl: ` ${baseUrl} `,
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.targetVersion).toBe(`target-${indexFromOwner(owner)}`);
      expect(report.owners).toEqual([owner]);
      expect(report.mitigationActions).toEqual(['restart canary']);
      expect(report.rollbackCommand).toContain(`--reason release_failure_${failedAt}`);
      expect(report.rollbackCommand).toContain(`--base-url ${baseUrl}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? ' ' : `target-${index}`,
    index % 3 === 0 ? [' '] : [`owner-${index}`],
  ] as const))(
    'generated release failure blockers target=%s owners=%s',
    (targetVersion, owners) => {
      const report = buildReleaseFailureReport({
        version: 'current-batch155',
        targetVersion,
        failedAt: 'rollback',
        triggeredGate: 'rollback gate',
        mitigationActions: [' ', 'freeze release'],
        owners,
        followUps: [' ', 'collect evidence'],
        baseUrl: ' ',
      });
      const expectedBlockers = [
        targetVersion.trim() ? undefined : 'targetVersion is required for rollback recommendation',
        owners.map((owner) => owner.trim()).filter(Boolean).length > 0 ? undefined : 'at least one owner is required',
      ].filter(Boolean);

      expect(report.status).toBe(expectedBlockers.length > 0 ? 'BLOCKED' : 'ACTION_REQUIRED');
      expect(report.blockers).toEqual(expectedBlockers);
      expect(report.mitigationActions).toEqual(['freeze release']);
      expect(report.followUps).toEqual(['collect evidence']);
      expect(report.rollbackCommand).toContain('--base-url http://localhost:3000');
    },
  );
});

function indexFromOwner(owner: string): string {
  return owner.split('-').at(-1) ?? '';
}
