export type QualityClosureStepStatus =
  | 'PENDING'
  | 'ACTION_REQUIRED'
  | 'READY_TO_CONFIRM'
  | 'CONFIRMED'
  | 'READY_TO_ARCHIVE'
  | 'READY'
  | 'RESOLVED';

export type QualityClosureStepInput = {
  name: string;
  command: string;
  status: QualityClosureStepStatus;
  expectedNextStatus: QualityClosureStepStatus;
  owner: string;
};

export type QualityClosureStep = QualityClosureStepInput & {
  order: number;
};

export type QualityClosureSequence = {
  mode: 'QUALITY_CLOSURE_SEQUENCE';
  status: 'WAITING_FOR_EVIDENCE' | 'READY_TO_ARCHIVE';
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    actionRequired: number;
    pending: number;
  };
  activeStep?: QualityClosureStep;
  steps: QualityClosureStep[];
};

const greenStatuses = new Set<QualityClosureStepStatus>([
  'READY',
  'READY_TO_CONFIRM',
  'CONFIRMED',
  'READY_TO_ARCHIVE',
  'RESOLVED',
]);

export function buildQualityClosureSequence(input: {
  steps: QualityClosureStepInput[];
  generatedAt?: Date;
}): QualityClosureSequence {
  const steps = input.steps.map(normalizeStep).filter((step) => step.name.length > 0);
  const orderedSteps = steps.map((step, index) => ({ ...step, order: index + 1 }));
  const ready = orderedSteps.filter((step) => greenStatuses.has(step.status)).length;
  const actionRequired = orderedSteps.filter((step) => step.status === 'ACTION_REQUIRED').length;
  const pending = orderedSteps.filter((step) => step.status === 'PENDING').length;
  const activeStep = orderedSteps.find((step) => step.status !== step.expectedNextStatus);

  return {
    mode: 'QUALITY_CLOSURE_SEQUENCE',
    status: activeStep ? 'WAITING_FOR_EVIDENCE' : 'READY_TO_ARCHIVE',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      total: orderedSteps.length,
      ready,
      actionRequired,
      pending,
    },
    activeStep,
    steps: orderedSteps,
  };
}

export function buildDefaultQualityClosureSequence(input: {
  generatedAt?: Date;
} = {}): QualityClosureSequence {
  return buildQualityClosureSequence({
    generatedAt: input.generatedAt,
    steps: [
      {
        name: 'owner assignments',
        command: 'npm run quality:owner-assignments --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedNextStatus: 'ACTION_REQUIRED',
        owner: 'AI 代码守护人',
      },
      {
        name: 'blocker resolution',
        command: 'npm run quality:blocker-resolution --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedNextStatus: 'RESOLVED',
        owner: 'AI 代码守护人',
      },
      {
        name: 'closure evidence pack',
        command: 'npm run quality:closure-evidence-pack --workspace=server',
        status: 'READY',
        expectedNextStatus: 'READY',
        owner: 'AI 代码守护人',
      },
      {
        name: 'closure evidence handoff',
        command: 'npm run quality:closure-evidence-handoff --workspace=server',
        status: 'READY',
        expectedNextStatus: 'READY',
        owner: 'AI 代码守护人',
      },
      {
        name: 'closure remaining work',
        command: 'npm run quality:closure-remaining-work --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedNextStatus: 'READY',
        owner: 'AI 代码守护人',
      },
      {
        name: 'closure request pack',
        command: 'npm run quality:closure-request-pack --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedNextStatus: 'READY',
        owner: 'AI 代码守护人',
      },
      {
        name: 'evidence intake',
        command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
        status: 'ACTION_REQUIRED',
        expectedNextStatus: 'READY_TO_CONFIRM',
        owner: 'AI 代码守护人',
      },
      {
        name: 'team confirmations',
        command: 'npm run quality:team-confirmations --workspace=server -- --confirm ...',
        status: 'PENDING',
        expectedNextStatus: 'CONFIRMED',
        owner: 'AI 代码守护人',
      },
      {
        name: 'final closure',
        command: 'npm run quality:final-closure --workspace=server -- --artifact ...',
        status: 'PENDING',
        expectedNextStatus: 'READY_TO_ARCHIVE',
        owner: 'AI 代码守护人',
      },
      {
        name: 'progress guard',
        command: 'npm run quality:progress-guard --workspace=server -- --evidence quality:closure-sequence --changelog quality:closure-sequence',
        status: 'PENDING',
        expectedNextStatus: 'READY',
        owner: 'AI 代码守护人',
      },
    ],
  });
}

function normalizeStep(step: QualityClosureStepInput): QualityClosureStepInput {
  return {
    name: step.name.trim(),
    command: step.command.trim(),
    status: step.status,
    expectedNextStatus: step.expectedNextStatus,
    owner: step.owner.trim(),
  };
}
