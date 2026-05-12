export type AuditEvidenceStatus = 'PASS' | 'WARN' | 'FAIL';

export type AuditEvidenceItem = {
  id: string;
  command: string;
  status: AuditEvidenceStatus;
  note?: string;
};

export type AuditRiskSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type AuditRiskItem = {
  title: string;
  severity: AuditRiskSeverity;
  owner: string;
};

export type AuditActionItem = {
  task: string;
  owner: string;
  dueDate: string;
};

export type MonthlyAuditInputPack = {
  mode: 'MONTHLY_AUDIT_INPUT_PACK';
  status: 'READY' | 'BLOCKED';
  month: string;
  generatedAt: string;
  summary: {
    evidenceCount: number;
    passEvidenceCount: number;
    riskCount: number;
    highRiskCount: number;
    actionItemCount: number;
    missingRequiredEvidenceCount: number;
  };
  evidence: AuditEvidenceItem[];
  risks: AuditRiskItem[];
  actionItems: AuditActionItem[];
  missingRequiredEvidence: string[];
  auditReportCommand: string;
};

export function buildMonthlyAuditInputPack(input: {
  month: string;
  requiredEvidence: string[];
  evidence: AuditEvidenceItem[];
  risks: AuditRiskItem[];
  actionItems: AuditActionItem[];
  generatedAt?: Date;
}): MonthlyAuditInputPack {
  const evidence = input.evidence.map(normalizeEvidence).filter((item) => item.id.length > 0);
  const risks = input.risks.map(normalizeRisk).filter((risk) => risk.title.length > 0);
  const actionItems = input.actionItems.map(normalizeActionItem).filter((item) => item.task.length > 0);
  const knownEvidenceIds = new Set(evidence.map((item) => item.id));
  const missingRequiredEvidence = normalizeList(input.requiredEvidence).filter((id) => !knownEvidenceIds.has(id));
  const hasBrokenActionItems = actionItems.some((item) => !item.owner || !item.dueDate);

  return {
    mode: 'MONTHLY_AUDIT_INPUT_PACK',
    status: missingRequiredEvidence.length > 0 || hasBrokenActionItems ? 'BLOCKED' : 'READY',
    month: input.month,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      evidenceCount: evidence.length,
      passEvidenceCount: evidence.filter((item) => item.status === 'PASS').length,
      riskCount: risks.length,
      highRiskCount: risks.filter((risk) => risk.severity === 'HIGH').length,
      actionItemCount: actionItems.length,
      missingRequiredEvidenceCount: missingRequiredEvidence.length,
    },
    evidence,
    risks,
    actionItems,
    missingRequiredEvidence,
    auditReportCommand: `npm run quality:audit-report --workspace=server -- --month ${input.month} --overall-progress 99 --current-focus "Week 8 体系巩固"`,
  };
}

function normalizeEvidence(item: AuditEvidenceItem): AuditEvidenceItem {
  return {
    id: item.id.trim(),
    command: item.command.trim(),
    status: item.status,
    note: item.note?.trim() || undefined,
  };
}

function normalizeRisk(risk: AuditRiskItem): AuditRiskItem {
  return {
    title: risk.title.trim(),
    severity: risk.severity,
    owner: risk.owner.trim(),
  };
}

function normalizeActionItem(item: AuditActionItem): AuditActionItem {
  return {
    task: item.task.trim(),
    owner: item.owner.trim(),
    dueDate: item.dueDate.trim(),
  };
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
