export type ReleaseFailureStage =
  | 'precheck'
  | 'canary_5'
  | 'canary_25'
  | 'canary_50'
  | 'full_rollout'
  | 'observe'
  | 'rollback';

export type ReleaseFailureReport = {
  mode: 'RELEASE_FAILURE_REPORT';
  status: 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  version: string;
  targetVersion: string | null;
  failedAt: ReleaseFailureStage;
  triggeredGate: string;
  mitigationActions: string[];
  owners: string[];
  followUps: string[];
  blockers: string[];
  rollbackCommand: string;
  recommendation: string;
};

export function buildReleaseFailureReport(input: {
  version: string;
  targetVersion?: string;
  failedAt: ReleaseFailureStage;
  triggeredGate: string;
  mitigationActions: string[];
  owners: string[];
  followUps: string[];
  baseUrl?: string;
  generatedAt?: Date;
}): ReleaseFailureReport {
  const targetVersion = input.targetVersion?.trim() || null;
  const owners = normalizeList(input.owners);
  const blockers = [
    ...(targetVersion ? [] : ['targetVersion is required for rollback recommendation']),
    ...(owners.length > 0 ? [] : ['at least one owner is required']),
  ];
  const baseUrl = input.baseUrl?.trim() || 'http://localhost:3000';

  return {
    mode: 'RELEASE_FAILURE_REPORT',
    status: blockers.length > 0 ? 'BLOCKED' : 'ACTION_REQUIRED',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    version: input.version,
    targetVersion,
    failedAt: input.failedAt,
    triggeredGate: input.triggeredGate,
    mitigationActions: normalizeList(input.mitigationActions),
    owners,
    followUps: normalizeList(input.followUps),
    blockers,
    rollbackCommand: buildRollbackCommand({
      version: input.version,
      targetVersion,
      failedAt: input.failedAt,
      baseUrl,
    }),
    recommendation: blockers.length > 0
      ? 'Assign missing release failure metadata before retrying rollout or executing rollback.'
      : 'Keep release frozen, execute or rehearse rollback, and close follow-up items before retrying rollout.',
  };
}

function buildRollbackCommand(options: {
  version: string;
  targetVersion: string | null;
  failedAt: ReleaseFailureStage;
  baseUrl: string;
}): string {
  return [
    'npm run rollback:plan --workspace=server --',
    `--current-version ${options.version}`,
    options.targetVersion ? `--target-version ${options.targetVersion}` : '',
    `--reason release_failure_${options.failedAt}`,
    '--database-strategy forward-fix',
    `--base-url ${options.baseUrl}`,
  ].filter(Boolean).join(' ');
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
