export type Week8FinalClosureArtifact = {
  name: string;
  mode: string;
  status: string;
  evidenceRef: string;
};

export type Week8FinalClosure = {
  mode: 'WEEK8_FINAL_CLOSURE';
  status: 'READY_TO_ARCHIVE' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    actionRequired: number;
    missingEvidence: number;
  };
  artifacts: Week8FinalClosureArtifact[];
  gaps: string[];
  archiveActions: string[];
};

const greenStatuses = new Set(['READY', 'CONFIRMED', 'READY_TO_CLOSE', 'PASSED', 'DONE', 'RESOLVED']);

const requiredArtifacts = [
  { name: 'knowledge index', mode: 'QUALITY_KNOWLEDGE_INDEX' },
  { name: 'blocker resolution', mode: 'QUALITY_BLOCKER_RESOLUTION' },
  { name: 'closure consistency', mode: 'QUALITY_CLOSURE_CONSISTENCY' },
  { name: 'closure evidence handoff', mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF' },
  { name: 'closure remaining work', mode: 'QUALITY_CLOSURE_REMAINING_WORK' },
  { name: 'closure request pack', mode: 'QUALITY_CLOSURE_REQUEST_PACK' },
  { name: 'team confirmations', mode: 'TEAM_CONFIRMATION_REGISTER' },
  { name: 'handoff confirmation', mode: 'WEEK8_HANDOFF_PACK' },
  { name: 'closure gate', mode: 'WEEK8_CLOSURE_GATE' },
];

export function buildWeek8FinalClosure(input: {
  artifacts: Week8FinalClosureArtifact[];
  archiveActions: string[];
  generatedAt?: Date;
}): Week8FinalClosure {
  const artifacts = input.artifacts.map(normalizeArtifact).filter((artifact) => artifact.name.length > 0);
  const notReadyGaps = artifacts
    .filter((artifact) => !greenStatuses.has(artifact.status))
    .map((artifact) => `artifact is not ready: ${artifact.name} (${artifact.status})`);
  const missingEvidenceGaps = artifacts
    .filter((artifact) => !artifact.evidenceRef)
    .map((artifact) => `artifact evidence is missing: ${artifact.name}`);
  const modes = new Set(artifacts.map((artifact) => artifact.mode));
  const missingRequiredGaps = requiredArtifacts
    .filter((artifact) => !modes.has(artifact.mode))
    .map((artifact) => `required artifact is missing: ${artifact.name} (${artifact.mode})`);
  const gaps = [...notReadyGaps, ...missingEvidenceGaps, ...missingRequiredGaps];
  const ready = artifacts.filter((artifact) => greenStatuses.has(artifact.status)).length;

  return {
    mode: 'WEEK8_FINAL_CLOSURE',
    status: gaps.length > 0 ? 'ACTION_REQUIRED' : 'READY_TO_ARCHIVE',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      total: artifacts.length,
      ready,
      actionRequired: artifacts.length - ready,
      missingEvidence: missingEvidenceGaps.length,
    },
    artifacts,
    gaps,
    archiveActions: normalizeList(input.archiveActions),
  };
}

function normalizeArtifact(artifact: Week8FinalClosureArtifact): Week8FinalClosureArtifact {
  return {
    name: artifact.name.trim(),
    mode: artifact.mode.trim(),
    status: artifact.status.trim(),
    evidenceRef: artifact.evidenceRef.trim(),
  };
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
