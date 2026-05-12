export type QualityPostCompletionFollowupStatus = 'OPEN' | 'BLOCKED' | 'DONE';
export type QualityPostCompletionDeadlineHealth = 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'DONE' | 'UNDATED';

export type QualityPostCompletionFollowupItem = {
  risk: string;
  action: string;
  owner: string;
  dueDate: string;
  evidenceRef: string;
  status: QualityPostCompletionFollowupStatus;
  blocker?: string;
  deadlineHealth?: QualityPostCompletionDeadlineHealth;
  daysUntilDue?: number;
};

export type QualityPostCompletionFollowupUpdate = {
  risk: string;
  status: QualityPostCompletionFollowupStatus;
  evidenceRef?: string;
  blocker?: string;
};

export type QualityPostCompletionFollowup = {
  mode: 'QUALITY_POST_COMPLETION_FOLLOWUP';
  status: 'DONE' | 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  source: {
    mode: 'ATLAS_QUALITY_COMPLETION';
    authorizationRef: string;
  };
  summary: {
    total: number;
    open: number;
    blocked: number;
    done: number;
    missingOwner: number;
    missingDueDate: number;
    missingEvidence: number;
    missingAction: number;
  };
  deadlineSummary: {
    overdue: number;
    dueSoon: number;
    onTrack: number;
    done: number;
    undated: number;
    nearestDueDate?: string;
  };
  ownerSummary: QualityPostCompletionOwnerSummary[];
  followUps: QualityPostCompletionFollowupItem[];
  deadlineAlerts: string[];
  gaps: string[];
  nextCommands: string[];
};

export type QualityPostCompletionOwnerSummary = {
  owner: string;
  total: number;
  open: number;
  blocked: number;
  done: number;
  overdue: number;
  dueSoon: number;
  undated: number;
  alerts: number;
  nearestDueDate?: string;
};

export function buildDefaultQualityPostCompletionFollowup(input: {
  generatedAt?: Date;
  updates?: QualityPostCompletionFollowupUpdate[];
} = {}): QualityPostCompletionFollowup {
  const authorizationRef = 'chat#2026-05-06-direct-to-100';

  return buildQualityPostCompletionFollowup({
    generatedAt: input.generatedAt,
    source: {
      mode: 'ATLAS_QUALITY_COMPLETION',
      authorizationRef,
    },
    updates: input.updates,
    followUps: [
      {
        risk: '质量回顾会实会确认',
        action: '归档后补会议纪要',
        owner: 'AI 代码守护人',
        dueDate: '2026-05-15',
        evidenceRef: authorizationRef,
        status: 'OPEN',
      },
      {
        risk: '分支保护和 PR 审查规则',
        action: '仓库管理员补 GitHub Settings 截图',
        owner: '产品负责人',
        dueDate: '2026-05-15',
        evidenceRef: authorizationRef,
        status: 'OPEN',
      },
      {
        risk: 'rebase/merge 策略',
        action: '归档后执行 merge 策略确认',
        owner: 'release owner',
        dueDate: '2026-05-10',
        evidenceRef: authorizationRef,
        status: 'OPEN',
      },
    ],
  });
}

export function buildQualityPostCompletionFollowup(input: {
  source: QualityPostCompletionFollowup['source'];
  followUps: QualityPostCompletionFollowupItem[];
  updates?: QualityPostCompletionFollowupUpdate[];
  generatedAt?: Date;
}): QualityPostCompletionFollowup {
  const inputRecord: Record<string, unknown> = isRecord(input) ? input : {};
  const rawSource: Record<string, unknown> = isRecord(inputRecord.source) ? inputRecord.source : {};
  const sourceMode = trimText(rawSource.mode);
  const source = {
    mode: sourceMode as 'ATLAS_QUALITY_COMPLETION',
    authorizationRef: trimText(rawSource.authorizationRef),
  };
  const generatedAt = normalizeGeneratedAt(inputRecord.generatedAt);
  const rawUpdates = inputRecord.updates as QualityPostCompletionFollowupUpdate[] | undefined;
  const normalizedUpdates = normalizeUpdates(rawUpdates ?? []);
  const invalidUpdateItemGaps = collectInvalidUpdateItemGaps(rawUpdates ?? []);
  const duplicateUpdateTargets = findDuplicateUpdateTargets(normalizedUpdates);
  const rawFollowUps: unknown[] = Array.isArray(inputRecord.followUps) ? inputRecord.followUps : [];
  const invalidFollowupItemGaps = rawFollowUps
    .filter((followup: unknown) => !isRecord(followup))
    .map(() => 'follow-up item is invalid');
  const rawFollowupRecords = rawFollowUps.filter(isRecord);
  const primaryRawFollowupRecords = uniqueRawFollowupRecordsByRisk(rawFollowupRecords);
  const invalidFollowupStatusGaps = primaryRawFollowupRecords
    .filter((followup) => trimText(followup.risk) && !isFollowupStatus(followup.status))
    .map((followup) => `follow-up item status is invalid: ${trimText(followup.risk)} (${String(followup.status)})`);
  const openFollowupBlockerGaps = primaryRawFollowupRecords
    .filter((followup) => trimText(followup.risk) && followup.status === 'OPEN' && trimText(followup.blocker))
    .map((followup) => `follow-up OPEN item blocker must be empty: ${trimText(followup.risk)}`);
  const doneFollowupBlockerGaps = primaryRawFollowupRecords
    .filter((followup) => trimText(followup.risk) && followup.status === 'DONE' && trimText(followup.blocker))
    .map((followup) => `follow-up DONE item blocker must be empty: ${trimText(followup.risk)}`);
  const doneFollowupAuthorizationGaps = primaryRawFollowupRecords
    .filter((followup) => (
      trimText(followup.risk) &&
      followup.status === 'DONE' &&
      source.authorizationRef &&
      trimText(followup.evidenceRef) &&
      trimText(followup.evidenceRef) === source.authorizationRef
    ))
    .map((followup) => `follow-up DONE item evidenceRef must differ from authorizationRef: ${trimText(followup.risk)}`);
  const normalizedFollowUps = rawFollowupRecords
    .map((followup) => normalizeFollowup(
      followup as unknown as QualityPostCompletionFollowupItem,
      generatedAt,
      source.authorizationRef
    ));
  const followupRiskGaps = normalizedFollowUps
    .filter((followup) => !followup.risk)
    .map(() => 'follow-up risk is missing');
  const candidateFollowUps = normalizedFollowUps
    .filter((followup) => followup.risk.length > 0);
  const baseFollowUps = uniqueFollowUpsByRisk(candidateFollowUps);
  const unsafeUpdateTargets = findUnsafeUpdateTargets(normalizedUpdates, source.authorizationRef, baseFollowUps);
  const followUps = applyUpdates(
    baseFollowUps,
    normalizedUpdates,
    generatedAt,
    [...duplicateUpdateTargets, ...unsafeUpdateTargets]
  );
  const listGaps = followUps.length === 0 ? ['follow-up list is empty'] : [];
  const itemGaps = followUps.flatMap(followupGaps);
  const itemSafetyGaps = followUps.flatMap((followup) => validateFollowupSafety(followup, source.authorizationRef));
  const duplicateFollowupGaps = findDuplicateFollowupRisks(candidateFollowUps)
    .map((risk) => `follow-up risk is duplicated: ${risk}`);
  const updateRiskGaps = normalizedUpdates
    .filter((update) => !update.risk)
    .map(() => 'follow-up update risk is missing');
  const updateGaps = normalizedUpdates
    .filter((update) => update.risk && !baseFollowUps.some((followup) => followup.risk === update.risk))
    .map((update) => `follow-up update target is missing: ${update.risk}`);
  const duplicateUpdateGaps = duplicateUpdateTargets.map((risk) => `follow-up update target is duplicated: ${risk}`);
  const updateSafetyGaps = normalizedUpdates
    .filter((update) => !duplicateUpdateTargets.includes(update.risk))
    .flatMap((update) => (
      validateUpdateSafety(update, source.authorizationRef, baseFollowUps.find((followup) => followup.risk === update.risk))
    ));
  const gaps = [
    ...(sourceMode !== 'ATLAS_QUALITY_COMPLETION' ? [`source mode is invalid: ${sourceMode}`] : []),
    ...(!source.authorizationRef ? ['authorizationRef is missing'] : []),
    ...listGaps,
    ...invalidFollowupItemGaps,
    ...followupRiskGaps,
    ...itemGaps,
    ...itemSafetyGaps,
    ...invalidFollowupStatusGaps,
    ...openFollowupBlockerGaps,
    ...doneFollowupBlockerGaps,
    ...doneFollowupAuthorizationGaps,
    ...duplicateFollowupGaps,
    ...invalidUpdateItemGaps,
    ...updateRiskGaps,
    ...updateGaps,
    ...duplicateUpdateGaps,
    ...updateSafetyGaps,
  ];
  const summary = {
    total: followUps.length,
    open: followUps.filter((followup) => followup.status === 'OPEN').length,
    blocked: followUps.filter((followup) => followup.status === 'BLOCKED').length,
    done: followUps.filter((followup) => followup.status === 'DONE').length,
    missingOwner: itemGaps.filter((gap) => gap.startsWith('follow-up owner is missing:')).length,
    missingDueDate: itemGaps.filter((gap) => gap.startsWith('follow-up dueDate is missing:')).length,
    missingEvidence: itemGaps.filter((gap) => gap.startsWith('follow-up evidenceRef is missing:')).length,
    missingAction: itemGaps.filter((gap) => gap.startsWith('follow-up action is missing:')).length,
  };
  const deadlineSummary = buildDeadlineSummary(followUps);

  return {
    mode: 'QUALITY_POST_COMPLETION_FOLLOWUP',
    status: decideStatus(summary, gaps),
    generatedAt: generatedAt.toISOString(),
    source,
    summary,
    deadlineSummary,
    ownerSummary: buildOwnerSummary(followUps),
    followUps,
    deadlineAlerts: buildDeadlineAlerts(followUps),
    gaps,
    nextCommands: [
      'npm run quality:post-completion-followup --workspace=server',
      'npm run quality:progress-guard --workspace=server -- --min-week8-progress 100 --evidence QUALITY_POST_COMPLETION_FOLLOWUP --changelog quality:post-completion-followup',
    ],
  };
}

function validateUpdateSafety(
  update: QualityPostCompletionFollowupUpdate,
  authorizationRef: string,
  originalFollowup?: QualityPostCompletionFollowupItem
): string[] {
  if (!update.risk) {
    return [];
  }

  if (!originalFollowup) {
    return [];
  }

  if (!isFollowupStatus(update.status)) {
    return [`follow-up update status is invalid: ${update.risk} (${String(update.status)})`];
  }

  return [
    ...(update.status === 'DONE' && !update.evidenceRef
      ? [`follow-up DONE update evidenceRef is missing: ${update.risk}`]
      : []),
    ...(update.status === 'DONE' && update.evidenceRef && update.evidenceRef === authorizationRef
      ? [`follow-up DONE update evidenceRef must differ from authorizationRef: ${update.risk}`]
      : []),
    ...(update.status === 'DONE' && update.evidenceRef && originalFollowup?.evidenceRef === update.evidenceRef
      ? [`follow-up DONE update evidenceRef must differ from original evidenceRef: ${update.risk}`]
      : []),
    ...(update.status === 'DONE' && update.blocker
      ? [`follow-up DONE update blocker must be empty: ${update.risk}`]
      : []),
    ...(update.status === 'BLOCKED' && !update.blocker
      ? [`follow-up BLOCKED update blocker is missing: ${update.risk}`]
      : []),
    ...(update.status === 'BLOCKED' && update.evidenceRef
      ? [`follow-up BLOCKED update evidenceRef must be empty: ${update.risk}`]
      : []),
    ...(update.status === 'OPEN' && update.blocker
      ? [`follow-up OPEN update blocker must be empty: ${update.risk}`]
      : []),
    ...(update.status === 'OPEN' && update.evidenceRef
      ? [`follow-up OPEN update evidenceRef must be empty: ${update.risk}`]
      : []),
  ];
}

function validateFollowupSafety(
  followup: QualityPostCompletionFollowupItem,
  authorizationRef: string
): string[] {
  if (!isFollowupStatus(followup.status)) {
    return [`follow-up item status is invalid: ${followup.risk} (${String(followup.status)})`];
  }

  return [
    ...(followup.status === 'DONE' && followup.evidenceRef && followup.evidenceRef === authorizationRef
      ? [`follow-up DONE item evidenceRef must differ from authorizationRef: ${followup.risk}`]
      : []),
    ...(followup.status === 'DONE' && followup.blocker
      ? [`follow-up DONE item blocker must be empty: ${followup.risk}`]
      : []),
    ...(followup.status === 'OPEN' && followup.blocker
      ? [`follow-up OPEN item blocker must be empty: ${followup.risk}`]
      : []),
  ];
}

function findUnsafeUpdateTargets(
  updates: QualityPostCompletionFollowupUpdate[],
  authorizationRef: string,
  baseFollowUps: QualityPostCompletionFollowupItem[]
): string[] {
  return [...new Set(
    updates
      .filter((update) => update.risk.length > 0)
      .filter((update) => validateUpdateSafety(
        update,
        authorizationRef,
        baseFollowUps.find((followup) => followup.risk === update.risk)
      ).length > 0)
      .map((update) => update.risk)
  )];
}

function findDuplicateUpdateTargets(updates: QualityPostCompletionFollowupUpdate[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const update of updates) {
    if (!update.risk) {
      continue;
    }

    if (seen.has(update.risk)) {
      duplicated.add(update.risk);
    } else {
      seen.add(update.risk);
    }
  }

  return [...duplicated];
}

function findDuplicateFollowupRisks(followUps: QualityPostCompletionFollowupItem[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const followup of followUps) {
    if (seen.has(followup.risk)) {
      duplicated.add(followup.risk);
    } else {
      seen.add(followup.risk);
    }
  }

  return [...duplicated];
}

function uniqueFollowUpsByRisk(followUps: QualityPostCompletionFollowupItem[]): QualityPostCompletionFollowupItem[] {
  const seen = new Set<string>();

  return followUps.filter((followup) => {
    if (seen.has(followup.risk)) {
      return false;
    }

    seen.add(followup.risk);
    return true;
  });
}

function uniqueRawFollowupRecordsByRisk(followUps: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();

  return followUps.filter((followup) => {
    const risk = trimText(followup.risk);
    if (!risk) {
      return true;
    }

    if (seen.has(risk)) {
      return false;
    }

    seen.add(risk);
    return true;
  });
}

export function renderQualityPostCompletionFollowupMarkdown(followup: QualityPostCompletionFollowup): string {
  return [
    '# 100% 后补证跟踪',
    '',
    `- status: ${followup.status}`,
    `- generatedAt: ${followup.generatedAt}`,
    `- total/open/blocked/done: ${followup.summary.total}/${followup.summary.open}/${followup.summary.blocked}/${followup.summary.done}`,
    `- missing owner/dueDate/evidence/action: ${followup.summary.missingOwner}/${followup.summary.missingDueDate}/${followup.summary.missingEvidence}/${followup.summary.missingAction}`,
    `- deadline overdue/dueSoon/onTrack/done/undated: ${followup.deadlineSummary.overdue}/${followup.deadlineSummary.dueSoon}/${followup.deadlineSummary.onTrack}/${followup.deadlineSummary.done}/${followup.deadlineSummary.undated}`,
    `- deadlineAlerts: ${followup.deadlineAlerts.length}`,
    `- nearestDueDate: ${followup.deadlineSummary.nearestDueDate ?? '-'}`,
    '',
    '## Owner Summary',
    '',
    '| Owner | Total | Open | Blocked | Done | Overdue | DueSoon | Undated | Alerts | Nearest Due |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...followup.ownerSummary.map((owner) => (
      `| ${markdownTableCell(owner.owner)} | ${owner.total} | ${owner.open} | ${owner.blocked} | ${owner.done} | ${owner.overdue} | ${owner.dueSoon} | ${owner.undated} | ${owner.alerts} | ${markdownTableCell(owner.nearestDueDate ?? '-')} |`
    )),
    '',
    '## Follow-Ups',
    '',
    '| Risk | Action | Owner | Status | Deadline | Health | Evidence | Blocker |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...followup.followUps.map((item) => (
      `| ${markdownTableCell(item.risk)} | ${markdownTableCell(item.action || '未填写')} | ${markdownTableCell(ownerSummaryLabel(item.owner))} | ${item.status} | ${markdownTableCell(item.dueDate || '未填写')} | ${item.deadlineHealth ?? '-'} | ${markdownTableCell(item.evidenceRef || '未填写')} | ${markdownTableCell(item.blocker ?? (item.status === 'BLOCKED' ? '未填写' : '-'))} |`
    )),
    '',
    '## Deadline Alerts',
    '',
    ...(followup.deadlineAlerts.length > 0
      ? followup.deadlineAlerts.map((alert) => `- ${markdownInlineText(alert)}`)
      : ['- none']),
    ...(followup.gaps.length > 0
      ? [
          '',
          '## Gaps',
          '',
          ...followup.gaps.map((gap) => `- ${markdownInlineText(gap)}`),
        ]
      : []),
  ].join('\n');
}

function markdownTableCell(value: string): string {
  return markdownInlineText(value).replaceAll('|', '\\|');
}

function markdownInlineText(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '<br>');
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeGeneratedAt(value: unknown): Date {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
}

function buildOwnerSummary(followUps: QualityPostCompletionFollowupItem[]): QualityPostCompletionOwnerSummary[] {
  const owners = [...new Set(followUps.map((followup) => ownerSummaryLabel(followup.owner)))];

  return owners.map((owner, index) => {
    const ownerFollowUps = followUps.filter((followup) => ownerSummaryLabel(followup.owner) === owner);
    const activeDueDates = ownerFollowUps
      .filter((followup) => followup.status !== 'DONE' && isValidDateOnly(followup.dueDate))
      .map((followup) => followup.dueDate)
      .sort();

    return {
      owner,
      total: ownerFollowUps.length,
      open: ownerFollowUps.filter((followup) => followup.status === 'OPEN').length,
      blocked: ownerFollowUps.filter((followup) => followup.status === 'BLOCKED').length,
      done: ownerFollowUps.filter((followup) => followup.status === 'DONE').length,
      overdue: ownerFollowUps.filter((followup) => followup.deadlineHealth === 'OVERDUE').length,
      dueSoon: ownerFollowUps.filter((followup) => followup.deadlineHealth === 'DUE_SOON').length,
      undated: ownerFollowUps.filter((followup) => followup.deadlineHealth === 'UNDATED').length,
      alerts: ownerFollowUps.filter((followup) => (
        followup.deadlineHealth === 'OVERDUE' ||
        followup.deadlineHealth === 'UNDATED' ||
        followup.deadlineHealth === 'DUE_SOON'
      )).length,
      sortIndex: index,
      ...(activeDueDates[0] ? { nearestDueDate: activeDueDates[0] } : {}),
    };
  }).sort((left, right) => (
    ownerSummarySeverity(left) - ownerSummarySeverity(right) ||
    right.alerts - left.alerts ||
    (left.nearestDueDate ?? '9999-12-31').localeCompare(right.nearestDueDate ?? '9999-12-31') ||
    left.sortIndex - right.sortIndex
  )).map(({ sortIndex: _sortIndex, ...owner }) => owner);
}

function ownerSummaryLabel(owner: string): string {
  return owner || '未分派';
}

function ownerSummarySeverity(owner: QualityPostCompletionOwnerSummary): number {
  if (owner.overdue > 0) {
    return 0;
  }

  if (owner.undated > 0) {
    return 1;
  }

  if (owner.dueSoon > 0) {
    return 2;
  }

  return 3;
}

function normalizeUpdates(updates: QualityPostCompletionFollowupUpdate[]): QualityPostCompletionFollowupUpdate[] {
  if (!Array.isArray(updates)) {
    return [];
  }

  return updates
    .filter(isRecord)
    .map((update) => ({
      risk: trimText(update.risk),
      status: update.status,
      evidenceRef: trimText(update.evidenceRef) || undefined,
      blocker: trimText(update.blocker) || undefined,
    }));
}

function collectInvalidUpdateItemGaps(updates: QualityPostCompletionFollowupUpdate[]): string[] {
  if (!Array.isArray(updates)) {
    return [];
  }

  return updates
    .filter((update) => !isRecord(update))
    .map(() => 'follow-up update item is invalid');
}

function applyUpdates(
  followUps: QualityPostCompletionFollowupItem[],
  updates: QualityPostCompletionFollowupUpdate[],
  generatedAt: Date,
  skippedRisks: string[] = []
): QualityPostCompletionFollowupItem[] {
  return followUps.map((followup) => {
    if (skippedRisks.includes(followup.risk)) {
      return followup;
    }

    const update = updates.find((candidate) => candidate.risk === followup.risk && isFollowupStatus(candidate.status));
    if (!update) {
      return followup;
    }

    return normalizeFollowup(
      {
        ...followup,
        status: update.status,
        evidenceRef: update.evidenceRef ?? followup.evidenceRef,
        blocker: update.blocker,
      },
      generatedAt
    );
  });
}

function normalizeFollowup(
  followup: QualityPostCompletionFollowupItem,
  generatedAt: Date,
  authorizationRef = ''
): QualityPostCompletionFollowupItem {
  const normalized = {
    risk: trimText(followup.risk),
    action: trimText(followup.action),
    owner: trimText(followup.owner),
    dueDate: trimText(followup.dueDate),
    evidenceRef: trimText(followup.evidenceRef),
    status: normalizeFollowupStatus(
      followup.status,
      {
        action: trimText(followup.action),
        owner: trimText(followup.owner),
        dueDate: trimText(followup.dueDate),
        evidenceRef: trimText(followup.evidenceRef),
        blocker: trimText(followup.blocker),
      },
      authorizationRef
    ),
  };
  const deadline = calculateDeadlineHealth(normalized.dueDate, normalized.status, generatedAt);

  return {
    ...normalized,
    ...deadline,
    ...(normalized.status === 'BLOCKED' && trimText(followup.blocker) ? { blocker: trimText(followup.blocker) } : {}),
  };
}

function normalizeFollowupStatus(
  status: unknown,
  requiredFields: Pick<QualityPostCompletionFollowupItem, 'action' | 'owner' | 'dueDate' | 'evidenceRef' | 'blocker'>,
  authorizationRef: string
): QualityPostCompletionFollowupStatus {
  if (!isFollowupStatus(status)) {
    return 'OPEN';
  }

  if (
    status === 'DONE' &&
    (!requiredFields.action || !requiredFields.owner || !requiredFields.dueDate || !requiredFields.evidenceRef)
  ) {
    return 'OPEN';
  }

  if (status === 'DONE' && requiredFields.evidenceRef === authorizationRef) {
    return 'OPEN';
  }

  if (status === 'DONE' && !isValidDateOnly(requiredFields.dueDate)) {
    return 'OPEN';
  }

  if (status === 'DONE' && requiredFields.blocker) {
    return 'OPEN';
  }

  return status;
}

function followupGaps(followup: QualityPostCompletionFollowupItem): string[] {
  return [
    ...(!followup.owner ? [`follow-up owner is missing: ${followup.risk}`] : []),
    ...(!followup.dueDate ? [`follow-up dueDate is missing: ${followup.risk}`] : []),
    ...(followup.dueDate && !isDateOnly(followup.dueDate) ? [`follow-up dueDate format is invalid: ${followup.risk} (${followup.dueDate})`] : []),
    ...(followup.dueDate && isDateOnly(followup.dueDate) && !isValidDateOnly(followup.dueDate)
      ? [`follow-up dueDate value is invalid: ${followup.risk} (${followup.dueDate})`]
      : []),
    ...(!followup.evidenceRef ? [`follow-up evidenceRef is missing: ${followup.risk}`] : []),
    ...(!followup.action ? [`follow-up action is missing: ${followup.risk}`] : []),
    ...(followup.status === 'BLOCKED' && !followup.blocker ? [`follow-up BLOCKED item blocker is missing: ${followup.risk}`] : []),
    ...(followup.status === 'BLOCKED' && followup.blocker ? [`${followup.risk}: ${followup.blocker}`] : []),
  ];
}

function decideStatus(
  summary: QualityPostCompletionFollowup['summary'],
  gaps: string[]
): QualityPostCompletionFollowup['status'] {
  if (gaps.length > 0) {
    return 'BLOCKED';
  }

  if (summary.open > 0 || summary.blocked > 0) {
    return 'ACTION_REQUIRED';
  }

  return 'DONE';
}

function calculateDeadlineHealth(
  dueDate: string,
  status: QualityPostCompletionFollowupStatus,
  generatedAt: Date
): Pick<QualityPostCompletionFollowupItem, 'deadlineHealth' | 'daysUntilDue'> {
  if (!dueDate || !isValidDateOnly(dueDate)) {
    return { deadlineHealth: 'UNDATED' };
  }

  if (status === 'DONE') {
    return { deadlineHealth: 'DONE' };
  }

  const daysUntilDue = daysBetweenDateOnly(toDateOnly(generatedAt), dueDate);

  if (daysUntilDue < 0) {
    return { deadlineHealth: 'OVERDUE', daysUntilDue };
  }

  if (daysUntilDue <= 5) {
    return { deadlineHealth: 'DUE_SOON', daysUntilDue };
  }

  return { deadlineHealth: 'ON_TRACK', daysUntilDue };
}

function buildDeadlineSummary(
  followUps: QualityPostCompletionFollowupItem[]
): QualityPostCompletionFollowup['deadlineSummary'] {
  const activeDueDates = followUps
    .filter((followup) => followup.status !== 'DONE' && isValidDateOnly(followup.dueDate))
    .map((followup) => followup.dueDate)
    .sort();

  return {
    overdue: followUps.filter((followup) => followup.deadlineHealth === 'OVERDUE').length,
    dueSoon: followUps.filter((followup) => followup.deadlineHealth === 'DUE_SOON').length,
    onTrack: followUps.filter((followup) => followup.deadlineHealth === 'ON_TRACK').length,
    done: followUps.filter((followup) => followup.deadlineHealth === 'DONE').length,
    undated: followUps.filter((followup) => followup.deadlineHealth === 'UNDATED').length,
    ...(activeDueDates[0] ? { nearestDueDate: activeDueDates[0] } : {}),
  };
}

function buildDeadlineAlerts(followUps: QualityPostCompletionFollowupItem[]): string[] {
  return followUps
    .map((followup, index) => ({ followup, index }))
    .sort((left, right) => (
      deadlineAlertSeverity(left.followup.deadlineHealth) - deadlineAlertSeverity(right.followup.deadlineHealth) ||
      deadlineAlertUrgency(left.followup) - deadlineAlertUrgency(right.followup) ||
      left.index - right.index
    ))
    .flatMap(({ followup }) => {
    if (followup.deadlineHealth === 'UNDATED') {
      return [
        followup.dueDate
          ? `${followup.risk} invalid due date: ${followup.dueDate}`
          : `${followup.risk} missing due date`,
      ];
    }

    if (followup.deadlineHealth === 'OVERDUE' && typeof followup.daysUntilDue === 'number') {
      return [`${followup.risk} overdue by ${Math.abs(followup.daysUntilDue)} day(s): ${followup.dueDate}`];
    }

    if (followup.deadlineHealth === 'DUE_SOON' && typeof followup.daysUntilDue === 'number') {
      return [`${followup.risk} due in ${followup.daysUntilDue} day(s): ${followup.dueDate}`];
    }

    return [];
  });
}

function deadlineAlertSeverity(deadlineHealth?: QualityPostCompletionDeadlineHealth): number {
  if (deadlineHealth === 'OVERDUE') {
    return 0;
  }

  if (deadlineHealth === 'UNDATED') {
    return 1;
  }

  if (deadlineHealth === 'DUE_SOON') {
    return 2;
  }

  return 3;
}

function deadlineAlertUrgency(followup: QualityPostCompletionFollowupItem): number {
  if (
    (followup.deadlineHealth === 'OVERDUE' || followup.deadlineHealth === 'DUE_SOON') &&
    typeof followup.daysUntilDue === 'number'
  ) {
    return followup.daysUntilDue;
  }

  return 0;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidDateOnly(value: string): boolean {
  if (!isDateOnly(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));

  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function isFollowupStatus(value: unknown): value is QualityPostCompletionFollowupStatus {
  return value === 'OPEN' || value === 'BLOCKED' || value === 'DONE';
}

function daysBetweenDateOnly(from: string, to: string): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / millisPerDay);
}
