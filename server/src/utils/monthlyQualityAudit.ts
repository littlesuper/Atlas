export type QualityEvidenceStatus = 'PASS' | 'WARN' | 'FAIL';

export type QualityEvidence = {
  name: string;
  status: QualityEvidenceStatus;
  note?: string;
};

export type MonthlyQualityAuditReport = {
  mode: 'MONTHLY_QUALITY_AUDIT';
  status: 'PASSED' | 'ACTION_REQUIRED';
  month: string;
  generatedAt: string;
  summary: {
    overallProgress: number;
    currentFocus: string;
    completedWeeks: string[];
  };
  evidenceSummary: {
    total: number;
    pass: number;
    warn: number;
    fail: number;
  };
  evidence: QualityEvidence[];
  blockers: string[];
  recommendations: string[];
};

export function buildMonthlyQualityAuditReport(input: {
  month: string;
  overallProgress: number;
  currentFocus: string;
  completedWeeks: string[];
  evidence: QualityEvidence[];
  blockers: string[];
  recommendations: string[];
  generatedAt?: Date;
}): MonthlyQualityAuditReport {
  const evidence = input.evidence
    .map((item) => ({
      name: item.name.trim(),
      status: item.status,
      note: item.note?.trim() || undefined,
    }))
    .filter((item) => item.name.length > 0);
  const blockers = normalizeList(input.blockers);
  const failedEvidence = evidence.filter((item) => item.status === 'FAIL');
  const status = blockers.length > 0 || failedEvidence.length > 0 ? 'ACTION_REQUIRED' : 'PASSED';

  return {
    mode: 'MONTHLY_QUALITY_AUDIT',
    status,
    month: input.month,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      overallProgress: input.overallProgress,
      currentFocus: input.currentFocus,
      completedWeeks: normalizeList(input.completedWeeks),
    },
    evidenceSummary: summarizeEvidence(evidence),
    evidence,
    blockers,
    recommendations: buildRecommendations({
      status,
      blockers,
      recommendations: input.recommendations,
    }),
  };
}

function summarizeEvidence(evidence: QualityEvidence[]): MonthlyQualityAuditReport['evidenceSummary'] {
  return evidence.reduce<MonthlyQualityAuditReport['evidenceSummary']>(
    (summary, item) => ({
      total: summary.total + 1,
      pass: summary.pass + (item.status === 'PASS' ? 1 : 0),
      warn: summary.warn + (item.status === 'WARN' ? 1 : 0),
      fail: summary.fail + (item.status === 'FAIL' ? 1 : 0),
    }),
    { total: 0, pass: 0, warn: 0, fail: 0 }
  );
}

function buildRecommendations(input: {
  status: MonthlyQualityAuditReport['status'];
  blockers: string[];
  recommendations: string[];
}): string[] {
  const recommendations = normalizeList(input.recommendations);

  if (input.status === 'PASSED') {
    return recommendations.length > 0
      ? recommendations
      : ['Archive the monthly report and keep the next audit on schedule.'];
  }

  return [
    ...recommendations,
    ...(input.blockers.length > 0 ? ['Close all blockers before marking Week 8 complete.'] : []),
  ];
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
