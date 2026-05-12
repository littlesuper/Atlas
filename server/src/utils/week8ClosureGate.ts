export type ClosureCheckStatus =
  | 'READY'
  | 'PASSED'
  | 'DONE'
  | 'RESOLVED'
  | 'READY_TO_CONFIRM'
  | 'CONFIRMED'
  | 'READY_TO_ARCHIVE'
  | 'ACTION_REQUIRED'
  | 'BLOCKED';

export type ClosureCheck = {
  name: string;
  status: ClosureCheckStatus;
  detail?: string;
};

export type Week8ClosureGate = {
  mode: 'WEEK8_CLOSURE_GATE';
  status: 'READY_TO_CLOSE' | 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    actionRequired: number;
    blocked: number;
  };
  checks: ClosureCheck[];
  blockers: string[];
  closeActions: string[];
};

export function buildWeek8ClosureGate(input: {
  checks: ClosureCheck[];
  closeActions: string[];
  generatedAt?: Date;
}): Week8ClosureGate {
  const checks = input.checks.map(normalizeCheck).filter((check) => check.name.length > 0);
  const blockedChecks = checks.filter((check) => check.status === 'BLOCKED');
  const actionRequiredChecks = checks.filter((check) => check.status === 'ACTION_REQUIRED');
  const blockers = [...blockedChecks, ...actionRequiredChecks].map((check) => (
    check.detail ? `${check.name}: ${check.detail}` : check.name
  ));

  return {
    mode: 'WEEK8_CLOSURE_GATE',
    status: decideStatus(blockedChecks, actionRequiredChecks),
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      total: checks.length,
      ready: checks.filter((check) => isGreenStatus(check.status)).length,
      actionRequired: actionRequiredChecks.length,
      blocked: blockedChecks.length,
    },
    checks,
    blockers,
    closeActions: normalizeList(input.closeActions),
  };
}

export function buildDefaultWeek8ClosureGate(input: {
  generatedAt?: Date;
} = {}): Week8ClosureGate {
  return buildWeek8ClosureGate({
    generatedAt: input.generatedAt,
    checks: [
      { name: 'monthly audit run', status: 'ACTION_REQUIRED', detail: 'main branch drift, team process confirmation, moderate dependency risk' },
      { name: 'quality action tracker', status: 'ACTION_REQUIRED', detail: '2 open actions and 1 blocked repository admin action' },
      { name: 'blocker resolution', status: 'ACTION_REQUIRED', detail: '3 human blockers still need cleared or accepted decision' },
      { name: 'closure consistency', status: 'READY', detail: '6 closure surfaces include blocker resolution, evidence handoff and remaining work markers' },
      { name: 'closure evidence handoff', status: 'READY', detail: 'evidence pack hands off to evidence intake and final closure artifact' },
      { name: 'evidence intake', status: 'ACTION_REQUIRED', detail: '3 required human evidence topics still need confirmation' },
      { name: 'knowledge index', status: 'READY', detail: '41 knowledge items and 30 command-backed assets' },
      { name: 'quarter plan', status: 'READY', detail: 'Q2 quality roadmap drafted' },
      { name: 'review meeting pack', status: 'READY', detail: 'agenda, decisions and actions prepared' },
    ],
    closeActions: [
      'Run the quality review meeting and record decisions.',
      'Resolve repository admin blocker for branch protection and PR review rules.',
      'Confirm rebase/merge strategy before marking Week 8 complete.',
    ],
  });
}

function normalizeCheck(check: ClosureCheck): ClosureCheck {
  return {
    name: check.name.trim(),
    status: check.status,
    detail: check.detail?.trim() || undefined,
  };
}

function decideStatus(
  blockedChecks: ClosureCheck[],
  actionRequiredChecks: ClosureCheck[]
): Week8ClosureGate['status'] {
  if (blockedChecks.length > 0) {
    return 'BLOCKED';
  }

  if (actionRequiredChecks.length > 0) {
    return 'ACTION_REQUIRED';
  }

  return 'READY_TO_CLOSE';
}

function isGreenStatus(status: ClosureCheckStatus): boolean {
  return ['READY', 'PASSED', 'DONE', 'RESOLVED', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE'].includes(status);
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
