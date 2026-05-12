import { ClosureCheckStatus, Week8ClosureGate, buildDefaultWeek8ClosureGate } from './week8ClosureGate';

export type QualityClosureRemainingWorkItem = {
  name: string;
  status: ClosureCheckStatus;
  owner: string;
  dueDate: string;
  evidenceRequired: string;
  nextCommand: string;
  detail?: string;
};

export type QualityClosureRemainingWork = {
  mode: 'QUALITY_CLOSURE_REMAINING_WORK';
  status: 'READY' | 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  summary: {
    totalGateChecks: number;
    readyGateChecks: number;
    remainingGateChecks: number;
    blockedGateChecks: number;
  };
  remainingItems: QualityClosureRemainingWorkItem[];
  nextCommands: string[];
  gaps: string[];
};

const itemMetadata = new Map<string, Omit<QualityClosureRemainingWorkItem, 'name' | 'status' | 'detail'>>([
  [
    'monthly audit run',
    {
      owner: 'AI 代码守护人',
      dueDate: '2026-05-08',
      evidenceRequired: 'MONTHLY_AUDIT_RUN / ACTION_REQUIRED with review decisions attached',
      nextCommand: 'npm run quality:audit-run --workspace=server -- --month 2026-05',
    },
  ],
  [
    'quality action tracker',
    {
      owner: 'AI 代码守护人',
      dueDate: '2026-05-08',
      evidenceRequired: 'QUALITY_ACTION_TRACKER with open actions assigned or accepted',
      nextCommand: 'npm run quality:action-tracker --workspace=server',
    },
  ],
  [
    'blocker resolution',
    {
      owner: 'AI 代码守护人',
      dueDate: '2026-05-08',
      evidenceRequired: 'QUALITY_BLOCKER_RESOLUTION / RESOLVED',
      nextCommand: 'npm run quality:blocker-resolution --workspace=server',
    },
  ],
  [
    'evidence intake',
    {
      owner: 'AI 代码守护人',
      dueDate: '2026-05-08',
      evidenceRequired: 'QUALITY_EVIDENCE_INTAKE / READY_TO_CONFIRM',
      nextCommand: 'npm run quality:evidence-intake --workspace=server -- --confirm "..."',
    },
  ],
]);

const greenStatuses = new Set<ClosureCheckStatus>([
  'READY',
  'PASSED',
  'DONE',
  'RESOLVED',
  'READY_TO_CONFIRM',
  'CONFIRMED',
  'READY_TO_ARCHIVE',
]);

export function buildQualityClosureRemainingWork(input: {
  gate: Week8ClosureGate;
  generatedAt?: Date;
}): QualityClosureRemainingWork {
  const remainingItems = input.gate.checks
    .filter((check) => !greenStatuses.has(check.status))
    .map((check): QualityClosureRemainingWorkItem => {
      const metadata = itemMetadata.get(check.name) ?? {
        owner: 'AI 代码守护人',
        dueDate: '2026-05-08',
        evidenceRequired: `${check.name} evidence`,
        nextCommand: '',
      };

      return {
        name: check.name,
        status: check.status,
        ...metadata,
        detail: check.detail,
      };
    });
  const blockedGateChecks = remainingItems.filter((item) => item.status === 'BLOCKED').length;

  return {
    mode: 'QUALITY_CLOSURE_REMAINING_WORK',
    status: blockedGateChecks > 0 ? 'BLOCKED' : remainingItems.length > 0 ? 'ACTION_REQUIRED' : 'READY',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      totalGateChecks: input.gate.summary.total,
      readyGateChecks: input.gate.summary.ready,
      remainingGateChecks: remainingItems.length,
      blockedGateChecks,
    },
    remainingItems,
    nextCommands: remainingItems.map((item) => item.nextCommand).filter(Boolean),
    gaps: remainingItems.map((item) => `${item.name} remains ${item.status}`),
  };
}

export function buildDefaultQualityClosureRemainingWork(input: {
  generatedAt?: Date;
} = {}): QualityClosureRemainingWork {
  const generatedAt = input.generatedAt ?? new Date();

  return buildQualityClosureRemainingWork({
    generatedAt,
    gate: buildDefaultWeek8ClosureGate({ generatedAt }),
  });
}
