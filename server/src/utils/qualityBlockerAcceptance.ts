export type QualityBlockerAcceptanceInput = {
  item: string;
  acceptedBy: string;
  acceptedAt: string;
  rationale: string;
  expiresAt: string;
  evidenceRef: string;
};

export type QualityBlockerAcceptanceItem = QualityBlockerAcceptanceInput & {
  status: 'ACCEPTED' | 'INCOMPLETE';
};

export type QualityBlockerAcceptance = {
  mode: 'QUALITY_BLOCKER_ACCEPTANCE';
  status: 'ACCEPTED' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    required: number;
    accepted: number;
    missing: number;
    incomplete: number;
  };
  acceptedItems: QualityBlockerAcceptanceItem[];
  gaps: string[];
};

export function buildQualityBlockerAcceptance(input: {
  requiredItems: string[];
  acceptances: QualityBlockerAcceptanceInput[];
  generatedAt?: Date;
}): QualityBlockerAcceptance {
  const requiredItems = normalizeList(input.requiredItems);
  const acceptanceMap = new Map(
    input.acceptances.map((acceptance) => [acceptance.item.trim(), normalizeAcceptance(acceptance)]),
  );
  const acceptedItems: QualityBlockerAcceptanceItem[] = requiredItems.flatMap((item) => {
    const acceptance = acceptanceMap.get(item);

    if (!acceptance) {
      return [];
    }

    return [
      {
        ...acceptance,
        status: isComplete(acceptance) ? 'ACCEPTED' : 'INCOMPLETE',
      },
    ];
  });
  const gaps = requiredItems.flatMap((item) => {
    const acceptance = acceptanceMap.get(item);

    if (!acceptance) {
      return [`blocker acceptance is missing: ${item}`];
    }

    if (!isComplete(acceptance)) {
      return [`blocker acceptance is incomplete: ${item}`];
    }

    return [];
  });
  const accepted = acceptedItems.filter((item) => item.status === 'ACCEPTED').length;
  const incomplete = acceptedItems.filter((item) => item.status === 'INCOMPLETE').length;

  return {
    mode: 'QUALITY_BLOCKER_ACCEPTANCE',
    status: gaps.length > 0 ? 'ACTION_REQUIRED' : 'ACCEPTED',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      required: requiredItems.length,
      accepted,
      missing: requiredItems.length - acceptedItems.length,
      incomplete,
    },
    acceptedItems,
    gaps,
  };
}

function normalizeAcceptance(acceptance: QualityBlockerAcceptanceInput): QualityBlockerAcceptanceInput {
  return {
    item: acceptance.item.trim(),
    acceptedBy: acceptance.acceptedBy.trim(),
    acceptedAt: acceptance.acceptedAt.trim(),
    rationale: acceptance.rationale.trim(),
    expiresAt: acceptance.expiresAt.trim(),
    evidenceRef: acceptance.evidenceRef.trim(),
  };
}

function isComplete(acceptance: QualityBlockerAcceptanceInput): boolean {
  return Boolean(
    acceptance.item &&
    acceptance.acceptedBy &&
    acceptance.acceptedAt &&
    acceptance.rationale &&
    acceptance.expiresAt &&
    acceptance.evidenceRef
  );
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
