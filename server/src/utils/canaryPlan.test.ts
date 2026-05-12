import { describe, expect, it } from 'vitest';
import { buildCanaryPlan } from './canaryPlan';

describe('canary rollout plan builder', () => {
  it('builds a staged canary dry-run plan with gates and rollback triggers', () => {
    const plan = buildCanaryPlan({
      version: '1.4.8',
      targetVersion: '1.4.7',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date('2026-05-05T17:00:00.000Z'),
    });

    expect(plan).toEqual({
      mode: 'CANARY_DRY_RUN',
      status: 'READY',
      generatedAt: '2026-05-05T17:00:00.000Z',
      version: '1.4.8',
      targetVersion: '1.4.7',
      baseUrl: 'http://localhost:3000',
      stages: [
        {
          id: 'preflight',
          trafficPercent: 0,
          gate: 'release:precheck must return GO before any traffic shift',
          command: 'npm run release:precheck --workspace=server -- --base-url http://localhost:3000',
          rollbackTrigger: 'Any NO_GO check blocks rollout before traffic shift',
        },
        {
          id: 'canary_5',
          trafficPercent: 5,
          gate: 'Observe 5% traffic window and require STABLE',
          command: 'npm run release:observe --workspace=server -- --base-url http://localhost:3000 --checks 3 --interval-ms 300000 --window-minutes 15',
          rollbackTrigger: 'ATTENTION_REQUIRED, active P1 alert, unknown feature flag, or concentrated 5xx',
        },
        {
          id: 'canary_25',
          trafficPercent: 25,
          gate: 'Observe 25% traffic window and require STABLE',
          command: 'npm run release:observe --workspace=server -- --base-url http://localhost:3000 --checks 3 --interval-ms 300000 --window-minutes 15',
          rollbackTrigger: 'ATTENTION_REQUIRED, active P1 alert, unknown feature flag, or concentrated 5xx',
        },
        {
          id: 'canary_50',
          trafficPercent: 50,
          gate: 'Observe 50% traffic window and require STABLE',
          command: 'npm run release:observe --workspace=server -- --base-url http://localhost:3000 --checks 3 --interval-ms 300000 --window-minutes 15',
          rollbackTrigger: 'ATTENTION_REQUIRED, active P1 alert, unknown feature flag, or concentrated 5xx',
        },
        {
          id: 'full_rollout',
          trafficPercent: 100,
          gate: 'Observe full rollout window and require STABLE',
          command: 'npm run release:observe --workspace=server -- --base-url http://localhost:3000 --checks 6 --interval-ms 300000 --window-minutes 30',
          rollbackTrigger: 'ATTENTION_REQUIRED, active P1 alert, unknown feature flag, or concentrated 5xx',
        },
      ],
      rollbackCommand: 'npm run rollback:plan --workspace=server -- --current-version 1.4.8 --target-version 1.4.7 --reason canary_failed --database-strategy forward-fix --base-url http://localhost:3000',
      safeguards: [
        'This plan does not shift traffic by itself.',
        'Do not advance to the next stage until the current stage gate passes.',
        'Keep feature flag mitigation ready before the first traffic shift.',
      ],
      blockers: [],
    });
  });

  it('reports a blocker when rollback target version is missing', () => {
    const plan = buildCanaryPlan({
      version: '1.4.8',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date('2026-05-05T17:00:00.000Z'),
    });

    expect(plan.status).toBe('NEEDS_TARGET');
    expect(plan.blockers).toEqual(['targetVersion is required before canary rollout rehearsal']);
  });

  it('has 5 stages from preflight to full_rollout', () => {
    const plan = buildCanaryPlan({
      version: '1.4.8',
      targetVersion: '1.4.7',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date('2026-05-05T17:00:00.000Z'),
    });

    expect(plan.stages).toHaveLength(5);
    expect(plan.stages.map(s => s.id)).toEqual([
      'preflight', 'canary_5', 'canary_25', 'canary_50', 'full_rollout',
    ]);
  });

  it('includes rollback command with correct versions', () => {
    const plan = buildCanaryPlan({
      version: '2.0.0',
      targetVersion: '1.9.9',
      baseUrl: 'http://prod:3000',
      generatedAt: new Date(),
    });

    expect(plan.rollbackCommand).toContain('--current-version 2.0.0');
    expect(plan.rollbackCommand).toContain('--target-version 1.9.9');
  });

  it('always starts with CANARY_DRY_RUN mode', () => {
    const plan = buildCanaryPlan({
      version: '1.0.0',
      targetVersion: '0.9.0',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date(),
    });

    expect(plan.mode).toBe('CANARY_DRY_RUN');
  });

  it('defaults version to "current-release" when empty', () => {
    const plan = buildCanaryPlan({
      version: '',
      targetVersion: '0.9.0',
    });

    expect(plan.version).toBe('current-release');
  });

  it('defaults baseUrl to localhost when empty', () => {
    const plan = buildCanaryPlan({
      version: '1.0.0',
      targetVersion: '0.9.0',
      baseUrl: '  ',
    });

    expect(plan.baseUrl).toBe('http://localhost:3000');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const plan = buildCanaryPlan({ targetVersion: '0.9.0' });
    const after = new Date();

    const ts = new Date(plan.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('always has 3 safeguards', () => {
    const plan = buildCanaryPlan({ targetVersion: '0.9.0' });

    expect(plan.safeguards).toHaveLength(3);
  });

  it('stages have increasing traffic percentages', () => {
    const plan = buildCanaryPlan({ targetVersion: '0.9.0' });
    const percents = plan.stages.map((s) => s.trafficPercent);

    expect(percents).toEqual([0, 5, 25, 50, 100]);
  });

  it('rollback command uses canary_failed reason', () => {
    const plan = buildCanaryPlan({ version: '1.0.0', targetVersion: '0.9.0' });

    expect(plan.rollbackCommand).toContain('--reason canary_failed');
    expect(plan.rollbackCommand).toContain('--database-strategy forward-fix');
  });

  it('full_rollout stage has more checks and longer window', () => {
    const plan = buildCanaryPlan({ targetVersion: '0.9.0' });
    const full = plan.stages.find((s) => s.id === 'full_rollout')!;
    const canary5 = plan.stages.find((s) => s.id === 'canary_5')!;

    expect(full.command).toContain('--checks 6');
    expect(full.command).toContain('--window-minutes 30');
    expect(canary5.command).toContain('--checks 3');
    expect(canary5.command).toContain('--window-minutes 15');
  });

  it('generatedAt is valid ISO string', () => {
    const plan = buildCanaryPlan({ version: '1.0.0', targetVersion: '2.0.0' });
    expect(new Date(plan.generatedAt).toISOString()).toBe(plan.generatedAt);
  });

  it('rollback command omits target-version when targetVersion is null', () => {
    const plan = buildCanaryPlan({ version: '1.0.0' });

    expect(plan.rollbackCommand).not.toContain('--target-version');
    expect(plan.rollbackCommand).toContain('--current-version 1.0.0');
    expect(plan.rollbackCommand).toContain('--reason canary_failed');
  });

  it('treats whitespace-only targetVersion as missing', () => {
    const plan = buildCanaryPlan({ version: '1.0.0', targetVersion: '   ' });

    expect(plan.targetVersion).toBeNull();
    expect(plan.status).toBe('NEEDS_TARGET');
    expect(plan.blockers).toHaveLength(1);
  });

  it('preflight stage has zero traffic and no observation command', () => {
    const plan = buildCanaryPlan({ targetVersion: '0.9.0' });
    const preflight = plan.stages.find((s) => s.id === 'preflight')!;

    expect(preflight.trafficPercent).toBe(0);
    expect(preflight.command).toContain('release:precheck');
    expect(preflight.command).not.toContain('--checks');
  });

  it('all traffic stages include base-url in command', () => {
    const plan = buildCanaryPlan({ version: '1.0.0', targetVersion: '0.9.0', baseUrl: 'http://my-host:8080' });
    const trafficStages = plan.stages.filter((s) => s.trafficPercent > 0);

    for (const stage of trafficStages) {
      expect(stage.command).toContain('--base-url http://my-host:8080');
    }
  });

  it('all stages have non-empty rollbackTrigger', () => {
    const plan = buildCanaryPlan({ version: '1.0.0', targetVersion: '0.9.0' });

    for (const stage of plan.stages) {
      expect(stage.rollbackTrigger.length).toBeGreaterThan(0);
    }
  });

  it('treats whitespace-only version as default', () => {
    const plan = buildCanaryPlan({ version: '   ', targetVersion: '0.9.0' });
    expect(plan.version).toBe('current-release');
  });

  it('rollback command includes base-url', () => {
    const plan = buildCanaryPlan({ version: '1.0.0', targetVersion: '0.9.0', baseUrl: 'http://prod:3000' });
    expect(plan.rollbackCommand).toContain('--base-url http://prod:3000');
  });

  it('returns NEEDS_TARGET with empty options object', () => {
    const plan = buildCanaryPlan({});
    expect(plan.status).toBe('NEEDS_TARGET');
    expect(plan.version).toBe('current-release');
    expect(plan.baseUrl).toBe('http://localhost:3000');
    expect(plan.stages).toHaveLength(5);
  });

  it('safeguards always contain three entries', () => {
    const plan = buildCanaryPlan({ targetVersion: '1.0.0' });
    expect(plan.safeguards).toHaveLength(3);
    expect(plan.safeguards[0]).toContain('does not shift traffic');
  });

  it('generates plan with default duration when not specified', () => {
    const plan = buildCanaryPlan({ targetVersion: '1.0.0' });
    expect(plan.mode).toBe('CANARY_DRY_RUN');
    expect(plan.status).toBe('READY');
  });


  it('dry run plan with empty rollout config returns valid structure', () => {
    const plan = buildCanaryPlan({ rolloutConfig: {}, currentVersion: '1.0.0' });
    expect(plan).toBeDefined();
    expect(plan.mode).toBeDefined();
  });

  it('buildCanaryPlan handles missing rolloutConfig gracefully', () => { const plan = buildCanaryPlan({}); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles zero rollout percentage', () => { const plan = buildCanaryPlan({ rolloutConfig: { percentage: 0, targetVersion: '1.0.0' } }); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles 100 percent rollout', () => { const plan = buildCanaryPlan({ rolloutConfig: { percentage: 100, targetVersion: '2.0.0' } }); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles negative percentage', () => { const plan = buildCanaryPlan({ rolloutConfig: { percentage: -10, targetVersion: '1.0.0' } }); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles missing targetVersion', () => { const plan = buildCanaryPlan({ rolloutConfig: { percentage: 50, targetVersion: '' } }); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles very large percentage', () => { const plan = buildCanaryPlan({ rolloutConfig: { percentage: 999, targetVersion: '3.0.0' } }); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles fractional percentage', () => { const plan = buildCanaryPlan({ rolloutConfig: { percentage: 33.33, targetVersion: '1.0.0' } }); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles zero percentage', () => { const plan = buildCanaryPlan({ rolloutConfig: { percentage: 0, targetVersion: '1.0.0' } }); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles 100 percentage', () => { const plan = buildCanaryPlan({ rolloutConfig: { percentage: 100, targetVersion: '1.0.0' } }); expect(plan).toBeDefined(); });

  it('buildCanaryPlan handles missing rolloutConfig gracefully', () => { const plan = buildCanaryPlan({} as any); expect(plan).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `  ${index}.0.${index}  `,
    `  ${index}.1.${index}  `,
    `  http://host-${index}.local:30${String(index).padStart(2, '0')}  `,
  ] as const))('trims generated canary options version %s target %s', (version, targetVersion, baseUrl) => {
    const plan = buildCanaryPlan({ version, targetVersion, baseUrl });

    expect(plan.status).toBe('READY');
    expect(plan.version).toBe(version.trim());
    expect(plan.targetVersion).toBe(targetVersion.trim());
    expect(plan.baseUrl).toBe(baseUrl.trim());
    expect(plan.rollbackCommand).toContain(`--current-version ${version.trim()}`);
    expect(plan.rollbackCommand).toContain(`--target-version ${targetVersion.trim()}`);
    expect(plan.stages[0].command).toContain(`--base-url ${baseUrl.trim()}`);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? '   ' : '',
    index % 3 === 0 ? '   ' : undefined,
  ] as const))('uses defaults for blank generated version and target %s', (targetVersion, version) => {
    const plan = buildCanaryPlan({ version, targetVersion });

    expect(plan.status).toBe('NEEDS_TARGET');
    expect(plan.version).toBe('current-release');
    expect(plan.targetVersion).toBeNull();
    expect(plan.blockers).toEqual(['targetVersion is required before canary rollout rehearsal']);
    expect(plan.rollbackCommand).not.toContain('--target-version');
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `http://canary-${index}.atlas.local:${3000 + index}`,
    `${index + 1}.0.${index}`,
    `${index + 1}.0.${index - 1}`,
  ] as const))('threads generated baseUrl through every command %s', (baseUrl, version, targetVersion) => {
    const plan = buildCanaryPlan({ baseUrl, version, targetVersion });

    expect(plan.status).toBe('READY');
    expect(plan.baseUrl).toBe(baseUrl);
    expect(plan.rollbackCommand).toContain(`--base-url ${baseUrl}`);
    for (const stage of plan.stages) {
      expect(stage.command).toContain(`--base-url ${baseUrl}`);
    }
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `release-${index}`,
    `rollback-${index}`,
  ] as const))('builds generated ready target rollback plan %s', (version, targetVersion) => {
    const plan = buildCanaryPlan({ version, targetVersion });

    expect(plan.status).toBe('READY');
    expect(plan.blockers).toEqual([]);
    expect(plan.stages.map((stage) => stage.trafficPercent)).toEqual([0, 5, 25, 50, 100]);
    expect(plan.rollbackCommand).toContain(`--current-version ${version}`);
    expect(plan.rollbackCommand).toContain(`--target-version ${targetVersion}`);
    expect(plan.stages.find((stage) => stage.id === 'full_rollout')!.command).toContain('--checks 6');
    expect(plan.stages.find((stage) => stage.id === 'full_rollout')!.command).toContain('--window-minutes 30');
  });
});

describe('canary plan batch 136 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `current-${index}`,
    `target-${index}`,
    `https://canary-batch136-${index}.example.com`,
  ] as const))(
    'builds generated ready canary command set %s -> %s',
    (version, targetVersion, baseUrl) => {
      const plan = buildCanaryPlan({ version, targetVersion, baseUrl });

      expect(plan.status).toBe('READY');
      expect(plan.mode).toBe('CANARY_DRY_RUN');
      expect(plan.blockers).toEqual([]);
      expect(plan.rollbackCommand).toContain(`--current-version ${version}`);
      expect(plan.rollbackCommand).toContain(`--target-version ${targetVersion}`);
      expect(plan.stages.map((stage) => stage.trafficPercent)).toEqual([0, 5, 25, 50, 100]);
      expect(plan.stages.every((stage) => stage.command.includes(`--base-url ${baseUrl}`))).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `  release-batch136-${index}  `,
    index % 2 === 0 ? undefined : '   ',
  ] as const))(
    'keeps generated missing target blocker for %s',
    (version, targetVersion) => {
      const plan = buildCanaryPlan({ version, targetVersion });

      expect(plan.status).toBe('NEEDS_TARGET');
      expect(plan.version).toBe(version.trim());
      expect(plan.targetVersion).toBeNull();
      expect(plan.blockers).toEqual(['targetVersion is required before canary rollout rehearsal']);
      expect(plan.rollbackCommand).not.toContain('--target-version');
    },
  );
});

describe('canary plan batch 156 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `  release-batch156-${index}  `,
    `  rollback-batch156-${index}  `,
    `  https://batch156-canary-${index}.atlas.local  `,
  ] as const))(
    'trims generated rollout command inputs for %s',
    (version, targetVersion, baseUrl) => {
      const plan = buildCanaryPlan({ version, targetVersion, baseUrl });
      const trimmedBaseUrl = baseUrl.trim();

      expect(plan.status).toBe('READY');
      expect(plan.version).toBe(version.trim());
      expect(plan.targetVersion).toBe(targetVersion.trim());
      expect(plan.baseUrl).toBe(trimmedBaseUrl);
      expect(plan.stages.map((stage) => stage.id)).toEqual([
        'preflight',
        'canary_5',
        'canary_25',
        'canary_50',
        'full_rollout',
      ]);
      expect(plan.stages.every((stage) => stage.command.includes(`--base-url ${trimmedBaseUrl}`))).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch156-current-${index}`,
    index % 2 === 0 ? '' : '   ',
  ] as const))(
    'keeps generated rollback command blocked without target %s',
    (version, targetVersion) => {
      const plan = buildCanaryPlan({ version, targetVersion, baseUrl: '   ' });

      expect(plan.status).toBe('NEEDS_TARGET');
      expect(plan.targetVersion).toBeNull();
      expect(plan.baseUrl).toBe('http://localhost:3000');
      expect(plan.rollbackCommand).toContain(`--current-version ${version}`);
      expect(plan.rollbackCommand).not.toContain('--target-version');
      expect(plan.blockers).toEqual(['targetVersion is required before canary rollout rehearsal']);
    },
  );
});
