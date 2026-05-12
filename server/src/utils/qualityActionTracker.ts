export type QualityActionStatus = 'OPEN' | 'BLOCKED' | 'DONE';

export type QualityActionItem = {
  task: string;
  owner: string;
  dueDate: string;
  source: string;
  status: QualityActionStatus;
  blocker?: string;
};

export type QualityActionTracker = {
  mode: 'QUALITY_ACTION_TRACKER';
  status: 'DONE' | 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  summary: {
    total: number;
    open: number;
    blocked: number;
    done: number;
    missingOwner: number;
    missingDueDate: number;
  };
  actions: QualityActionItem[];
  blockers: string[];
};

export function buildQualityActionTracker(input: {
  actions: QualityActionItem[];
  generatedAt?: Date;
}): QualityActionTracker {
  const actions = input.actions.map(normalizeAction).filter((action) => action.task.length > 0);
  const missingOwnerBlockers = actions
    .filter((action) => !action.owner)
    .map((action) => `action owner is missing: ${action.task}`);
  const missingDueDateBlockers = actions
    .filter((action) => !action.dueDate)
    .map((action) => `action dueDate is missing: ${action.task}`);
  const explicitBlockers = actions
    .filter((action) => action.status === 'BLOCKED' && action.blocker)
    .map((action) => `${action.task}: ${action.blocker}`);
  const blockers = [...missingOwnerBlockers, ...missingDueDateBlockers, ...explicitBlockers];
  const summary = {
    total: actions.length,
    open: actions.filter((action) => action.status === 'OPEN').length,
    blocked: actions.filter((action) => action.status === 'BLOCKED').length,
    done: actions.filter((action) => action.status === 'DONE').length,
    missingOwner: missingOwnerBlockers.length,
    missingDueDate: missingDueDateBlockers.length,
  };

  return {
    mode: 'QUALITY_ACTION_TRACKER',
    status: decideStatus(summary, missingOwnerBlockers, missingDueDateBlockers),
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary,
    actions,
    blockers,
  };
}

function normalizeAction(action: QualityActionItem): QualityActionItem {
  return {
    task: action.task.trim(),
    owner: action.owner.trim(),
    dueDate: action.dueDate.trim(),
    source: action.source.trim(),
    status: action.status,
    blocker: action.blocker?.trim() || undefined,
  };
}

function decideStatus(
  summary: QualityActionTracker['summary'],
  missingOwnerBlockers: string[],
  missingDueDateBlockers: string[]
): QualityActionTracker['status'] {
  if (missingOwnerBlockers.length > 0 || missingDueDateBlockers.length > 0) {
    return 'BLOCKED';
  }

  if (summary.open > 0 || summary.blocked > 0) {
    return 'ACTION_REQUIRED';
  }

  return 'DONE';
}
