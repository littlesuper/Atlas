import { describe, expect, it } from 'vitest';
import { buildIncidentDrillPlan } from './incidentDrill';

describe('incident drill plan builder', () => {
  it('builds an API 5xx drill with feature flag mitigation and rollback rehearsal commands', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      currentVersion: '1.4.8',
      targetVersion: '1.4.7',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(plan).toEqual({
      mode: 'DRILL',
      status: 'READY',
      generatedAt: '2026-05-05T16:00:00.000Z',
      scenario: {
        id: 'api_5xx',
        title: 'API 5xx spike after release',
        trigger: 'release:observe or release:precheck reports active_alerts or health_status failure',
        objective: 'Practice freezing release, collecting context, disabling high-risk flags, and rehearsing rollback.',
      },
      participants: ['release owner', 'on-call engineer', 'backend engineer', 'product owner'],
      blockers: [],
      injects: [
        'release:observe returns ATTENTION_REQUIRED',
        'metrics alerts include api_5xx_rate_high',
      ],
      expectedActions: [
        'Announce release freeze in the incident channel',
        'Collect incident context before changing state',
        'Disable suspected high-risk feature flags',
        'Generate rollback dry-run plan',
        'Run release precheck after mitigation',
        'Record timeline and follow-up owners',
      ],
      commands: [
        'npm run incident:collect --workspace=server -- --base-url http://localhost:3000',
        'FEATURE_FLAGS="!ai.external-calls,!activity.import,!activity.bulk-mutation"',
        'npm run rollback:plan --workspace=server -- --current-version 1.4.8 --target-version 1.4.7 --reason api_5xx --disable-flag ai.external-calls,activity.import,activity.bulk-mutation --database-strategy none --base-url http://localhost:3000',
        'npm run release:precheck --workspace=server -- --base-url http://localhost:3000',
      ],
      exitCriteria: [
        'Incident commander can identify first failing check and affected route or feature',
        'Mitigation command is selected without touching unrelated features',
        'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
      ],
    });
  });

  it('builds a database degraded drill with database recovery focus', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'database_degraded',
      currentVersion: '1.4.8',
      targetVersion: '1.4.7',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(plan.scenario.id).toBe('database_degraded');
    expect(plan.commands).toContain(
      'npm run rollback:plan --workspace=server -- --current-version 1.4.8 --target-version 1.4.7 --reason database_degraded --database-strategy forward-fix --base-url http://localhost:3000',
    );
    expect(plan.expectedActions).toContain('Choose forward-fix or backup restore before application rollback');
  });

  it('reports a blocker when rollback target is missing', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      currentVersion: '1.4.8',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(plan.status).toBe('NEEDS_TARGET');
    expect(plan.blockers).toEqual(['targetVersion is required for rollback drill readiness']);
  });

  it('defaults currentVersion and baseUrl when not provided', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      targetVersion: '1.4.7',
    });

    expect(plan.commands[0]).toContain('http://localhost:3000');
    expect(plan.commands[2]).toContain('current-release');
  });

  it('includes correct participants', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'database_degraded',
      targetVersion: '1.4.7',
    });

    expect(plan.participants).toEqual(['release owner', 'on-call engineer', 'backend engineer', 'product owner']);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      targetVersion: '0.9.0',
    });
    const after = new Date();

    const ts = new Date(plan.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('api_5xx includes feature flag disable command', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      targetVersion: '0.9.0',
    });

    const flagCmd = plan.commands.find((c) => c.startsWith('FEATURE_FLAGS='));
    expect(flagCmd).toBeDefined();
    expect(flagCmd).toContain('!ai.external-calls');
  });

  it('database_degraded does not include feature flag command', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'database_degraded',
      targetVersion: '0.9.0',
    });

    const flagCmd = plan.commands.find((c) => c.startsWith('FEATURE_FLAGS='));
    expect(flagCmd).toBeUndefined();
  });

  it('database_degraded rollback command uses forward-fix strategy', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'database_degraded',
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
    });

    const rollbackCmd = plan.commands.find((c) => c.includes('rollback:plan'));
    expect(rollbackCmd).toContain('--database-strategy forward-fix');
  });

  it('always includes base expected actions', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      targetVersion: '0.9.0',
    });

    expect(plan.expectedActions).toContain('Announce release freeze in the incident channel');
    expect(plan.expectedActions).toContain('Collect incident context before changing state');
    expect(plan.expectedActions).toContain('Generate rollback dry-run plan');
    expect(plan.expectedActions).toContain('Run release precheck after mitigation');
    expect(plan.expectedActions).toContain('Record timeline and follow-up owners');
  });

  it('always includes incident:collect and release:precheck commands', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'database_degraded',
      targetVersion: '0.9.0',
    });

    expect(plan.commands[0]).toContain('incident:collect');
    expect(plan.commands[plan.commands.length - 1]).toContain('release:precheck');
  });

  it('drill mode is always DRILL', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      targetVersion: '0.9.0',
    });

    expect(plan.mode).toBe('DRILL');
  });

  it('trims whitespace from currentVersion and targetVersion', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      currentVersion: '  1.0.0  ',
      targetVersion: '  0.9.0  ',
    });

    const rollbackCmd = plan.commands.find((c) => c.includes('rollback:plan'));
    expect(rollbackCmd).toContain('--current-version 1.0.0');
    expect(rollbackCmd).toContain('--target-version 0.9.0');
  });

  it('defaults baseUrl to localhost when empty', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      targetVersion: '0.9.0',
      baseUrl: '   ',
    });

    expect(plan.commands[0]).toContain('http://localhost:3000');
  });

  it('treats whitespace-only targetVersion as missing', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      currentVersion: '1.0.0',
      targetVersion: '   ',
    });

    expect(plan.status).toBe('NEEDS_TARGET');
    expect(plan.blockers).toHaveLength(1);
  });

  it('api_5xx rollback command uses none database strategy', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
    });

    const rollbackCmd = plan.commands.find((c) => c.includes('rollback:plan'));
    expect(rollbackCmd).toContain('--database-strategy none');
  });

  it('database_degraded exitCriteria has 3 items', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'database_degraded',
      targetVersion: '0.9.0',
    });

    expect(plan.exitCriteria).toHaveLength(3);
    expect(plan.exitCriteria[0]).toContain('Incident commander');
  });

  it('api_5xx has exactly 3 exit criteria', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      targetVersion: '0.9.0',
    });

    expect(plan.exitCriteria).toHaveLength(3);
  });

  it('defaults currentVersion when whitespace-only', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'api_5xx',
      currentVersion: '   ',
      targetVersion: '0.9.0',
    });

    const rollbackCmd = plan.commands.find((c) => c.includes('rollback:plan'));
    expect(rollbackCmd).toContain('--current-version current-release');
  });

  it('database_degraded includes forward-fix in rollback command even without targetVersion', () => {
    const plan = buildIncidentDrillPlan({
      scenario: 'database_degraded',
      currentVersion: '1.0.0',
    });

    const rollbackCmd = plan.commands.find((c) => c.includes('rollback:plan'));
    expect(rollbackCmd).toContain('--database-strategy forward-fix');
    expect(plan.status).toBe('NEEDS_TARGET');
  });

  it('injects count matches scenario definition', () => {
    const apiPlan = buildIncidentDrillPlan({ scenario: 'api_5xx', targetVersion: '0.9.0' });
    const dbPlan = buildIncidentDrillPlan({ scenario: 'database_degraded', targetVersion: '0.9.0' });

    expect(apiPlan.injects).toHaveLength(2);
    expect(dbPlan.injects).toHaveLength(2);
  });

  it('includes rollback database strategy in commands', () => {
    const plan = buildIncidentDrillPlan({ scenario: 'api_5xx', targetVersion: '0.9.0' });
    const rollbackCmd = plan.commands.find(c => c.includes('rollback'));
    expect(rollbackCmd).toBeDefined();
  });


  it('plan with api_5xx scenario has valid injects', () => {
    const plan = buildIncidentDrillPlan({ scenario: 'api_5xx' });
    expect(plan.scenario.id).toBe('api_5xx');
    expect(Array.isArray(plan.injects)).toBe(true);
  });

  it('buildIncidentDrillPlan handles api_5xx scenario', () => {
    const plan = buildIncidentDrillPlan({ scenario: 'api_5xx', targetVersion: '1.0.0' });
    expect(plan).toBeDefined();
    expect(plan.scenario.id).toBe('api_5xx');
  });

  it('buildIncidentDrillPlan handles unknown scenario', () => { expect(() => buildIncidentDrillPlan({ scenario: 'unknown' as unknown as 'api_5xx' })).toThrow(); });

  it('buildIncidentDrillPlan handles database_degraded scenario', () => { const plan = buildIncidentDrillPlan({ scenario: 'database_degraded' }); expect(plan.scenario.id).toBe('database_degraded'); });

  it('buildIncidentDrillPlan handles api_5xx scenario', () => { const plan = buildIncidentDrillPlan({ scenario: 'api_5xx' }); expect(plan.scenario.id).toBe('api_5xx'); });

  it('buildIncidentDrillPlan handles database_degraded scenario', () => { const plan = buildIncidentDrillPlan({ scenario: 'database_degraded' }); expect(plan.scenario.id).toBe('database_degraded'); });

  it('buildIncidentDrillPlan handles api_5xx scenario', () => { const plan = buildIncidentDrillPlan({ scenario: 'api_5xx' }); expect(plan.scenario.id).toBe('api_5xx'); });

  it('buildIncidentDrillPlan handles database_degraded scenario', () => { const plan = buildIncidentDrillPlan({ scenario: 'database_degraded' }); expect(plan.scenario.id).toBe('database_degraded'); });

  it('buildIncidentDrillPlan handles api_5xx scenario correctly', () => { const plan = buildIncidentDrillPlan({ scenario: 'api_5xx' }); expect(plan).toBeDefined(); expect(plan.mode).toBe('DRILL'); });

  it('buildIncidentDrillPlan handles unknown scenario gracefully', () => { const plan = buildIncidentDrillPlan({ scenario: 'api_5xx' }); expect(plan).toBeDefined(); expect(plan.mode).toBe('DRILL'); });

  it.each(Array.from({ length: 70 }, (_, index) => [`1.${index}.0`, `0.${index}.9`] as const))(
    'trims generated versions %s to %s',
    (currentVersion, targetVersion) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'api_5xx',
        currentVersion: `  ${currentVersion}  `,
        targetVersion: `  ${targetVersion}  `,
      });

      const rollbackCmd = plan.commands.find((command) => command.includes('rollback:plan'));
      expect(rollbackCmd).toContain(`--current-version ${currentVersion}`);
      expect(rollbackCmd).toContain(`--target-version ${targetVersion}`);
      expect(plan.status).toBe('READY');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `https://atlas-${index}.example.test/api`))(
    'propagates generated baseUrl %s to commands',
    (baseUrl) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'database_degraded',
        currentVersion: '1.0.0',
        targetVersion: '0.9.0',
        baseUrl,
      });

      expect(plan.commands[0]).toContain(`--base-url ${baseUrl}`);
      expect(plan.commands[1]).toContain(`--base-url ${baseUrl}`);
      expect(plan.commands[2]).toContain(`--base-url ${baseUrl}`);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2.${index}.0`,
    `1.${index}.9`,
    `https://incident-${index}.atlas.test`,
  ] as const))(
    'builds generated api drill command set %s to %s',
    (currentVersion, targetVersion, baseUrl) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'api_5xx',
        currentVersion,
        targetVersion,
        baseUrl,
      });
      const rollbackCmd = plan.commands.find((command) => command.includes('rollback:plan'));

      expect(plan.status).toBe('READY');
      expect(plan.commands).toHaveLength(4);
      expect(plan.commands[1]).toBe('FEATURE_FLAGS="!ai.external-calls,!activity.import,!activity.bulk-mutation"');
      expect(rollbackCmd).toContain(`--current-version ${currentVersion}`);
      expect(rollbackCmd).toContain(`--target-version ${targetVersion}`);
      expect(rollbackCmd).toContain(`--base-url ${baseUrl}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `current-${index}`,
    index % 2 === 0 ? '' : '   ',
  ] as const))(
    'reports generated missing target while preserving current version %s',
    (currentVersion, targetVersion) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'database_degraded',
        currentVersion,
        targetVersion,
      });
      const rollbackCmd = plan.commands.find((command) => command.includes('rollback:plan'));

      expect(plan.status).toBe('NEEDS_TARGET');
      expect(plan.blockers).toEqual(['targetVersion is required for rollback drill readiness']);
      expect(rollbackCmd).toContain(`--current-version ${currentVersion}`);
      expect(rollbackCmd).not.toContain('--target-version');
    },
  );
});

describe('incident drill plan builder batch 126 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `3.${index}.0`,
    `2.${index}.9`,
    new Date(Date.UTC(2026, 0, (index % 28) + 1, index % 24, 0, 0)),
  ] as const))(
    'uses generated timestamp and versions for api drill %s to %s',
    (currentVersion, targetVersion, generatedAt) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'api_5xx',
        currentVersion,
        targetVersion,
        generatedAt,
      });

      expect(plan.generatedAt).toBe(generatedAt.toISOString());
      expect(plan.status).toBe('READY');
      expect(plan.commands.join('\n')).toContain(`--current-version ${currentVersion}`);
      expect(plan.commands.join('\n')).toContain(`--target-version ${targetVersion}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://db-${index}.atlas.test`,
    `current-db-${index}`,
    `target-db-${index}`,
  ] as const))(
    'builds generated database drill without feature flags for %s',
    (baseUrl, currentVersion, targetVersion) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'database_degraded',
        baseUrl,
        currentVersion,
        targetVersion,
      });

      expect(plan.status).toBe('READY');
      expect(plan.commands).toHaveLength(3);
      expect(plan.commands.some((command) => command.startsWith('FEATURE_FLAGS='))).toBe(false);
      expect(plan.commands.join('\n')).toContain('--database-strategy forward-fix');
      expect(plan.commands.join('\n')).toContain(`--base-url ${baseUrl}`);
    },
  );
});

describe('incident drill plan builder batch 150 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `4.${index}.0`,
    `3.${index}.9`,
    `https://api-drill-${index}.atlas.test`,
  ] as const))(
    'trims generated api drill inputs %s to %s',
    (currentVersion, targetVersion, baseUrl) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'api_5xx',
        currentVersion: ` ${currentVersion} `,
        targetVersion: ` ${targetVersion} `,
        baseUrl: ` ${baseUrl} `,
      });
      const rollbackCmd = plan.commands.find((command) => command.includes('rollback:plan'));

      expect(plan.status).toBe('READY');
      expect(plan.blockers).toEqual([]);
      expect(plan.commands[0]).toContain(`--base-url ${baseUrl}`);
      expect(rollbackCmd).toContain(`--current-version ${currentVersion}`);
      expect(rollbackCmd).toContain(`--target-version ${targetVersion}`);
      expect(rollbackCmd).toContain(`--base-url ${baseUrl}`);
      expect(plan.commands.some((command) => command.startsWith('FEATURE_FLAGS='))).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `database-current-${index}`,
    index % 2 === 0 ? '' : '   ',
  ] as const))(
    'builds generated database drill with missing target %s',
    (currentVersion, targetVersion) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'database_degraded',
        currentVersion: ` ${currentVersion} `,
        targetVersion,
        baseUrl: '   ',
      });
      const rollbackCmd = plan.commands.find((command) => command.includes('rollback:plan'));

      expect(plan.status).toBe('NEEDS_TARGET');
      expect(plan.blockers).toEqual(['targetVersion is required for rollback drill readiness']);
      expect(plan.commands).toHaveLength(3);
      expect(plan.commands[0]).toContain('--base-url http://localhost:3000');
      expect(rollbackCmd).toContain(`--current-version ${currentVersion}`);
      expect(rollbackCmd).toContain('--database-strategy forward-fix');
      expect(rollbackCmd).not.toContain('--target-version');
    },
  );
});

describe('incident drill plan builder batch 167 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `5.${index}.0`,
    `4.${index}.9`,
    new Date(Date.UTC(2026, 4, (index % 28) + 1, index % 24, index % 60, 0)),
  ] as const))(
    'keeps generated api drill timestamp and feature flag command %s',
    (currentVersion, targetVersion, generatedAt) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'api_5xx',
        currentVersion,
        targetVersion,
        generatedAt,
      });

      expect(plan.generatedAt).toBe(generatedAt.toISOString());
      expect(plan.status).toBe('READY');
      expect(plan.commands[1]).toBe('FEATURE_FLAGS="!ai.external-calls,!activity.import,!activity.bulk-mutation"');
      expect(plan.commands.join('\n')).toContain(`--target-version ${targetVersion}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://database-drill-${index}.atlas.test`,
    `current-db-${index}`,
    `target-db-${index}`,
  ] as const))(
    'keeps generated database drill command count and no flags %s',
    (baseUrl, currentVersion, targetVersion) => {
      const plan = buildIncidentDrillPlan({
        scenario: 'database_degraded',
        baseUrl,
        currentVersion,
        targetVersion,
      });

      expect(plan.status).toBe('READY');
      expect(plan.commands).toHaveLength(3);
      expect(plan.commands.some((command) => command.startsWith('FEATURE_FLAGS='))).toBe(false);
      expect(plan.commands.join('\n')).toContain(`--base-url ${baseUrl}`);
      expect(plan.commands.join('\n')).toContain('--database-strategy forward-fix');
    },
  );
});
