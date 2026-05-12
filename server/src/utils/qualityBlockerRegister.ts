export type QualityBlockerSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type QualityBlockerStatus = 'OPEN' | 'CLEARED';

export type QualityBlocker = {
  item: string;
  owner: string;
  impact: string;
  nextAction: string;
  evidenceRequired: string;
  severity: QualityBlockerSeverity;
  status: QualityBlockerStatus;
};

export type QualityBlockerRegister = {
  mode: 'QUALITY_BLOCKER_REGISTER';
  status: 'CLEAR' | 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  summary: {
    total: number;
    open: number;
    cleared: number;
    highSeverity: number;
    missingOwner: number;
    missingEvidenceRequirement: number;
  };
  blockers: QualityBlocker[];
  gaps: string[];
};

export function buildQualityBlockerRegister(input: {
  blockers: QualityBlocker[];
  generatedAt?: Date;
}): QualityBlockerRegister {
  const blockers = input.blockers.map(normalizeBlocker).filter((blocker) => blocker.item.length > 0);
  const missingOwnerGaps = blockers
    .filter((blocker) => !blocker.owner)
    .map((blocker) => `blocker owner is missing: ${blocker.item}`);
  const missingNextActionGaps = blockers
    .filter((blocker) => !blocker.nextAction)
    .map((blocker) => `blocker nextAction is missing: ${blocker.item}`);
  const missingEvidenceGaps = blockers
    .filter((blocker) => !blocker.evidenceRequired)
    .map((blocker) => `blocker evidenceRequired is missing: ${blocker.item}`);
  const gaps = [...missingOwnerGaps, ...missingNextActionGaps, ...missingEvidenceGaps];
  const summary = {
    total: blockers.length,
    open: blockers.filter((blocker) => blocker.status === 'OPEN').length,
    cleared: blockers.filter((blocker) => blocker.status === 'CLEARED').length,
    highSeverity: blockers.filter((blocker) => blocker.severity === 'HIGH').length,
    missingOwner: missingOwnerGaps.length,
    missingEvidenceRequirement: missingEvidenceGaps.length,
  };

  return {
    mode: 'QUALITY_BLOCKER_REGISTER',
    status: decideStatus(summary, gaps),
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary,
    blockers,
    gaps,
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

function decideStatus(
  summary: QualityBlockerRegister['summary'],
  gaps: string[]
): QualityBlockerRegister['status'] {
  if (gaps.length > 0) {
    return 'BLOCKED';
  }

  if (summary.open > 0) {
    return 'ACTION_REQUIRED';
  }

  return 'CLEAR';
}
