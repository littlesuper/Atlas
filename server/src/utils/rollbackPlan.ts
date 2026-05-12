export type RollbackDatabaseStrategy = 'none' | 'forward-fix' | 'backup-restore';

export type RollbackPlanInput = {
  currentVersion?: string;
  targetVersion?: string;
  reason?: string;
  featureFlagsToDisable?: string[];
  databaseStrategy?: RollbackDatabaseStrategy;
  baseUrl?: string;
  generatedAt?: Date;
};

export type RollbackPlanStep = {
  id:
    | 'announce_freeze'
    | 'disable_feature_flags'
    | 'collect_context'
    | 'rollback_application'
    | 'database_strategy'
    | 'post_rollback_precheck'
    | 'observe';
  order: number;
  phase: 'freeze' | 'mitigate' | 'collect' | 'rollback' | 'database' | 'verify' | 'observe';
  action: string;
  command?: string;
};

export type RollbackDryRunPlan = {
  mode: 'DRY_RUN';
  status: 'READY_FOR_REHEARSAL' | 'NEEDS_TARGET';
  generatedAt: string;
  summary: {
    currentVersion: string;
    targetVersion: string | null;
    reason: string;
    databaseStrategy: RollbackDatabaseStrategy;
  };
  blockers: string[];
  safeguards: string[];
  steps: RollbackPlanStep[];
  verificationCommands: string[];
};

export function buildRollbackDryRunPlan(input: RollbackPlanInput): RollbackDryRunPlan {
  const currentVersion = input.currentVersion?.trim() || 'current-release';
  const targetVersion = input.targetVersion?.trim() || null;
  const reason = input.reason?.trim() || 'rollback rehearsal';
  const databaseStrategy = input.databaseStrategy ?? 'none';
  const baseUrl = input.baseUrl?.trim() || 'http://localhost:3000';
  const flags = uniqueFlags(input.featureFlagsToDisable ?? []);
  const blockers = targetVersion ? [] : ['targetVersion is required before rollback rehearsal'];

  return {
    mode: 'DRY_RUN',
    status: blockers.length === 0 ? 'READY_FOR_REHEARSAL' : 'NEEDS_TARGET',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      currentVersion,
      targetVersion,
      reason,
      databaseStrategy,
    },
    blockers,
    safeguards: [
      'This plan is dry-run only and does not execute rollback commands.',
      'Confirm database backup and migration reversibility before any real rollback.',
      'Keep release owner, on-call engineer, and product owner in the incident channel.',
    ],
    steps: buildSteps({
      currentVersion,
      targetVersion,
      reason,
      flags,
      databaseStrategy,
      baseUrl,
    }),
    verificationCommands: [
      `npm run release:precheck --workspace=server -- --base-url ${baseUrl}`,
      `npm run incident:collect --workspace=server -- --base-url ${baseUrl}`,
    ],
  };
}

function buildSteps(options: {
  currentVersion: string;
  targetVersion: string | null;
  reason: string;
  flags: string[];
  databaseStrategy: RollbackDatabaseStrategy;
  baseUrl: string;
}): RollbackPlanStep[] {
  return [
    {
      id: 'announce_freeze',
      order: 1,
      phase: 'freeze',
      action: `Announce release freeze and rollback rehearsal reason: ${options.reason}`,
    },
    {
      id: 'disable_feature_flags',
      order: 2,
      phase: 'mitigate',
      action: options.flags.length > 0
        ? `Prepare to disable high-risk flags: ${options.flags.join(', ')}`
        : 'Confirm whether any high-risk feature flags should be disabled before rollback',
      command: options.flags.length > 0 ? `FEATURE_FLAGS="${options.flags.map((flag) => `!${flag}`).join(',')}"` : undefined,
    },
    {
      id: 'collect_context',
      order: 3,
      phase: 'collect',
      action: 'Collect health, metrics, active alerts and optional requestId logs before rollback',
      command: `npm run incident:collect --workspace=server -- --base-url ${options.baseUrl}`,
    },
    {
      id: 'rollback_application',
      order: 4,
      phase: 'rollback',
      action: options.targetVersion
        ? `Roll application from ${options.currentVersion} to ${options.targetVersion}`
        : 'Select a known-good application version before executing rollback',
    },
    {
      id: 'database_strategy',
      order: 5,
      phase: 'database',
      action: databaseStrategyAction(options.databaseStrategy),
    },
    {
      id: 'post_rollback_precheck',
      order: 6,
      phase: 'verify',
      action: 'Run release precheck after rollback and require GO before reopening release flow',
      command: `npm run release:precheck --workspace=server -- --base-url ${options.baseUrl}`,
    },
    {
      id: 'observe',
      order: 7,
      phase: 'observe',
      action: 'Observe health, metrics, Sentry and user reports for at least 30 minutes',
    },
  ];
}

function databaseStrategyAction(strategy: RollbackDatabaseStrategy): string {
  switch (strategy) {
    case 'forward-fix':
      return 'Use forward-fix or compensating migration; do not reverse irreversible schema/data changes blindly';
    case 'backup-restore':
      return 'Prepare database restore from verified backup and confirm data loss window with stakeholders';
    case 'none':
    default:
      return 'No database rollback expected; verify migrations were not part of the release';
  }
}

function uniqueFlags(flags: string[]): string[] {
  return [...new Set(flags.map((flag) => flag.trim()).filter(Boolean))];
}
