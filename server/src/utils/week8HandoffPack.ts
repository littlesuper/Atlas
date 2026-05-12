export type HandoffItemStatus = 'PENDING' | 'BLOCKED' | 'CONFIRMED';

export type Week8HandoffItem = {
  topic: string;
  owner: string;
  dueDate: string;
  status: HandoffItemStatus;
  decisionRequired: string;
  blocker?: string;
};

export type Week8HandoffPack = {
  mode: 'WEEK8_HANDOFF_PACK';
  status: 'CONFIRMED' | 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  summary: {
    total: number;
    pending: number;
    blocked: number;
    confirmed: number;
    missingOwner: number;
    missingDueDate: number;
  };
  items: Week8HandoffItem[];
  blockers: string[];
};

export type Week8HandoffConfirmation = {
  topic: string;
  owner: string;
  confirmedAt: string;
  decision: string;
};

export function buildWeek8HandoffPack(input: {
  items: Week8HandoffItem[];
  generatedAt?: Date;
}): Week8HandoffPack {
  const items = input.items.map(normalizeItem).filter((item) => item.topic.length > 0);
  const missingOwnerBlockers = items
    .filter((item) => !item.owner)
    .map((item) => `handoff owner is missing: ${item.topic}`);
  const missingDueDateBlockers = items
    .filter((item) => !item.dueDate)
    .map((item) => `handoff dueDate is missing: ${item.topic}`);
  const explicitBlockers = items
    .filter((item) => item.status === 'BLOCKED' && item.blocker)
    .map((item) => `${item.topic}: ${item.blocker}`);
  const summary = {
    total: items.length,
    pending: items.filter((item) => item.status === 'PENDING').length,
    blocked: items.filter((item) => item.status === 'BLOCKED').length,
    confirmed: items.filter((item) => item.status === 'CONFIRMED').length,
    missingOwner: missingOwnerBlockers.length,
    missingDueDate: missingDueDateBlockers.length,
  };

  return {
    mode: 'WEEK8_HANDOFF_PACK',
    status: decideStatus(summary),
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary,
    items,
    blockers: [...missingOwnerBlockers, ...missingDueDateBlockers, ...explicitBlockers],
  };
}

export function buildConfirmedWeek8HandoffPack(input: {
  confirmations: Week8HandoffConfirmation[];
  generatedAt?: Date;
}): Week8HandoffPack {
  return buildWeek8HandoffPack({
    generatedAt: input.generatedAt,
    items: input.confirmations.map((confirmation) => ({
      topic: confirmation.topic,
      owner: confirmation.owner,
      dueDate: confirmation.confirmedAt,
      status: 'CONFIRMED',
      decisionRequired: confirmation.decision,
    })),
  });
}

function normalizeItem(item: Week8HandoffItem): Week8HandoffItem {
  return {
    topic: item.topic.trim(),
    owner: item.owner.trim(),
    dueDate: item.dueDate.trim(),
    status: item.status,
    decisionRequired: item.decisionRequired.trim(),
    blocker: item.blocker?.trim() || undefined,
  };
}

function decideStatus(summary: Week8HandoffPack['summary']): Week8HandoffPack['status'] {
  if (summary.missingOwner > 0 || summary.missingDueDate > 0) {
    return 'BLOCKED';
  }

  if (summary.pending > 0 || summary.blocked > 0) {
    return 'ACTION_REQUIRED';
  }

  return 'CONFIRMED';
}
