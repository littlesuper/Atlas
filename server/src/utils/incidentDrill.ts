import { RollbackDatabaseStrategy } from './rollbackPlan';

export type IncidentDrillScenarioId = 'api_5xx' | 'database_degraded';

type ScenarioDefinition = {
  id: IncidentDrillScenarioId;
  title: string;
  trigger: string;
  objective: string;
  injects: string[];
  featureFlagsToDisable: string[];
  databaseStrategy: RollbackDatabaseStrategy;
  extraExpectedActions: string[];
  exitCriteria: string[];
};

export type IncidentDrillPlan = {
  mode: 'DRILL';
  status: 'READY' | 'NEEDS_TARGET';
  generatedAt: string;
  scenario: Pick<ScenarioDefinition, 'id' | 'title' | 'trigger' | 'objective'>;
  participants: string[];
  blockers: string[];
  injects: string[];
  expectedActions: string[];
  commands: string[];
  exitCriteria: string[];
};

export function buildIncidentDrillPlan(input: {
  scenario: IncidentDrillScenarioId;
  currentVersion?: string;
  targetVersion?: string;
  baseUrl?: string;
  generatedAt?: Date;
}): IncidentDrillPlan {
  const definition = scenarioDefinitions[input.scenario];
  const currentVersion = input.currentVersion?.trim() || 'current-release';
  const targetVersion = input.targetVersion?.trim() || '';
  const baseUrl = input.baseUrl?.trim() || 'http://localhost:3000';
  const blockers = targetVersion ? [] : ['targetVersion is required for rollback drill readiness'];

  return {
    mode: 'DRILL',
    status: blockers.length === 0 ? 'READY' : 'NEEDS_TARGET',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    scenario: {
      id: definition.id,
      title: definition.title,
      trigger: definition.trigger,
      objective: definition.objective,
    },
    participants: ['release owner', 'on-call engineer', 'backend engineer', 'product owner'],
    blockers,
    injects: definition.injects,
    expectedActions: [
      'Announce release freeze in the incident channel',
      'Collect incident context before changing state',
      ...definition.extraExpectedActions,
      'Generate rollback dry-run plan',
      'Run release precheck after mitigation',
      'Record timeline and follow-up owners',
    ],
    commands: buildCommands({
      currentVersion,
      targetVersion,
      baseUrl,
      scenario: definition.id,
      featureFlagsToDisable: definition.featureFlagsToDisable,
      databaseStrategy: definition.databaseStrategy,
    }),
    exitCriteria: definition.exitCriteria,
  };
}

function buildCommands(options: {
  currentVersion: string;
  targetVersion: string;
  baseUrl: string;
  scenario: IncidentDrillScenarioId;
  featureFlagsToDisable: string[];
  databaseStrategy: RollbackDatabaseStrategy;
}): string[] {
  const commands = [
    `npm run incident:collect --workspace=server -- --base-url ${options.baseUrl}`,
  ];

  if (options.featureFlagsToDisable.length > 0) {
    commands.push(`FEATURE_FLAGS="${options.featureFlagsToDisable.map((flag) => `!${flag}`).join(',')}"`);
  }

  commands.push([
    'npm run rollback:plan --workspace=server --',
    `--current-version ${options.currentVersion}`,
    options.targetVersion ? `--target-version ${options.targetVersion}` : '',
    `--reason ${options.scenario}`,
    options.featureFlagsToDisable.length > 0 ? `--disable-flag ${options.featureFlagsToDisable.join(',')}` : '',
    `--database-strategy ${options.databaseStrategy}`,
    `--base-url ${options.baseUrl}`,
  ].filter(Boolean).join(' '));
  commands.push(`npm run release:precheck --workspace=server -- --base-url ${options.baseUrl}`);

  return commands;
}

const scenarioDefinitions: Record<IncidentDrillScenarioId, ScenarioDefinition> = {
  api_5xx: {
    id: 'api_5xx',
    title: 'API 5xx spike after release',
    trigger: 'release:observe or release:precheck reports active_alerts or health_status failure',
    objective: 'Practice freezing release, collecting context, disabling high-risk flags, and rehearsing rollback.',
    injects: [
      'release:observe returns ATTENTION_REQUIRED',
      'metrics alerts include api_5xx_rate_high',
    ],
    featureFlagsToDisable: ['ai.external-calls', 'activity.import', 'activity.bulk-mutation'],
    databaseStrategy: 'none',
    extraExpectedActions: [
      'Disable suspected high-risk feature flags',
    ],
    exitCriteria: [
      'Incident commander can identify first failing check and affected route or feature',
      'Mitigation command is selected without touching unrelated features',
      'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
    ],
  },
  database_degraded: {
    id: 'database_degraded',
    title: 'Database degraded after release',
    trigger: 'release:precheck reports database_health failure or /api/health returns degraded',
    objective: 'Practice database-first triage, context collection, and recovery strategy selection.',
    injects: [
      'health checks.database.status is error',
      'release:precheck returns NO_GO',
    ],
    featureFlagsToDisable: [],
    databaseStrategy: 'forward-fix',
    extraExpectedActions: [
      'Choose forward-fix or backup restore before application rollback',
    ],
    exitCriteria: [
      'Incident commander can identify whether the failure is connectivity, migration, or data related',
      'Database recovery strategy is selected before application rollback',
      'Release remains frozen until post-mitigation precheck returns GO',
    ],
  },
};
