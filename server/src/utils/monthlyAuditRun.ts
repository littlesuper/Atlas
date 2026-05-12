import { MonthlyAuditInputPack } from './monthlyAuditInputPack';
import { MonthlyQualityAuditReport, buildMonthlyQualityAuditReport } from './monthlyQualityAudit';

export type MonthlyAuditRun = {
  mode: 'MONTHLY_AUDIT_RUN';
  status: 'PASSED' | 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  inputPackStatus: MonthlyAuditInputPack['status'];
  blockers: string[];
  auditReport: MonthlyQualityAuditReport | null;
};

export function buildMonthlyAuditRun(input: {
  inputPack: MonthlyAuditInputPack;
  overallProgress: number;
  currentFocus: string;
  completedWeeks: string[];
  generatedAt?: Date;
}): MonthlyAuditRun {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();

  if (input.inputPack.status !== 'READY') {
    return {
      mode: 'MONTHLY_AUDIT_RUN',
      status: 'BLOCKED',
      generatedAt,
      inputPackStatus: input.inputPack.status,
      blockers: [
        'input pack is not READY',
        ...input.inputPack.missingRequiredEvidence.map((item) => `missing evidence: ${item}`),
      ],
      auditReport: null,
    };
  }

  const report = buildMonthlyQualityAuditReport({
    month: input.inputPack.month,
    overallProgress: input.overallProgress,
    currentFocus: input.currentFocus,
    completedWeeks: input.completedWeeks,
    evidence: input.inputPack.evidence.map((item) => ({
      name: item.command,
      status: item.status,
      note: item.note,
    })),
    blockers: input.inputPack.risks.map((risk) => risk.title),
    recommendations: input.inputPack.actionItems.map(
      (item) => `${item.task} - Owner: ${item.owner} - Due: ${item.dueDate}`
    ),
    generatedAt: input.generatedAt,
  });

  return {
    mode: 'MONTHLY_AUDIT_RUN',
    status: report.status,
    generatedAt,
    inputPackStatus: input.inputPack.status,
    blockers: report.blockers,
    auditReport: report,
  };
}
