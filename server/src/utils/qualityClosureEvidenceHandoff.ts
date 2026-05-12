import { buildQualityEvidenceIntake } from './qualityEvidenceIntake';
import {
  QualityClosureEvidenceRequirementInput,
  buildQualityClosureEvidencePack,
} from './qualityClosureEvidencePack';
import { TeamConfirmation } from './teamConfirmationRegister';

export type QualityClosureEvidenceHandoff = {
  mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF';
  status: 'READY' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    requirementCount: number;
    packStatus: 'READY' | 'ACTION_REQUIRED';
    intakeStatus: 'READY_TO_CONFIRM' | 'ACTION_REQUIRED';
    missingTopicCount: number;
  };
  packNextCommand: string;
  intakeNextCommands: string[];
  gaps: string[];
};

export function buildQualityClosureEvidenceHandoff(input: {
  requirements: QualityClosureEvidenceRequirementInput[];
  generatedAt?: Date;
}): QualityClosureEvidenceHandoff {
  const generatedAt = input.generatedAt ?? new Date();
  const pack = buildQualityClosureEvidencePack({
    requirements: input.requirements,
    generatedAt,
  });
  const intake = buildQualityEvidenceIntake({
    requiredTopics: pack.requirements.map((requirement) => requirement.topic),
    confirmations: pack.requirements.map(toConfirmation),
    generatedAt,
  });
  const gaps = [
    ...pack.gaps,
    ...intake.missingTopics.map((topic) => `evidence intake missing topic: ${topic}`),
  ];

  return {
    mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
    status: gaps.length > 0 ? 'ACTION_REQUIRED' : 'READY',
    generatedAt: generatedAt.toISOString(),
    summary: {
      requirementCount: pack.summary.requirementCount,
      packStatus: pack.status,
      intakeStatus: intake.status,
      missingTopicCount: intake.summary.missing,
    },
    packNextCommand: pack.nextCommand,
    intakeNextCommands: intake.nextCommands,
    gaps,
  };
}

function toConfirmation(requirement: {
  topic: string;
  owner: string;
  dueDate: string;
  decisionTemplate: string;
  evidenceRefTemplate: string;
}): TeamConfirmation {
  return {
    topic: requirement.topic,
    owner: requirement.owner,
    confirmedAt: requirement.dueDate,
    decision: requirement.decisionTemplate,
    evidenceRef: requirement.evidenceRefTemplate,
  };
}
