export type QualityClosureDashboardCheck = {
  name: string;
  mode: string;
  command: string;
  status: string;
  expectedStatus: string;
  nextAction: string;
};

export type QualityClosureDashboard = {
  mode: 'QUALITY_CLOSURE_DASHBOARD';
  status: 'READY' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    actionRequired: number;
  };
  currentFocus?: QualityClosureDashboardCheck;
  checks: QualityClosureDashboardCheck[];
};

export function buildQualityClosureDashboard(input: {
  checks: QualityClosureDashboardCheck[];
  generatedAt?: Date;
}): QualityClosureDashboard {
  const checks = input.checks.map(normalizeCheck).filter((check) => check.name.length > 0);
  const ready = checks.filter((check) => isReady(check)).length;
  const currentFocus = checks.find((check) => !isReady(check));

  return {
    mode: 'QUALITY_CLOSURE_DASHBOARD',
    status: currentFocus ? 'ACTION_REQUIRED' : 'READY',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      total: checks.length,
      ready,
      actionRequired: checks.length - ready,
    },
    currentFocus,
    checks,
  };
}

export function buildDefaultQualityClosureDashboard(input: {
  generatedAt?: Date;
} = {}): QualityClosureDashboard {
  return buildQualityClosureDashboard({
    generatedAt: input.generatedAt,
    checks: [
      {
        name: 'blocker register',
        mode: 'QUALITY_BLOCKER_REGISTER',
        command: 'npm run quality:blocker-register --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedStatus: 'CLEAR',
        nextAction: 'clear or explicitly accept the 3 open human blockers',
      },
      {
        name: 'blocker resolution',
        mode: 'QUALITY_BLOCKER_RESOLUTION',
        command: 'npm run quality:blocker-resolution --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedStatus: 'RESOLVED',
        nextAction: 'clear blockers or accept them explicitly before closure evidence pack',
      },
      {
        name: 'closure evidence pack',
        mode: 'QUALITY_CLOSURE_EVIDENCE_PACK',
        command: 'npm run quality:closure-evidence-pack --workspace=server',
        status: 'READY',
        expectedStatus: 'READY',
        nextAction: 'generate evidence slots before evidence handoff',
      },
      {
        name: 'closure evidence handoff',
        mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
        command: 'npm run quality:closure-evidence-handoff --workspace=server',
        status: 'READY',
        expectedStatus: 'READY',
        nextAction: 'verify evidence pack can hand off to evidence intake',
      },
      {
        name: 'owner assignments',
        mode: 'QUALITY_OWNER_ASSIGNMENT_PACK',
        command: 'npm run quality:owner-assignments --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedStatus: 'READY',
        nextAction: 'send owner assignment messages and collect responses',
      },
      {
        name: 'evidence intake',
        mode: 'QUALITY_EVIDENCE_INTAKE',
        command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
        status: 'ACTION_REQUIRED',
        expectedStatus: 'READY_TO_CONFIRM',
        nextAction: 'collect quality-review-minutes, github-settings and release-notes evidence',
      },
      {
        name: 'closure remaining work',
        mode: 'QUALITY_CLOSURE_REMAINING_WORK',
        command: 'npm run quality:closure-remaining-work --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedStatus: 'READY',
        nextAction: 'clear the 4 remaining closure work items',
      },
      {
        name: 'closure request pack',
        mode: 'QUALITY_CLOSURE_REQUEST_PACK',
        command: 'npm run quality:closure-request-pack --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedStatus: 'READY',
        nextAction: 'send the 4 owner-ready closure requests and collect evidence',
      },
      {
        name: 'closure sequence',
        mode: 'QUALITY_CLOSURE_SEQUENCE',
        command: 'npm run quality:closure-sequence --workspace=server',
        status: 'WAITING_FOR_EVIDENCE',
        expectedStatus: 'READY_TO_ARCHIVE',
        nextAction: 'complete blocker resolution, remaining work, request pack and evidence intake before team confirmations and final closure',
      },
      {
        name: 'final closure',
        mode: 'WEEK8_FINAL_CLOSURE',
        command: 'npm run quality:final-closure --workspace=server -- --artifact ...',
        status: 'ACTION_REQUIRED',
        expectedStatus: 'READY_TO_ARCHIVE',
        nextAction: 'run final closure after blocker resolution, remaining work, evidence intake and confirmations are complete',
      },
    ],
  });
}

function normalizeCheck(check: QualityClosureDashboardCheck): QualityClosureDashboardCheck {
  return {
    name: check.name.trim(),
    mode: check.mode.trim(),
    command: check.command.trim(),
    status: check.status.trim(),
    expectedStatus: check.expectedStatus.trim(),
    nextAction: check.nextAction.trim(),
  };
}

function isReady(check: QualityClosureDashboardCheck): boolean {
  return check.status === check.expectedStatus;
}
