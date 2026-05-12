import { QualityBlocker, QualityBlockerSeverity } from './qualityBlockerRegister';

export type QualityOwnerAssignmentItem = {
  item: string;
  impact: string;
  nextAction: string;
  evidenceRequired: string;
  severity: QualityBlockerSeverity;
};

export type QualityOwnerAssignment = {
  owner: string;
  items: QualityOwnerAssignmentItem[];
  evidenceRefs: string[];
  message: string;
};

export type QualityOwnerAssignmentPack = {
  mode: 'QUALITY_OWNER_ASSIGNMENT_PACK';
  status: 'READY' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    ownerCount: number;
    openAssignmentCount: number;
    highSeverityAssignmentCount: number;
  };
  assignments: QualityOwnerAssignment[];
};

export function buildQualityOwnerAssignmentPack(input: {
  blockers: QualityBlocker[];
  generatedAt?: Date;
}): QualityOwnerAssignmentPack {
  const openBlockers = input.blockers
    .map(normalizeBlocker)
    .filter((blocker) => blocker.status === 'OPEN' && blocker.item.length > 0);
  const ownerMap = new Map<string, QualityOwnerAssignmentItem[]>();

  for (const blocker of openBlockers) {
    const owner = blocker.owner || 'UNASSIGNED';
    const items = ownerMap.get(owner) ?? [];
    items.push({
      item: blocker.item,
      impact: blocker.impact,
      nextAction: blocker.nextAction,
      evidenceRequired: blocker.evidenceRequired,
      severity: blocker.severity,
    });
    ownerMap.set(owner, items);
  }

  const assignments = Array.from(ownerMap.entries()).map(([owner, items]) => ({
    owner,
    items,
    evidenceRefs: items.map((item) => item.evidenceRequired),
    message: buildMessage(items),
  }));

  return {
    mode: 'QUALITY_OWNER_ASSIGNMENT_PACK',
    status: assignments.length > 0 ? 'ACTION_REQUIRED' : 'READY',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      ownerCount: assignments.length,
      openAssignmentCount: openBlockers.length,
      highSeverityAssignmentCount: openBlockers.filter((blocker) => blocker.severity === 'HIGH').length,
    },
    assignments,
  };
}

function normalizeBlocker(blocker: QualityBlocker): QualityBlocker {
  return {
    item: blocker.item.trim(),
    owner: blocker.owner.trim(),
    impact: blocker.impact.trim(),
    nextAction: blocker.nextAction.trim(),
    evidenceRequired: blocker.evidenceRequired.trim(),
    severity: blocker.severity,
    status: blocker.status,
  };
}

function buildMessage(items: QualityOwnerAssignmentItem[]): string {
  const itemNames = items.map((item) => item.item).join('、');
  const evidenceRefs = items.map((item) => item.evidenceRequired).join('、');

  return `请处理 ${items.length} 个质量阻塞项：${itemNames}。完成后回填证据：${evidenceRefs}。`;
}
