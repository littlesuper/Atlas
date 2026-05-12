export type CanaryStage = {
  id: 'preflight' | 'canary_5' | 'canary_25' | 'canary_50' | 'full_rollout';
  trafficPercent: number;
  gate: string;
  command: string;
  rollbackTrigger: string;
};

export type CanaryPlan = {
  mode: 'CANARY_DRY_RUN';
  status: 'READY' | 'NEEDS_TARGET';
  generatedAt: string;
  version: string;
  targetVersion: string | null;
  baseUrl: string;
  stages: CanaryStage[];
  rollbackCommand: string;
  safeguards: string[];
  blockers: string[];
};

export function buildCanaryPlan(input: {
  version?: string;
  targetVersion?: string;
  baseUrl?: string;
  generatedAt?: Date;
}): CanaryPlan {
  const version = input.version?.trim() || 'current-release';
  const targetVersion = input.targetVersion?.trim() || null;
  const baseUrl = input.baseUrl?.trim() || 'http://localhost:3000';
  const blockers = targetVersion ? [] : ['targetVersion is required before canary rollout rehearsal'];

  return {
    mode: 'CANARY_DRY_RUN',
    status: blockers.length === 0 ? 'READY' : 'NEEDS_TARGET',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    version,
    targetVersion,
    baseUrl,
    stages: buildStages(baseUrl),
    rollbackCommand: buildRollbackCommand({ version, targetVersion, baseUrl }),
    safeguards: [
      'This plan does not shift traffic by itself.',
      'Do not advance to the next stage until the current stage gate passes.',
      'Keep feature flag mitigation ready before the first traffic shift.',
    ],
    blockers,
  };
}

function buildStages(baseUrl: string): CanaryStage[] {
  return [
    {
      id: 'preflight',
      trafficPercent: 0,
      gate: 'release:precheck must return GO before any traffic shift',
      command: `npm run release:precheck --workspace=server -- --base-url ${baseUrl}`,
      rollbackTrigger: 'Any NO_GO check blocks rollout before traffic shift',
    },
    buildTrafficStage('canary_5', 5, baseUrl, 3, 15),
    buildTrafficStage('canary_25', 25, baseUrl, 3, 15),
    buildTrafficStage('canary_50', 50, baseUrl, 3, 15),
    buildTrafficStage('full_rollout', 100, baseUrl, 6, 30),
  ];
}

function buildTrafficStage(
  id: CanaryStage['id'],
  trafficPercent: number,
  baseUrl: string,
  checks: number,
  windowMinutes: number,
): CanaryStage {
  const label = trafficPercent === 100 ? 'full rollout' : `${trafficPercent}% traffic`;

  return {
    id,
    trafficPercent,
    gate: `Observe ${label} window and require STABLE`,
    command: `npm run release:observe --workspace=server -- --base-url ${baseUrl} --checks ${checks} --interval-ms 300000 --window-minutes ${windowMinutes}`,
    rollbackTrigger: 'ATTENTION_REQUIRED, active P1 alert, unknown feature flag, or concentrated 5xx',
  };
}

function buildRollbackCommand(options: {
  version: string;
  targetVersion: string | null;
  baseUrl: string;
}): string {
  return [
    'npm run rollback:plan --workspace=server --',
    `--current-version ${options.version}`,
    options.targetVersion ? `--target-version ${options.targetVersion}` : '',
    '--reason canary_failed',
    '--database-strategy forward-fix',
    `--base-url ${options.baseUrl}`,
  ].filter(Boolean).join(' ');
}
