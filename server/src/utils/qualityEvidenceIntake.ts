import { TeamConfirmation } from './teamConfirmationRegister';

export type QualityEvidenceIntake = {
  mode: 'QUALITY_EVIDENCE_INTAKE';
  status: 'READY_TO_CONFIRM' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    required: number;
    provided: number;
    missing: number;
  };
  missingTopics: string[];
  nextCommands: string[];
};

export function buildQualityEvidenceIntake(input: {
  requiredTopics: string[];
  confirmations: TeamConfirmation[];
  generatedAt?: Date;
}): QualityEvidenceIntake {
  const requiredTopics = normalizeList(input.requiredTopics);
  const confirmationMap = new Map(
    input.confirmations.map((confirmation) => [confirmation.topic.trim(), normalizeConfirmation(confirmation)]),
  );
  const providedConfirmations = requiredTopics
    .map((topic) => confirmationMap.get(topic))
    .filter((confirmation): confirmation is TeamConfirmation => Boolean(confirmation && hasEvidence(confirmation)));
  const missingTopics = requiredTopics.filter((topic) => {
    const confirmation = confirmationMap.get(topic);
    return !confirmation || !hasEvidence(confirmation);
  });

  return {
    mode: 'QUALITY_EVIDENCE_INTAKE',
    status: missingTopics.length > 0 ? 'ACTION_REQUIRED' : 'READY_TO_CONFIRM',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      required: requiredTopics.length,
      provided: providedConfirmations.length,
      missing: missingTopics.length,
    },
    missingTopics,
    nextCommands: missingTopics.length > 0 ? [] : buildNextCommands(providedConfirmations),
  };
}

function normalizeConfirmation(confirmation: TeamConfirmation): TeamConfirmation {
  return {
    topic: confirmation.topic.trim(),
    owner: confirmation.owner.trim(),
    confirmedAt: confirmation.confirmedAt.trim(),
    decision: confirmation.decision.trim(),
    evidenceRef: confirmation.evidenceRef.trim(),
  };
}

function hasEvidence(confirmation: TeamConfirmation): boolean {
  return Boolean(confirmation.topic && confirmation.owner && confirmation.confirmedAt && confirmation.decision && confirmation.evidenceRef);
}

function buildNextCommands(confirmations: TeamConfirmation[]): string[] {
  const confirmArgs = confirmations.map((confirmation) => (
    `--confirm "${confirmation.topic}|${confirmation.owner}|${confirmation.confirmedAt}|${confirmation.decision}|${confirmation.evidenceRef}"`
  )).join(' ');

  return [
    `npm run quality:team-confirmations --workspace=server -- ${confirmArgs}`,
    'npm run quality:final-closure --workspace=server -- --artifact "knowledge index|QUALITY_KNOWLEDGE_INDEX|READY|npm run quality:knowledge-index --workspace=server" --artifact "blocker resolution|QUALITY_BLOCKER_RESOLUTION|RESOLVED|quality:blocker-resolution" --artifact "closure consistency|QUALITY_CLOSURE_CONSISTENCY|READY|quality:closure-consistency" --artifact "closure evidence handoff|QUALITY_CLOSURE_EVIDENCE_HANDOFF|READY|quality:closure-evidence-handoff" --artifact "closure remaining work|QUALITY_CLOSURE_REMAINING_WORK|READY|quality:closure-remaining-work" --artifact "closure request pack|QUALITY_CLOSURE_REQUEST_PACK|READY|quality:closure-request-pack" --artifact "team confirmations|TEAM_CONFIRMATION_REGISTER|CONFIRMED|quality:team-confirmations" --artifact "handoff confirmation|WEEK8_HANDOFF_PACK|CONFIRMED|quality:handoff-confirm" --artifact "closure gate|WEEK8_CLOSURE_GATE|READY_TO_CLOSE|quality:closure-gate" --archive-action "attach final closure JSON to monthly audit" --archive-action "start next-quarter quality cadence"',
  ];
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
