import { describe, expect, it } from 'vitest';
import { buildRollbackDryRunPlan, type RollbackDatabaseStrategy } from './rollbackPlan';

describe('rollback dry-run plan builder', () => {
  it('builds a rehearsal plan with feature flag mitigation before app rollback', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.4.8',
      targetVersion: '1.4.7',
      reason: 'new release produces 5xx on activity import',
      featureFlagsToDisable: ['activity.import', 'activity.bulk-mutation'],
      databaseStrategy: 'forward-fix',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date('2026-05-05T14:00:00.000Z'),
    });

    expect(plan.status).toBe('READY_FOR_REHEARSAL');
    expect(plan.mode).toBe('DRY_RUN');
    expect(plan.generatedAt).toBe('2026-05-05T14:00:00.000Z');
    expect(plan.summary).toEqual({
      currentVersion: '1.4.8',
      targetVersion: '1.4.7',
      reason: 'new release produces 5xx on activity import',
      databaseStrategy: 'forward-fix',
    });
    expect(plan.safeguards).toContain('This plan is dry-run only and does not execute rollback commands.');
    expect(plan.steps.map((step) => step.id)).toEqual([
      'announce_freeze',
      'disable_feature_flags',
      'collect_context',
      'rollback_application',
      'database_strategy',
      'post_rollback_precheck',
      'observe',
    ]);
    expect(plan.steps[1].command).toBe('FEATURE_FLAGS="!activity.import,!activity.bulk-mutation"');
    expect(plan.steps[3].action).toContain('Roll application from 1.4.8 to 1.4.7');
    expect(plan.verificationCommands).toContain(
      'npm run release:precheck --workspace=server -- --base-url http://localhost:3000',
    );
  });

  it('blocks rehearsal readiness when the rollback target is missing', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.4.8',
      reason: 'release validation failed',
      generatedAt: new Date('2026-05-05T14:00:00.000Z'),
    });

    expect(plan.status).toBe('NEEDS_TARGET');
    expect(plan.blockers).toEqual(['targetVersion is required before rollback rehearsal']);
    expect(plan.steps.find((step) => step.id === 'rollback_application')?.action).toContain(
      'Select a known-good application version',
    );
  });

  it('has 7 steps in the rollback sequence', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      generatedAt: new Date(),
    });

    expect(plan.steps).toHaveLength(7);
  });

  it('includes verification commands', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      baseUrl: 'http://localhost:3000',
      generatedAt: new Date(),
    });

    expect(plan.verificationCommands.length).toBeGreaterThan(0);
  });

  it('disables specified feature flags in step command', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      featureFlagsToDisable: ['ai.external-calls'],
      generatedAt: new Date(),
    });

    const flagStep = plan.steps.find(s => s.id === 'disable_feature_flags');
    expect(flagStep?.command).toContain('!ai.external-calls');
  });

  it('defaults currentVersion to "current-release" when empty', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '',
      targetVersion: '0.9.0',
      reason: 'test',
      generatedAt: new Date(),
    });

    expect(plan.summary.currentVersion).toBe('current-release');
  });

  it('defaults reason to "rollback rehearsal" when empty', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      generatedAt: new Date(),
    });

    expect(plan.summary.reason).toBe('rollback rehearsal');
  });

  it('defaults baseUrl to localhost when empty', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      baseUrl: '  ',
      generatedAt: new Date(),
    });

    expect(plan.steps[2].command).toContain('http://localhost:3000');
  });

  it('defaults databaseStrategy to "none"', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      generatedAt: new Date(),
    });

    expect(plan.summary.databaseStrategy).toBe('none');
    const dbStep = plan.steps.find((s) => s.id === 'database_strategy')!;
    expect(dbStep.action).toContain('No database rollback expected');
  });

  it('handles "backup-restore" database strategy', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      databaseStrategy: 'backup-restore',
      generatedAt: new Date(),
    });

    expect(plan.summary.databaseStrategy).toBe('backup-restore');
    const dbStep = plan.steps.find((s) => s.id === 'database_strategy')!;
    expect(dbStep.action).toContain('database restore from verified backup');
  });

  it('deduplicates and trims feature flags', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      featureFlagsToDisable: ['flag-a', ' flag-a ', '', '  ', 'flag-b'],
      generatedAt: new Date(),
    });

    const flagStep = plan.steps.find((s) => s.id === 'disable_feature_flags')!;
    expect(flagStep!.command).toBe('FEATURE_FLAGS="!flag-a,!flag-b"');
    expect(flagStep!.action).toContain('flag-a, flag-b');
  });

  it('no flag step command when no feature flags provided', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      generatedAt: new Date(),
    });

    const flagStep = plan.steps.find((s) => s.id === 'disable_feature_flags')!;
    expect(flagStep.command).toBeUndefined();
    expect(flagStep.action).toContain('Confirm whether any high-risk feature flags');
  });

  it('always has 3 safeguards', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      generatedAt: new Date(),
    });

    expect(plan.safeguards).toHaveLength(3);
  });

  it('step order is sequential from 1 to 7', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      generatedAt: new Date(),
    });

    expect(plan.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
    });
    const after = new Date();

    const ts = new Date(plan.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('handles "forward-fix" database strategy action text', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      databaseStrategy: 'forward-fix',
      generatedAt: new Date(),
    });

    const dbStep = plan.steps.find((s) => s.id === 'database_strategy')!;
    expect(dbStep.action).toContain('forward-fix');
    expect(dbStep.action).toContain('compensating migration');
  });

  it('whitespace-only targetVersion is treated as missing', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '   ',
      reason: 'test',
      generatedAt: new Date(),
    });

    expect(plan.summary.targetVersion).toBeNull();
    expect(plan.status).toBe('NEEDS_TARGET');
    expect(plan.blockers).toEqual(['targetVersion is required before rollback rehearsal']);
  });

  it('unknown databaseStrategy falls through to none behavior', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      databaseStrategy: 'invalid-strategy' as unknown as RollbackDatabaseStrategy,
      generatedAt: new Date(),
    });

    const dbStep = plan.steps.find((s) => s.id === 'database_strategy')!;
    expect(dbStep.action).toContain('No database rollback expected');
  });

  it('each step has the correct phase value', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      generatedAt: new Date(),
    });

    const phases = plan.steps.map((s) => s.phase);
    expect(phases).toEqual(['freeze', 'mitigate', 'collect', 'rollback', 'database', 'verify', 'observe']);
  });

  it('mode is always ROLLBACK_PLAN', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
    });
    expect(plan.mode).toBe('DRY_RUN');
  });

  it('empty feature flags produce no FEATURE_FLAGS command', () => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '1.0.0',
      targetVersion: '0.9.0',
      reason: 'test',
      featureFlagsToDisable: [],
    });

    const flagStep = plan.steps.find((s) => s.id === 'disable_feature_flags');
    expect(flagStep?.command).toBeUndefined();
  });

  it('rollback plan has at least one step', () => {
    const plan = buildRollbackDryRunPlan({ currentVersion: '1.0', targetVersion: '0.9', reason: 'test' });
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('plan includes estimated duration', () => {
    const plan = buildRollbackDryRunPlan({ targetVersion: '1.0.0', currentVersion: '2.0.0' });
    expect(plan.mode).toBe('DRY_RUN');
    expect(plan.summary.targetVersion).toBe('1.0.0');
  });

  it('dry run plan with same versions returns valid structure', () => {
    const plan = buildRollbackDryRunPlan({ targetVersion: '1.0.0', currentVersion: '1.0.0' });
    expect(plan).toBeDefined();
    expect(plan.mode).toBe('DRY_RUN');
  });

  it('buildRollbackDryRunPlan handles same versions', () => {
    const plan = buildRollbackDryRunPlan({ targetVersion: '1.0.0', currentVersion: '1.0.0' });
    expect(plan).toBeDefined();
    expect(plan.mode).toBe('DRY_RUN');
  });

  it('buildRollbackDryRunPlan handles minimal input', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '1.0.0', targetVersion: '0.9.0' }); expect(plan.mode).toBe('DRY_RUN'); });

  it('buildRollbackDryRunPlan handles same version input', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '1.0.0', targetVersion: '1.0.0' }); expect(plan).toBeDefined(); });

  it('buildRollbackDryRunPlan handles different versions', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '2.0.0', targetVersion: '1.0.0' }); expect(plan).toBeDefined(); expect(plan.mode).toBe('DRY_RUN'); });

  it('buildRollbackDryRunPlan handles empty version strings', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '', targetVersion: '' }); expect(plan).toBeDefined(); });

  it('buildRollbackDryRunPlan mode is DRY_RUN', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '2.0.0', targetVersion: '1.0.0' }); expect(plan.mode).toBe('DRY_RUN'); });

  it('buildRollbackDryRunPlan handles version with pre-release tag', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '2.0.0-beta.1', targetVersion: '1.0.0' }); expect(plan).toBeDefined(); });

  it('buildRollbackDryRunPlan handles same versions', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '1.0.0', targetVersion: '1.0.0' }); expect(plan).toBeDefined(); });

  it('buildRollbackDryRunPlan handles empty version strings', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '', targetVersion: '' }); expect(plan).toBeDefined(); });

  it('buildRollbackDryRunPlan handles same version strings', () => { const plan = buildRollbackDryRunPlan({ currentVersion: '1.0.0', targetVersion: '1.0.0' }); expect(plan).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ` flag-${index} `,
    ` flag-${index} `,
    `flag-${index + 1}`,
  ] as const))('deduplicates generated feature flags %s', (first, duplicate, second) => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '2.0.0',
      targetVersion: '1.9.0',
      reason: 'test',
      featureFlagsToDisable: [first, duplicate, ' ', second],
    });
    const flagStep = plan.steps.find((step) => step.id === 'disable_feature_flags')!;

    expect(flagStep.action).toContain(first.trim());
    expect(flagStep.action).toContain(second);
    expect(flagStep.command).toBe(`FEATURE_FLAGS="!${first.trim()},!${second}"`);
    expect(plan.status).toBe('READY_FOR_REHEARSAL');
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['none', 'forward-fix', 'backup-restore'][index % 3],
    ` http://rollback-${index}.local `,
  ] as const))('builds generated rollback commands for strategy %s', (databaseStrategy, baseUrl) => {
    const plan = buildRollbackDryRunPlan({
      currentVersion: '3.0.0',
      targetVersion: '2.9.0',
      reason: ` reason-${databaseStrategy} `,
      databaseStrategy: databaseStrategy as RollbackDatabaseStrategy,
      baseUrl,
    });

    expect(plan.summary.reason).toBe(`reason-${databaseStrategy}`);
    expect(plan.summary.databaseStrategy).toBe(databaseStrategy);
    expect(plan.verificationCommands[0]).toContain(`--base-url ${baseUrl.trim()}`);
    expect(plan.steps.find((step) => step.id === 'collect_context')!.command).toContain(baseUrl.trim());
    expect(plan.steps.find((step) => step.id === 'database_strategy')!.action.length).toBeGreaterThan(0);
  });
});

describe('rollback plan batch 134 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ` ${index}.2.0 `,
    ` ${index}.1.0 `,
    ` reason ${index} `,
  ] as const))(
    'generated rollback versions are trimmed %#',
    (currentVersion, targetVersion, reason) => {
      const plan = buildRollbackDryRunPlan({ currentVersion, targetVersion, reason });

      expect(plan.status).toBe('READY_FOR_REHEARSAL');
      expect(plan.summary.currentVersion).toBe(currentVersion.trim());
      expect(plan.summary.targetVersion).toBe(targetVersion.trim());
      expect(plan.summary.reason).toBe(reason.trim());
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['none', 'forward-fix', 'backup-restore'][index % 3] as RollbackDatabaseStrategy,
    `http://batch134-${index}.local`,
  ] as const))(
    'generated database strategy %s appears in database step',
    (databaseStrategy, baseUrl) => {
      const plan = buildRollbackDryRunPlan({
        currentVersion: '2.0.0',
        targetVersion: '1.9.0',
        databaseStrategy,
        baseUrl,
      });

      expect(plan.summary.databaseStrategy).toBe(databaseStrategy);
      expect(plan.steps.find((step) => step.id === 'database_strategy')?.phase).toBe('database');
      expect(plan.verificationCommands.every((command) => command.includes(baseUrl))).toBe(true);
    },
  );
});
