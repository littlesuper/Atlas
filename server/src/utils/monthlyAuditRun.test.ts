import { describe, expect, it } from 'vitest';
import { buildMonthlyAuditRun } from './monthlyAuditRun';

describe('monthly audit run builder', () => {
  it('generates a monthly audit report from a ready input pack', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'READY',
        month: '2026-05',
        generatedAt: '2026-05-06T01:00:00.000Z',
        summary: {
          evidenceCount: 4,
          passEvidenceCount: 4,
          riskCount: 2,
          highRiskCount: 1,
          actionItemCount: 2,
          missingRequiredEvidenceCount: 0,
        },
        evidence: [
          { id: 'lint', command: 'npm run lint', status: 'PASS', note: '0 errors / 0 warnings' },
          { id: 'server typecheck', command: 'npm run typecheck --workspace=server -- --pretty false', status: 'PASS' },
          { id: 'high audit', command: 'npm audit --audit-level=high', status: 'PASS' },
          { id: 'knowledge index', command: 'npm run quality:knowledge-index --workspace=server', status: 'PASS' },
        ],
        risks: [
          { title: 'main 落后远端 61 个提交', severity: 'HIGH', owner: 'release owner' },
          { title: '团队侧流程未确认', severity: 'MEDIUM', owner: 'AI 代码守护人' },
        ],
        actionItems: [
          { task: '安排质量回顾会并确认团队 owner', owner: 'AI 代码守护人', dueDate: '2026-05-08' },
          { task: '规划 rebase/merge 策略', owner: 'release owner', dueDate: '2026-05-08' },
        ],
        missingRequiredEvidence: [],
        auditReportCommand: 'npm run quality:audit-report --workspace=server -- --month 2026-05 --overall-progress 99 --current-focus "Week 8 体系巩固"',
      },
      overallProgress: 99,
      currentFocus: 'Week 8 体系巩固',
      completedWeeks: ['Week 2', 'Week 4', 'Week 5', 'Week 7'],
      generatedAt: new Date('2026-05-06T02:00:00.000Z'),
    });

    expect(run.mode).toBe('MONTHLY_AUDIT_RUN');
    expect(run.status).toBe('ACTION_REQUIRED');
    expect(run.generatedAt).toBe('2026-05-06T02:00:00.000Z');
    expect(run.inputPackStatus).toBe('READY');
    if (!run.auditReport) {
      throw new Error('Expected ready audit input pack to generate an audit report.');
    }
    expect(run.auditReport.status).toBe('ACTION_REQUIRED');
    expect(run.auditReport.evidenceSummary).toEqual({ total: 4, pass: 4, warn: 0, fail: 0 });
    expect(run.auditReport.blockers).toEqual([
      'main 落后远端 61 个提交',
      '团队侧流程未确认',
    ]);
    expect(run.auditReport.recommendations).toContain('安排质量回顾会并确认团队 owner - Owner: AI 代码守护人 - Due: 2026-05-08');
  });

  it('blocks the run when the input pack is not ready', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'BLOCKED',
        month: '2026-05',
        generatedAt: '2026-05-06T01:00:00.000Z',
        summary: {
          evidenceCount: 1,
          passEvidenceCount: 1,
          riskCount: 0,
          highRiskCount: 0,
          actionItemCount: 0,
          missingRequiredEvidenceCount: 1,
        },
        evidence: [{ id: 'lint', command: 'npm run lint', status: 'PASS' }],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: ['server typecheck'],
        auditReportCommand: 'npm run quality:audit-report --workspace=server -- --month 2026-05 --overall-progress 99 --current-focus "Week 8 体系巩固"',
      },
      overallProgress: 99,
      currentFocus: 'Week 8 体系巩固',
      completedWeeks: [],
      generatedAt: new Date('2026-05-06T02:00:00.000Z'),
    });

    expect(run.status).toBe('BLOCKED');
    expect(run.auditReport).toBeNull();
    expect(run.blockers).toEqual(['input pack is not READY', 'missing evidence: server typecheck']);
  });

  it('produces PASSED when audit report has no blockers and no failed evidence', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'READY',
        month: '2026-06',
        generatedAt: '2026-06-01T00:00:00.000Z',
        summary: { evidenceCount: 1, passEvidenceCount: 1, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
        evidence: [{ id: 'lint', command: 'npm run lint', status: 'PASS' }],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: [],
        auditReportCommand: 'npm run quality:audit-report --workspace=server -- --month 2026-06',
      },
      overallProgress: 100,
      currentFocus: 'complete',
      completedWeeks: ['Week 1', 'Week 2'],
    });

    expect(run.status).toBe('PASSED');
    expect(run.auditReport).not.toBeNull();
    expect(run.auditReport!.blockers).toEqual([]);
  });

  it('delegates status to audit report even when input pack is READY', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'READY',
        month: '2026-05',
        generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 1, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
        evidence: [{ id: 'e1', command: 'cmd', status: 'FAIL' }],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: [],
        auditReportCommand: 'cmd',
      },
      overallProgress: 50,
      currentFocus: 'fix',
      completedWeeks: [],
    });

    expect(run.status).toBe('ACTION_REQUIRED');
    expect(run.auditReport!.evidenceSummary.fail).toBe(1);
  });

  it('defaults generatedAt when not provided', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'BLOCKED',
        month: '2026-05',
        generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 1 },
        evidence: [],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: ['missing'],
        auditReportCommand: 'cmd',
      },
      overallProgress: 0,
      currentFocus: '',
      completedWeeks: [],
    });

    expect(run.generatedAt).toBeTruthy();
    expect(run.auditReport).toBeNull();
  });

  it('lists multiple missing evidence items as blockers', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'BLOCKED',
        month: '2026-05',
        generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 2 },
        evidence: [],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: ['lint', 'typecheck'],
        auditReportCommand: 'cmd',
      },
      overallProgress: 0,
      currentFocus: '',
      completedWeeks: [],
    });

    expect(run.blockers).toEqual(['input pack is not READY', 'missing evidence: lint', 'missing evidence: typecheck']);
  });

  it('passes evidence items to audit report with name mapping', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'READY',
        month: '2026-06',
        generatedAt: '2026-06-01T00:00:00.000Z',
        summary: { evidenceCount: 2, passEvidenceCount: 2, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
        evidence: [
          { id: 'lint', command: 'npm run lint', status: 'PASS', note: 'clean' },
          { id: 'typecheck', command: 'npx tsc --noEmit', status: 'PASS' },
        ],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: [],
        auditReportCommand: 'cmd',
      },
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: ['Week 1'],
    });

    expect(run.auditReport!.evidence).toEqual([
      { name: 'npm run lint', status: 'PASS', note: 'clean' },
      { name: 'npx tsc --noEmit', status: 'PASS', note: undefined },
    ]);
  });

  it('counts warn evidence separately from fail', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'READY',
        month: '2026-05',
        generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 2, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
        evidence: [
          { id: 'e1', command: 'cmd1', status: 'WARN' },
          { id: 'e2', command: 'cmd2', status: 'FAIL' },
        ],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: [],
        auditReportCommand: 'cmd',
      },
      overallProgress: 50,
      currentFocus: 'fix',
      completedWeeks: [],
    });

    expect(run.auditReport!.evidenceSummary.warn).toBe(1);
    expect(run.auditReport!.evidenceSummary.fail).toBe(1);
  });

  it('mode is always MONTHLY_AUDIT_RUN', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'BLOCKED',
        month: '2026-05',
        generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 1 },
        evidence: [],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: ['missing'],
        auditReportCommand: 'cmd',
      },
      overallProgress: 0,
      currentFocus: '',
      completedWeeks: [],
    });

    expect(run.mode).toBe('MONTHLY_AUDIT_RUN');
  });

  it('passes completedWeeks to auditReport when input pack is READY', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK',
        status: 'READY',
        month: '2026-05',
        generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
        evidence: [],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: [],
        auditReportCommand: 'cmd',
      },
      overallProgress: 50,
      currentFocus: 'fixing',
      completedWeeks: ['Week 1', 'Week 3'],
    });

    expect(run.status).toBe('PASSED');
    expect(run.auditReport).not.toBeNull();
    expect(run.auditReport!.summary.completedWeeks).toEqual(['Week 1', 'Week 3']);
  });

  it('generatedAt is valid ISO string', () => {
    const run = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' },
      overallProgress: 50, currentFocus: 'fixing', completedWeeks: [],
    });
    expect(new Date(run.generatedAt).toISOString()).toBe(run.generatedAt);
  });

  it('BLOCKED status lists missing evidence in blockers', () => {
    const run = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'BLOCKED', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 2 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: ['ev-1', 'ev-2'], auditReportCommand: 'cmd' },
      overallProgress: 50, currentFocus: 'fixing', completedWeeks: [],
    });
    expect(run.status).toBe('BLOCKED');
    expect(run.blockers).toContain('missing evidence: ev-1');
    expect(run.blockers).toContain('missing evidence: ev-2');
  });

  it('maps risks to blockers in audit report for READY input pack', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 1, passEvidenceCount: 1, riskCount: 2, highRiskCount: 1, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
        evidence: [{ id: 'lint', command: 'npm run lint', status: 'PASS' }],
        risks: [{ title: 'risk-a', severity: 'HIGH', owner: 'team' }, { title: 'risk-b', severity: 'MEDIUM', owner: 'team' }],
        actionItems: [],
        missingRequiredEvidence: [],
        auditReportCommand: 'cmd',
      },
      overallProgress: 80, currentFocus: 'risk mitigation', completedWeeks: [],
    });

    expect(run.auditReport!.blockers).toEqual(['risk-a', 'risk-b']);
    expect(run.status).toBe('ACTION_REQUIRED');
  });

  it('maps actionItems to recommendations with owner and dueDate', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 1, passEvidenceCount: 1, riskCount: 0, highRiskCount: 0, actionItemCount: 1, missingRequiredEvidenceCount: 0 },
        evidence: [{ id: 'lint', command: 'npm run lint', status: 'PASS' }],
        risks: [],
        actionItems: [{ task: 'Fix issue', owner: 'dev', dueDate: '2026-06-01' }],
        missingRequiredEvidence: [],
        auditReportCommand: 'cmd',
      },
      overallProgress: 90, currentFocus: 'wrap up', completedWeeks: ['Week 1'],
    });

    expect(run.auditReport!.recommendations).toEqual(['Fix issue - Owner: dev - Due: 2026-06-01']);
  });

  it('BLOCKED with empty missingRequiredEvidence has only the generic blocker', () => {
    const run = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'BLOCKED', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' },
      overallProgress: 0, currentFocus: '', completedWeeks: [],
    });
    expect(run.status).toBe('BLOCKED');
    expect(run.blockers).toEqual(['input pack is not READY']);
  });

  it('passes overallProgress and currentFocus to audit report summary', () => {
    const run = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' },
      overallProgress: 73, currentFocus: 'risk review', completedWeeks: ['Week 1'],
    });

    expect(run.auditReport!.summary.overallProgress).toBe(73);
    expect(run.auditReport!.summary.currentFocus).toBe('risk review');
  });

  it('defaults generatedAt when not provided for BLOCKED input pack', () => {
    const before = new Date();
    const run = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'BLOCKED', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 1 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: ['e1'], auditReportCommand: 'cmd' },
      overallProgress: 0, currentFocus: '', completedWeeks: [],
    });
    const after = new Date();

    const ts = new Date(run.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('inputPackStatus matches the input pack status for READY path', () => {
    const run = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' },
      overallProgress: 100, currentFocus: 'done', completedWeeks: ['W1'],
    });
    expect(run.inputPackStatus).toBe('READY');
  });

  it('BLOCKED input pack ignores risks in blockers output', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'BLOCKED', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 1, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 1 },
        evidence: [],
        risks: [{ title: 'ignored-risk', severity: 'HIGH', owner: 'team' }],
        actionItems: [],
        missingRequiredEvidence: ['ev-1'],
        auditReportCommand: 'cmd',
      },
      overallProgress: 0, currentFocus: '', completedWeeks: [],
    });

    expect(run.status).toBe('BLOCKED');
    expect(run.auditReport).toBeNull();
    expect(run.blockers).not.toContain('ignored-risk');
  });

  it('READY input pack with WARN evidence produces ACTION_REQUIRED audit report', () => {
    const run = buildMonthlyAuditRun({
      inputPack: {
        mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z',
        summary: { evidenceCount: 1, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
        evidence: [{ id: 'e1', command: 'cmd', status: 'WARN' }],
        risks: [],
        actionItems: [],
        missingRequiredEvidence: [],
        auditReportCommand: 'cmd',
      },
      overallProgress: 80, currentFocus: 'review', completedWeeks: ['Week 1'],
    });

    expect(run.status).toBe('PASSED');
    expect(run.auditReport!.evidenceSummary.warn).toBe(1);
  });

  it('uses generatedAt from input when provided for READY path', () => {
    const run = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' },
      overallProgress: 100, currentFocus: 'done', completedWeeks: ['W1'],
      generatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(run.generatedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('run defaults generatedAt to current time when not provided', () => {
    const before = new Date();
    const run = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' },
      overallProgress: 100, currentFocus: 'done', completedWeeks: ['W1'],
    });
    const genAt = new Date(run.generatedAt);
    expect(genAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('audit run returns status field', () => {
    const result = buildMonthlyAuditRun({
      inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-06T01:00:00.000Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' },
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: ['W1'],
    });
    expect(result.status).toBeDefined();
  });

  it('run with empty completedWeeks returns valid structure', () => {
    const result = buildMonthlyAuditRun({ inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-10T00:00:00Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' }, overallProgress: 0, currentFocus: 'start', completedWeeks: [] });
    expect(result).toBeDefined();
    expect(result.mode).toBe('MONTHLY_AUDIT_RUN');
  });

  it('buildMonthlyAuditRun handles zero progress', () => {
    const result = buildMonthlyAuditRun({ inputPack: { mode: 'MONTHLY_AUDIT_INPUT_PACK', status: 'READY', month: '2026-05', generatedAt: '2026-05-10T00:00:00Z', summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 }, evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [], auditReportCommand: 'cmd' }, overallProgress: 0, currentFocus: 'start', completedWeeks: [] });
    expect(result.auditReport!.summary.overallProgress).toBe(0);
  });

  it('buildMonthlyAuditRun handles empty input pack', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'ACTION_REQUIRED', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 0, currentFocus: '', completedWeeks: [] }); expect(result).toBeDefined(); });

  it('buildMonthlyAuditRun handles COMPLETED status', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'COMPLETED', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 100, currentFocus: 'done', completedWeeks: ['w1', 'w2', 'w3', 'w4'] }); expect(result).toBeDefined(); });

  it('buildMonthlyAuditRun defaults completedWeeks to empty', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'NOT_STARTED', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 0, currentFocus: '', completedWeeks: [] }); expect(result.mode).toBe('MONTHLY_AUDIT_RUN'); });

  it('buildMonthlyAuditRun handles ACTION_REQUIRED status', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'ACTION_REQUIRED', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 30, currentFocus: 'fix', completedWeeks: [] }); expect(result).toBeDefined(); });

  it('buildMonthlyAuditRun handles NOT_STARTED status', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'NOT_STARTED', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 0, currentFocus: '', completedWeeks: [] }); expect(result.mode).toBe('MONTHLY_AUDIT_RUN'); });

  it('buildMonthlyAuditRun handles partial progress', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'IN_PROGRESS', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 50, currentFocus: 'mid', completedWeeks: ['w1', 'w2'] }); expect(result).toBeDefined(); });

  it('buildMonthlyAuditRun handles COMPLETED status', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'COMPLETED', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 100, currentFocus: '', completedWeeks: ['w1', 'w2', 'w3', 'w4'] }); expect(result).toBeDefined(); });

  it('buildMonthlyAuditRun handles IN_PROGRESS status with zero progress', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'IN_PROGRESS', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 0, currentFocus: '', completedWeeks: [] }); expect(result).toBeDefined(); });

  it('buildMonthlyAuditRun handles COMPLETED status', () => { const result = buildMonthlyAuditRun({ inputPack: { status: 'COMPLETED', month: '2026-01', evidence: [], risks: [], actionItems: [], missingRequiredEvidence: [] }, overallProgress: 100, currentFocus: '', completedWeeks: [1, 2, 3, 4] }); expect(result).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [`risk-${index} 中文 <tag>${index}</tag>`, index % 2 === 0 ? 'HIGH' : 'MEDIUM']))(
    'maps ready input pack risk title into audit blocker %s',
    (title, severity) => {
      const run = buildMonthlyAuditRun({
        inputPack: {
          mode: 'MONTHLY_AUDIT_INPUT_PACK',
          status: 'READY',
          month: '2026-05',
          generatedAt: '2026-05-10T00:00:00.000Z',
          summary: { evidenceCount: 1, passEvidenceCount: 1, riskCount: 1, highRiskCount: severity === 'HIGH' ? 1 : 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
          evidence: [{ id: `e-${title}`, command: 'npm test', status: 'PASS' }],
          risks: [{ title: `  ${title}  `, severity: severity as 'HIGH' | 'MEDIUM', owner: 'owner' }],
          actionItems: [],
          missingRequiredEvidence: [],
          auditReportCommand: 'cmd',
        },
        overallProgress: 100,
        currentFocus: 'done',
        completedWeeks: ['Week 8'],
      });

      expect(run.status).toBe('ACTION_REQUIRED');
      expect(run.blockers).toEqual([title]);
      expect(run.auditReport!.blockers).toEqual([title]);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`missing evidence ${index} / 证据`, index % 3]))(
    'lists blocked input pack missing evidence blocker %s',
    (evidence, extraCount) => {
      const missingRequiredEvidence = [
        evidence,
        ...Array.from({ length: extraCount }, (_, index) => `extra-${index}`),
      ];
      const run = buildMonthlyAuditRun({
        inputPack: {
          mode: 'MONTHLY_AUDIT_INPUT_PACK',
          status: 'BLOCKED',
          month: '2026-05',
          generatedAt: '2026-05-10T00:00:00.000Z',
          summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: missingRequiredEvidence.length },
          evidence: [],
          risks: [],
          actionItems: [],
          missingRequiredEvidence,
          auditReportCommand: 'cmd',
        },
        overallProgress: 0,
        currentFocus: '',
        completedWeeks: [],
      });

      expect(run.status).toBe('BLOCKED');
      expect(run.auditReport).toBeNull();
      expect(run.blockers).toContain(`missing evidence: ${evidence}`);
      expect(run.blockers).toHaveLength(1 + missingRequiredEvidence.length);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `task-${index} 中文`,
    `owner-${index}`,
    `2026-05-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'maps generated action item into recommendation %s',
    (task, owner, dueDate) => {
      const run = buildMonthlyAuditRun({
        inputPack: {
          mode: 'MONTHLY_AUDIT_INPUT_PACK',
          status: 'READY',
          month: '2026-05',
          generatedAt: '2026-05-10T00:00:00.000Z',
          summary: { evidenceCount: 1, passEvidenceCount: 1, riskCount: 0, highRiskCount: 0, actionItemCount: 1, missingRequiredEvidenceCount: 0 },
          evidence: [{ id: 'lint', command: 'npm run lint', status: 'PASS' }],
          risks: [],
          actionItems: [{ task, owner, dueDate }],
          missingRequiredEvidence: [],
          auditReportCommand: 'cmd',
        },
        overallProgress: 100,
        currentFocus: 'done',
        completedWeeks: ['Week 8'],
      });

      expect(run.status).toBe('PASSED');
      expect(run.auditReport!.recommendations).toEqual([
        `${task} - Owner: ${owner} - Due: ${dueDate}`,
      ]);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 3 === 0 ? 'PASS' : index % 3 === 1 ? 'WARN' : 'FAIL',
    `cmd-${index}`,
  ] as const))(
    'maps generated evidence status %s for %s',
    (status, command) => {
      const run = buildMonthlyAuditRun({
        inputPack: {
          mode: 'MONTHLY_AUDIT_INPUT_PACK',
          status: 'READY',
          month: '2026-05',
          generatedAt: '2026-05-10T00:00:00.000Z',
          summary: { evidenceCount: 1, passEvidenceCount: status === 'PASS' ? 1 : 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
          evidence: [{ id: command, command, status }],
          risks: [],
          actionItems: [],
          missingRequiredEvidence: [],
          auditReportCommand: 'cmd',
        },
        overallProgress: 90,
        currentFocus: 'verify',
        completedWeeks: [],
      });

      expect(run.auditReport!.evidence[0]).toMatchObject({ name: command, status });
      expect(run.status).toBe(status === 'FAIL' ? 'ACTION_REQUIRED' : 'PASSED');
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch138-risk-${index}`,
    `batch138-task-${index}`,
    index % 2 === 0 ? 'PASS' : 'WARN',
  ] as const))(
    'maps generated ready pack into audit report %s',
    (riskTitle, task, status) => {
      const run = buildMonthlyAuditRun({
        inputPack: {
          mode: 'MONTHLY_AUDIT_INPUT_PACK',
          status: 'READY',
          month: '2026-05',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { evidenceCount: 1, passEvidenceCount: status === 'PASS' ? 1 : 0, riskCount: 1, highRiskCount: 0, actionItemCount: 1, missingRequiredEvidenceCount: 0 },
          evidence: [{ id: `e-${riskTitle}`, command: `cmd-${riskTitle}`, status }],
          risks: [{ title: riskTitle, severity: 'MEDIUM', owner: 'owner' }],
          actionItems: [{ task, owner: 'owner', dueDate: '2026-06-01' }],
          missingRequiredEvidence: [],
          auditReportCommand: 'cmd',
        },
        overallProgress: 95,
        currentFocus: 'batch138',
        completedWeeks: ['Week 8'],
      });

      expect(run.status).toBe('ACTION_REQUIRED');
      expect(run.blockers).toEqual([riskTitle]);
      expect(run.auditReport!.evidence[0]).toMatchObject({ name: `cmd-${riskTitle}`, status });
      expect(run.auditReport!.recommendations).toContain(`${task} - Owner: owner - Due: 2026-06-01`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `missing-batch138-${index}`,
    index % 3,
  ] as const))(
    'generated blocked pack lists missing evidence %s',
    (missingEvidence, extraCount) => {
      const missingRequiredEvidence = [
        missingEvidence,
        ...Array.from({ length: extraCount }, (_, idx) => `extra-batch138-${idx}`),
      ];
      const run = buildMonthlyAuditRun({
        inputPack: {
          mode: 'MONTHLY_AUDIT_INPUT_PACK',
          status: 'BLOCKED',
          month: '2026-05',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: missingRequiredEvidence.length },
          evidence: [],
          risks: [],
          actionItems: [],
          missingRequiredEvidence,
          auditReportCommand: 'cmd',
        },
        overallProgress: 0,
        currentFocus: 'blocked',
        completedWeeks: [],
      });

      expect(run.status).toBe('BLOCKED');
      expect(run.auditReport).toBeNull();
      expect(run.blockers).toEqual([
        'input pack is not READY',
        ...missingRequiredEvidence.map((item) => `missing evidence: ${item}`),
      ]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch157-evidence-${index}`,
    index % 3 === 0 ? 'PASS' : index % 3 === 1 ? 'WARN' : 'FAIL',
    `focus-${index}`,
  ] as const))(
    'maps generated ready evidence %s with status %s',
    (id, status, currentFocus) => {
      const run = buildMonthlyAuditRun({
        inputPack: {
          mode: 'MONTHLY_AUDIT_INPUT_PACK',
          status: 'READY',
          month: '2026-05',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { evidenceCount: 1, passEvidenceCount: status === 'PASS' ? 1 : 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: 0 },
          evidence: [{ id, command: `cmd-${id}`, status, note: `note-${id}` }],
          risks: [],
          actionItems: [],
          missingRequiredEvidence: [],
          auditReportCommand: 'cmd',
        },
        overallProgress: 97,
        currentFocus,
        completedWeeks: [' Week 8 ', ' '],
      });

      expect(run.status).toBe(status === 'FAIL' ? 'ACTION_REQUIRED' : 'PASSED');
      expect(run.inputPackStatus).toBe('READY');
      expect(run.auditReport!.summary.currentFocus).toBe(currentFocus);
      expect(run.auditReport!.summary.completedWeeks).toEqual(['Week 8']);
      expect(run.auditReport!.evidence[0]).toEqual({ name: `cmd-${id}`, status, note: `note-${id}` });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [`missing157-${index}`, `missing157-extra-${index}`],
  ] as const))(
    'keeps generated blocked evidence order %#',
    (missingRequiredEvidence) => {
      const run = buildMonthlyAuditRun({
        inputPack: {
          mode: 'MONTHLY_AUDIT_INPUT_PACK',
          status: 'BLOCKED',
          month: '2026-05',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { evidenceCount: 0, passEvidenceCount: 0, riskCount: 0, highRiskCount: 0, actionItemCount: 0, missingRequiredEvidenceCount: missingRequiredEvidence.length },
          evidence: [],
          risks: [{ title: 'ignored-on-blocked', severity: 'HIGH', owner: 'owner' }],
          actionItems: [],
          missingRequiredEvidence,
          auditReportCommand: 'cmd',
        },
        overallProgress: 0,
        currentFocus: 'blocked',
        completedWeeks: [],
      });

      expect(run.status).toBe('BLOCKED');
      expect(run.auditReport).toBeNull();
      expect(run.blockers).toEqual([
        'input pack is not READY',
        ...missingRequiredEvidence.map((item) => `missing evidence: ${item}`),
      ]);
    },
  );
});
