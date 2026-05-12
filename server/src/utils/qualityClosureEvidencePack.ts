export type QualityClosureEvidenceRequirementInput = {
  topic: string;
  owner: string;
  dueDate: string;
  decisionTemplate: string;
  evidenceRefTemplate: string;
};

export type QualityClosureEvidenceRequirement = QualityClosureEvidenceRequirementInput & {
  status: 'READY' | 'ACTION_REQUIRED';
  missingFields: string[];
  confirmArg: string;
};

export type QualityClosureEvidencePack = {
  mode: 'QUALITY_CLOSURE_EVIDENCE_PACK';
  status: 'READY' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    requirementCount: number;
    readyTemplateCount: number;
    missingTemplateFieldCount: number;
  };
  requirements: QualityClosureEvidenceRequirement[];
  nextCommand: string;
  gaps: string[];
};

export function buildQualityClosureEvidencePack(input: {
  requirements: QualityClosureEvidenceRequirementInput[];
  generatedAt?: Date;
}): QualityClosureEvidencePack {
  const requirements = input.requirements.map(normalizeRequirement).filter((requirement) => requirement.topic.length > 0);
  const gaps = requirements.flatMap((requirement) =>
    requirement.missingFields.map((field) => `${requirement.topic} missing field: ${field}`),
  );
  const readyTemplateCount = requirements.filter((requirement) => requirement.status === 'READY').length;

  return {
    mode: 'QUALITY_CLOSURE_EVIDENCE_PACK',
    status: gaps.length > 0 ? 'ACTION_REQUIRED' : 'READY',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      requirementCount: requirements.length,
      readyTemplateCount,
      missingTemplateFieldCount: gaps.length,
    },
    requirements,
    nextCommand: gaps.length > 0 ? '' : `npm run quality:evidence-intake --workspace=server -- ${requirements.map((requirement) => requirement.confirmArg).join(' ')}`,
    gaps,
  };
}

function normalizeRequirement(requirement: QualityClosureEvidenceRequirementInput): QualityClosureEvidenceRequirement {
  const normalized = {
    topic: requirement.topic.trim(),
    owner: requirement.owner.trim(),
    dueDate: requirement.dueDate.trim(),
    decisionTemplate: requirement.decisionTemplate.trim(),
    evidenceRefTemplate: requirement.evidenceRefTemplate.trim(),
  };
  const missingFields = requiredFieldNames.filter((field) => normalized[field].length === 0);

  return {
    ...normalized,
    status: missingFields.length > 0 ? 'ACTION_REQUIRED' : 'READY',
    missingFields,
    confirmArg: missingFields.length > 0 ? '' : buildConfirmArg(normalized),
  };
}

const requiredFieldNames = [
  'topic',
  'owner',
  'dueDate',
  'decisionTemplate',
  'evidenceRefTemplate',
] as const;

function buildConfirmArg(requirement: QualityClosureEvidenceRequirementInput): string {
  return `--confirm "${requirement.topic}|${requirement.owner}|${requirement.dueDate}|${requirement.decisionTemplate}|${requirement.evidenceRefTemplate}"`;
}
