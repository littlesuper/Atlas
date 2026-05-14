export type WeeklyReportRisk = {
  type?: string;
  description?: string;
  severity?: string;
};

export type RiskFactor = {
  factor?: string;
  severity?: string;
  description?: string;
};

export type ActivityWithExecutors = {
  executors?: Array<{ user: { realName: string } }>;
};

export const isWeeklyReportRisk = (value: unknown): value is WeeklyReportRisk =>
  typeof value === 'object' && value !== null;

export const isRiskFactor = (value: unknown): value is RiskFactor =>
  typeof value === 'object' && value !== null;

export const queryString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
};
