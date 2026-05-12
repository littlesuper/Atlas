import { CanaryStage, buildCanaryPlan } from './canaryPlan';

export type CanaryStageResult = {
  id: CanaryStage['id'];
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  note?: string;
};

export type CanaryReport = {
  mode: 'CANARY_REPORT';
  status: 'COMPLETED' | 'ROLLBACK_RECOMMENDED';
  generatedAt: string;
  version: string;
  targetVersion: string;
  baseUrl: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  firstFailedStage: CanaryStageResult | null;
  stages: CanaryStageResult[];
  rollbackCommand: string;
  recommendation: string;
};

export function buildCanaryReport(input: {
  version: string;
  targetVersion: string;
  baseUrl?: string;
  startedAt: string;
  endedAt: string;
  stages: CanaryStageResult[];
  generatedAt?: Date;
}): CanaryReport {
  const baseUrl = input.baseUrl?.trim() || 'http://localhost:3000';
  const stages = input.stages.map((stage) => ({ ...stage }));
  const firstFailedStage = stages.find((stage) => stage.status === 'FAIL') ?? null;
  const plan = buildCanaryPlan({
    version: input.version,
    targetVersion: input.targetVersion,
    baseUrl,
  });

  return {
    mode: 'CANARY_REPORT',
    status: firstFailedStage ? 'ROLLBACK_RECOMMENDED' : 'COMPLETED',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    version: input.version,
    targetVersion: input.targetVersion,
    baseUrl,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMinutes: diffMinutes(input.startedAt, input.endedAt),
    firstFailedStage,
    stages,
    rollbackCommand: plan.rollbackCommand,
    recommendation: firstFailedStage
      ? `Stop rollout and execute rollback plan from failed stage ${firstFailedStage.id}.`
      : 'Archive the canary report and continue normal monitoring.',
  };
}

function diffMinutes(startedAt: string, endedAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 60000);
}
