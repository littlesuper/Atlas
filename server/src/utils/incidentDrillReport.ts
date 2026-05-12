import { IncidentDrillScenarioId } from './incidentDrill';

type DrillReportInput = {
  scenario: IncidentDrillScenarioId;
  startedAt: string;
  endedAt: string;
  achievedCriteria: string[];
  issues: string[];
  followUps: string[];
  generatedAt?: Date;
};

export type IncidentDrillReport = {
  mode: 'DRILL_REPORT';
  status: 'PASSED' | 'FOLLOW_UP_REQUIRED';
  generatedAt: string;
  scenario: IncidentDrillScenarioId;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  achievedCriteria: string[];
  missingCriteria: string[];
  issues: string[];
  followUps: string[];
  recommendation: string;
};

export function buildIncidentDrillReport(input: DrillReportInput): IncidentDrillReport {
  const expectedCriteria = exitCriteriaByScenario[input.scenario];
  const achieved = normalizeList(input.achievedCriteria);
  const issues = normalizeList(input.issues);
  const followUps = normalizeList(input.followUps);
  const missingCriteria = expectedCriteria.filter((criterion) => !achieved.includes(criterion));
  const status = missingCriteria.length === 0 && issues.length === 0 ? 'PASSED' : 'FOLLOW_UP_REQUIRED';

  return {
    mode: 'DRILL_REPORT',
    status,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    scenario: input.scenario,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMinutes: diffMinutes(input.startedAt, input.endedAt),
    achievedCriteria: achieved,
    missingCriteria,
    issues,
    followUps,
    recommendation: status === 'PASSED'
      ? 'Archive the report and schedule the next drill rotation.'
      : 'Close follow-up items before marking this drill complete, then rerun the missed criteria.',
  };
}

function diffMinutes(startedAt: string, endedAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 60000);
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

const exitCriteriaByScenario: Record<IncidentDrillScenarioId, string[]> = {
  api_5xx: [
    'Incident commander can identify first failing check and affected route or feature',
    'Mitigation command is selected without touching unrelated features',
    'Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker',
  ],
  database_degraded: [
    'Incident commander can identify whether the failure is connectivity, migration, or data related',
    'Database recovery strategy is selected before application rollback',
    'Release remains frozen until post-mitigation precheck returns GO',
  ],
};
