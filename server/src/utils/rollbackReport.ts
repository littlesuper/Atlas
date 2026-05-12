type RollbackReportCheck = {
  id: 'target_confirmed' | 'database_strategy_confirmed' | 'post_rollback_precheck';
  status: 'PASS' | 'FAIL';
  message: string;
};

export type RollbackReport = {
  mode: 'ROLLBACK_REPORT';
  status: 'PASSED' | 'FOLLOW_UP_REQUIRED';
  generatedAt: string;
  currentVersion: string;
  targetVersion: string;
  reason: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  checks: RollbackReportCheck[];
  issues: string[];
  followUps: string[];
  recommendation: string;
};

export function buildRollbackReport(input: {
  currentVersion: string;
  targetVersion: string;
  reason: string;
  startedAt: string;
  endedAt: string;
  targetConfirmed: boolean;
  databaseStrategyConfirmed: boolean;
  postRollbackPrecheckStatus: 'GO' | 'NO_GO';
  issues: string[];
  followUps: string[];
  generatedAt?: Date;
}): RollbackReport {
  const checks = [
    targetConfirmedCheck(input.targetConfirmed),
    databaseStrategyCheck(input.databaseStrategyConfirmed),
    postRollbackPrecheck(input.postRollbackPrecheckStatus),
  ];
  const issues = normalizeList(input.issues);
  const followUps = normalizeList(input.followUps);
  const status = checks.every((check) => check.status === 'PASS') && issues.length === 0
    ? 'PASSED'
    : 'FOLLOW_UP_REQUIRED';

  return {
    mode: 'ROLLBACK_REPORT',
    status,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    currentVersion: input.currentVersion,
    targetVersion: input.targetVersion,
    reason: input.reason,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMinutes: diffMinutes(input.startedAt, input.endedAt),
    checks,
    issues,
    followUps,
    recommendation: status === 'PASSED'
      ? 'Archive the rollback report and keep normal post-release monitoring active.'
      : 'Close rollback follow-up items before marking the rehearsal complete.',
  };
}

function targetConfirmedCheck(confirmed: boolean): RollbackReportCheck {
  return confirmed
    ? { id: 'target_confirmed', status: 'PASS', message: 'Rollback target version confirmed' }
    : { id: 'target_confirmed', status: 'FAIL', message: 'Rollback target version was not confirmed' };
}

function databaseStrategyCheck(confirmed: boolean): RollbackReportCheck {
  return confirmed
    ? { id: 'database_strategy_confirmed', status: 'PASS', message: 'Database strategy confirmed before rollback' }
    : { id: 'database_strategy_confirmed', status: 'FAIL', message: 'Database strategy was not confirmed before rollback' };
}

function postRollbackPrecheck(status: 'GO' | 'NO_GO'): RollbackReportCheck {
  return status === 'GO'
    ? { id: 'post_rollback_precheck', status: 'PASS', message: 'Post-rollback precheck returned GO' }
    : { id: 'post_rollback_precheck', status: 'FAIL', message: 'Post-rollback precheck returned NO_GO' };
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
