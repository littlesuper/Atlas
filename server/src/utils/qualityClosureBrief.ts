import { QualityClosureDashboardCheck, buildDefaultQualityClosureDashboard } from './qualityClosureDashboard';

export type QualityClosureBriefDashboard = {
  status: 'READY' | 'ACTION_REQUIRED';
  currentFocus?: QualityClosureDashboardCheck;
  checks: QualityClosureDashboardCheck[];
};

export type QualityClosureBrief = {
  mode: 'QUALITY_CLOSURE_BRIEF';
  status: 'READY' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    checkCount: number;
    actionRequired: number;
  };
  markdown: string;
};

export function buildQualityClosureBrief(input: {
  dashboard: QualityClosureBriefDashboard;
  generatedAt?: Date;
}): QualityClosureBrief {
  const checks = input.dashboard.checks.map(normalizeCheck).filter((check) => check.name.length > 0);
  const actionRequired = checks.filter((check) => check.status !== check.expectedStatus).length;

  return {
    mode: 'QUALITY_CLOSURE_BRIEF',
    status: input.dashboard.status,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      checkCount: checks.length,
      actionRequired,
    },
    markdown: buildMarkdown(input.dashboard.status, input.dashboard.currentFocus, checks),
  };
}

export function buildDefaultQualityClosureBriefDashboard(): QualityClosureBriefDashboard {
  const dashboard = buildDefaultQualityClosureDashboard();

  return {
    status: dashboard.status,
    currentFocus: dashboard.currentFocus,
    checks: dashboard.checks,
  };
}

function normalizeCheck(check: QualityClosureDashboardCheck): QualityClosureDashboardCheck {
  return {
    name: check.name.trim(),
    mode: check.mode.trim(),
    command: check.command.trim(),
    status: check.status.trim(),
    expectedStatus: check.expectedStatus.trim(),
    nextAction: check.nextAction.trim(),
  };
}

function buildMarkdown(
  status: QualityClosureBriefDashboard['status'],
  currentFocus: QualityClosureDashboardCheck | undefined,
  checks: QualityClosureDashboardCheck[],
): string {
  const lines = [
    '# Week 8 收口简报',
    '',
    `- 当前状态：${status}`,
    `- 当前焦点：${currentFocus?.name ?? '无'}`,
    `- 下一步：${currentFocus?.nextAction ?? '可进入归档'}`,
    `- 建议命令：${currentFocus ? `\`${currentFocus.command}\`` : '无'}`,
    '',
    '## 检查项',
    '',
    '| 检查项 | 当前状态 | 目标状态 | 下一步 |',
    '| --- | --- | --- | --- |',
  ];

  for (const check of checks) {
    lines.push(`| ${check.name} | ${check.status} | ${check.expectedStatus} | ${check.nextAction} |`);
  }

  return lines.join('\n');
}
