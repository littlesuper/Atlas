export type QualityAcceptedRisk = {
  item: string;
  owner: string;
  evidenceRef: string;
  followUp: string;
};

export type QualityCompletionAuthorization = {
  mode: 'ATLAS_QUALITY_COMPLETION';
  status: 'COMPLETED' | 'ACTION_REQUIRED';
  generatedAt: string;
  authorization: {
    authorizedBy: string;
    authorizedAt: string;
    authorizationRef: string;
  };
  summary: {
    acceptedRiskCount: number;
    archiveActionCount: number;
    missingEvidenceCount: number;
  };
  finalClosureStatus: string;
  acceptedRisks: QualityAcceptedRisk[];
  archiveActions: string[];
  gaps: string[];
};

export function buildQualityCompletionAuthorization(input: {
  authorizedBy: string;
  authorizedAt: string;
  authorizationRef: string;
  finalClosureStatus: string;
  acceptedRisks: QualityAcceptedRisk[];
  archiveActions: string[];
  generatedAt?: Date;
}): QualityCompletionAuthorization {
  const authorization = {
    authorizedBy: input.authorizedBy.trim(),
    authorizedAt: input.authorizedAt.trim(),
    authorizationRef: input.authorizationRef.trim(),
  };
  const acceptedRisks = input.acceptedRisks.map(normalizeRisk).filter((risk) => risk.item.length > 0);
  const archiveActions = input.archiveActions.map((action) => action.trim()).filter(Boolean);
  const gaps = [
    ...(!authorization.authorizedBy || !authorization.authorizedAt || !authorization.authorizationRef
      ? ['authorization is incomplete']
      : []),
    ...(input.finalClosureStatus.trim() !== 'READY_TO_ARCHIVE' ? ['final closure is not READY_TO_ARCHIVE'] : []),
    ...acceptedRisks.flatMap((risk) => riskGaps(risk)),
  ];

  return {
    mode: 'ATLAS_QUALITY_COMPLETION',
    status: gaps.length > 0 ? 'ACTION_REQUIRED' : 'COMPLETED',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    authorization,
    summary: {
      acceptedRiskCount: acceptedRisks.length,
      archiveActionCount: archiveActions.length,
      missingEvidenceCount: gaps.filter((gap) => gap.includes('evidence')).length,
    },
    finalClosureStatus: input.finalClosureStatus.trim(),
    acceptedRisks,
    archiveActions,
    gaps,
  };
}

function normalizeRisk(risk: QualityAcceptedRisk): QualityAcceptedRisk {
  return {
    item: risk.item.trim(),
    owner: risk.owner.trim(),
    evidenceRef: risk.evidenceRef.trim(),
    followUp: risk.followUp.trim(),
  };
}

function riskGaps(risk: QualityAcceptedRisk): string[] {
  return [
    ...(!risk.owner ? [`accepted risk owner is missing: ${risk.item}`] : []),
    ...(!risk.evidenceRef ? [`accepted risk evidence is missing: ${risk.item}`] : []),
    ...(!risk.followUp ? [`accepted risk followUp is missing: ${risk.item}`] : []),
  ];
}
