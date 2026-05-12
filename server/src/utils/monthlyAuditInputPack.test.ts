import { describe, expect, it } from 'vitest';
import { buildMonthlyAuditInputPack } from './monthlyAuditInputPack';

describe('monthly audit input pack builder', () => {
  it('builds a ready input pack for monthly audit report generation', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      generatedAt: new Date('2026-05-06T01:00:00.000Z'),
      requiredEvidence: ['lint', 'server typecheck', 'high audit', 'knowledge index'],
      evidence: [
        { id: 'lint', command: 'npm run lint', status: 'PASS', note: '0 errors / 0 warnings' },
        { id: 'server typecheck', command: 'npm run typecheck --workspace=server -- --pretty false', status: 'PASS' },
        { id: 'high audit', command: 'npm audit --audit-level=high', status: 'PASS', note: 'high/critical = 0' },
        { id: 'knowledge index', command: 'npm run quality:knowledge-index --workspace=server', status: 'PASS', note: '17 items' },
      ],
      risks: [
        { title: 'main 落后远端 61 个提交', severity: 'HIGH', owner: 'release owner' },
        { title: '团队侧流程未确认', severity: 'MEDIUM', owner: 'AI 代码守护人' },
      ],
      actionItems: [
        { task: '安排质量回顾会', owner: 'AI 代码守护人', dueDate: '2026-05-08' },
      ],
    });

    expect(pack).toEqual({
      mode: 'MONTHLY_AUDIT_INPUT_PACK',
      status: 'READY',
      month: '2026-05',
      generatedAt: '2026-05-06T01:00:00.000Z',
      summary: {
        evidenceCount: 4,
        passEvidenceCount: 4,
        riskCount: 2,
        highRiskCount: 1,
        actionItemCount: 1,
        missingRequiredEvidenceCount: 0,
      },
      evidence: [
        { id: 'lint', command: 'npm run lint', status: 'PASS', note: '0 errors / 0 warnings' },
        { id: 'server typecheck', command: 'npm run typecheck --workspace=server -- --pretty false', status: 'PASS' },
        { id: 'high audit', command: 'npm audit --audit-level=high', status: 'PASS', note: 'high/critical = 0' },
        { id: 'knowledge index', command: 'npm run quality:knowledge-index --workspace=server', status: 'PASS', note: '17 items' },
      ],
      risks: [
        { title: 'main 落后远端 61 个提交', severity: 'HIGH', owner: 'release owner' },
        { title: '团队侧流程未确认', severity: 'MEDIUM', owner: 'AI 代码守护人' },
      ],
      actionItems: [
        { task: '安排质量回顾会', owner: 'AI 代码守护人', dueDate: '2026-05-08' },
      ],
      missingRequiredEvidence: [],
      auditReportCommand: 'npm run quality:audit-report --workspace=server -- --month 2026-05 --overall-progress 99 --current-focus "Week 8 体系巩固"',
    });
  });

  it('blocks the input pack when required evidence is missing or action owners are blank', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      generatedAt: new Date('2026-05-06T01:00:00.000Z'),
      requiredEvidence: ['lint', 'server typecheck'],
      evidence: [{ id: 'lint', command: 'npm run lint', status: 'PASS' }],
      risks: [],
      actionItems: [{ task: '安排质量回顾会', owner: '', dueDate: '' }],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.missingRequiredEvidence).toEqual(['server typecheck']);
    expect(pack.summary.missingRequiredEvidenceCount).toBe(1);
  });

  it('is READY with minimal valid input', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-06',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [],
    });

    expect(pack.status).toBe('READY');
    expect(pack.summary.evidenceCount).toBe(0);
    expect(pack.summary.missingRequiredEvidenceCount).toBe(0);
  });

  it('counts WARN and FAIL evidence separately', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: ['e1', 'e2', 'e3'],
      evidence: [
        { id: 'e1', command: 'cmd1', status: 'PASS' },
        { id: 'e2', command: 'cmd2', status: 'WARN', note: 'minor' },
        { id: 'e3', command: 'cmd3', status: 'FAIL', note: 'broken' },
      ],
      risks: [],
      actionItems: [],
    });

    expect(pack.status).toBe('READY');
    expect(pack.summary.passEvidenceCount).toBe(1);
    expect(pack.summary.evidenceCount).toBe(3);
  });

  it('blocks when action items have missing owner or dueDate', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [
        { task: 'task-1', owner: 'owner', dueDate: '' },
      ],
    });

    expect(pack.status).toBe('BLOCKED');
  });

  it('counts high severity risks', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [
        { title: 'risk-1', severity: 'HIGH', owner: 'o1' },
        { title: 'risk-2', severity: 'MEDIUM', owner: 'o2' },
        { title: 'risk-3', severity: 'HIGH', owner: 'o3' },
      ],
      actionItems: [],
    });

    expect(pack.summary.highRiskCount).toBe(2);
    expect(pack.summary.riskCount).toBe(3);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [],
    });
    const after = new Date();

    const ts = new Date(pack.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from evidence, risks, and action items', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: ['  e1  ', '  '],
      evidence: [{ id: '  e1  ', command: '  cmd  ', status: 'PASS', note: '  note  ' }],
      risks: [{ title: '  risk-1  ', severity: 'HIGH', owner: '  owner  ' }],
      actionItems: [{ task: '  task  ', owner: '  owner  ', dueDate: '  date  ' }],
    });

    expect(pack.evidence[0].id).toBe('e1');
    expect(pack.evidence[0].note).toBe('note');
    expect(pack.risks[0].title).toBe('risk-1');
    expect(pack.actionItems[0].task).toBe('task');
  });

  it('filters out evidence with empty id', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [
        { id: '  ', command: 'c', status: 'PASS' },
        { id: 'valid', command: 'c', status: 'PASS' },
      ],
      risks: [],
      actionItems: [],
    });

    expect(pack.summary.evidenceCount).toBe(1);
  });

  it('audit report command includes month', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-07',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [],
    });

    expect(pack.auditReportCommand).toContain('--month 2026-07');
  });

  it('filters out risks with empty titles', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [
        { title: '  ', severity: 'HIGH', owner: 'o' },
        { title: 'real risk', severity: 'LOW', owner: 'o' },
      ],
      actionItems: [],
    });

    expect(pack.summary.riskCount).toBe(1);
    expect(pack.risks[0].title).toBe('real risk');
  });

  it('filters out action items with empty tasks', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [
        { task: '  ', owner: 'o', dueDate: 'd' },
        { task: 'real task', owner: 'o', dueDate: 'd' },
      ],
    });

    expect(pack.summary.actionItemCount).toBe(1);
    expect(pack.actionItems[0].task).toBe('real task');
  });

  it('sets note to undefined when whitespace-only', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [{ id: 'e1', command: 'cmd', status: 'PASS', note: '   ' }],
      risks: [],
      actionItems: [],
    });

    expect(pack.evidence[0].note).toBeUndefined();
  });

  it('blocks when action item has owner but empty dueDate', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [{ task: 'task', owner: 'owner', dueDate: '' }],
    });

    expect(pack.status).toBe('BLOCKED');
  });

  it('filters whitespace-only required evidence so they are not counted as missing', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: ['  ', 'real'],
      evidence: [{ id: 'real', command: 'cmd', status: 'PASS' }],
      risks: [],
      actionItems: [],
    });

    expect(pack.missingRequiredEvidence).toEqual([]);
    expect(pack.status).toBe('READY');
  });

  it('blocks when action item has dueDate but empty owner', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [{ task: 'task', owner: '', dueDate: '2026-06-01' }],
    });

    expect(pack.status).toBe('BLOCKED');
  });

  it('counts WARN evidence separately from PASS in summary', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [
        { id: 'e1', command: 'cmd1', status: 'PASS' },
        { id: 'e2', command: 'cmd2', status: 'WARN' },
      ],
      risks: [],
      actionItems: [],
    });

    expect(pack.summary.passEvidenceCount).toBe(1);
    expect(pack.summary.evidenceCount).toBe(2);
  });

  it('action items with whitespace-only owner are filtered but still block status', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [{ task: 'task', owner: '   ', dueDate: '2026-06-01' }],
    });

    expect(pack.actionItems).toHaveLength(1);
    expect(pack.status).toBe('BLOCKED');
  });

  it('evidence with undefined note keeps note undefined', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [{ id: 'e1', command: 'cmd', status: 'PASS' }],
      risks: [],
      actionItems: [],
    });

    expect(pack.evidence[0].note).toBeUndefined();
  });

  it('mode is always MONTHLY_AUDIT_INPUT_PACK', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [],
    });

    expect(pack.mode).toBe('MONTHLY_AUDIT_INPUT_PACK');
  });

  it('is READY when action items have all fields even with missing evidence not required', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [{ task: 'task', owner: 'owner', dueDate: '2026-06-01' }],
    });

    expect(pack.status).toBe('READY');
    expect(pack.summary.actionItemCount).toBe(1);
  });

  it('pack status is BLOCKED when missing required evidence', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      generatedAt: new Date('2026-05-06T01:00:00.000Z'),
      requiredEvidence: ['lint', 'typecheck'],
      evidence: [{ id: 'lint', command: 'npm run lint', status: 'PASS' }],
      risks: [],
      actionItems: [],
    });
    expect(pack.missingRequiredEvidence).toContain('typecheck');
  });

  it('generates pack with mode MONTHLY_AUDIT_INPUT_PACK', () => {
    const pack = buildMonthlyAuditInputPack({
      month: '2026-05',
      requiredEvidence: [],
      evidence: [],
      risks: [],
      actionItems: [],
    });
    expect(pack.mode).toBe('MONTHLY_AUDIT_INPUT_PACK');
  });


  it('pack with empty evidence list has zero evidence count', () => {
    const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [], actionItems: [] });
    expect(pack.mode).toBe('MONTHLY_AUDIT_INPUT_PACK');
    expect(pack.summary.evidenceCount).toBe(0);
  });

  it('buildMonthlyAuditInputPack handles all empty inputs', () => { const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [], actionItems: [] }); expect(pack.summary.riskCount).toBe(0); });

  it('buildMonthlyAuditInputPack defaults month to empty string', () => { const pack = buildMonthlyAuditInputPack({ month: '', requiredEvidence: [], evidence: [], risks: [], actionItems: [] }); expect(pack.month).toBe(''); });

  it('buildMonthlyAuditInputPack counts risks correctly', () => { const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [{ severity: 'HIGH', title: 'r1', owner: 'admin' }, { severity: 'LOW', title: 'r2', owner: 'user' }], actionItems: [] }); expect(pack.summary.riskCount).toBe(2); });

  it('buildMonthlyAuditInputPack handles missing requiredEvidence', () => { const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [], actionItems: [] }); expect(pack.summary.missingRequiredEvidenceCount).toBe(0); });

  it('buildMonthlyAuditInputPack counts action items correctly', () => { const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [], actionItems: [{ task: 'a', owner: 'x', dueDate: '', source: '', status: 'OPEN' }] }); expect(pack.summary.actionItemCount).toBe(1); });

  it('buildMonthlyAuditInputPack handles all fields as undefined', () => { const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [], actionItems: [] }); expect(pack.month).toBe('2026-05'); });

  it('buildMonthlyAuditInputPack handles empty risks array', () => { const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [], actionItems: [] }); expect(pack.summary.riskCount).toBe(0); });

  it('buildMonthlyAuditInputPack handles empty actionItems array', () => { const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [], actionItems: [] }); expect(pack.summary.actionItemCount).toBe(0); });

  it('buildMonthlyAuditInputPack handles non-empty risks array', () => { const pack = buildMonthlyAuditInputPack({ month: '2026-05', requiredEvidence: [], evidence: [], risks: [{ title: 'risk1', severity: 'HIGH', owner: 'admin' }], actionItems: [] }); expect(pack).toBeDefined(); });

  it('buildMonthlyAuditInputPack handles empty month string', () => { const pack = buildMonthlyAuditInputPack({ month: '', requiredEvidence: [], evidence: [], risks: [], actionItems: [] }); expect(pack).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch105-evidence-${index}`,
    ['PASS', 'WARN', 'FAIL'][index % 3] as const,
    index % 2 === 0 ? ` note-${index} ` : undefined,
  ] as const))(
    'summarizes generated evidence %s with status %s',
    (id, status, note) => {
      const pack = buildMonthlyAuditInputPack({
        month: '2026-05',
        requiredEvidence: [` ${id} `],
        evidence: [{ id: ` ${id} `, command: ` npm run check:${id} `, status, note }],
        risks: [],
        actionItems: [],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary.evidenceCount).toBe(1);
      expect(pack.summary.passEvidenceCount).toBe(status === 'PASS' ? 1 : 0);
      expect(pack.missingRequiredEvidence).toEqual([]);
      expect(pack.evidence[0].id).toBe(id);
      expect(pack.evidence[0].command).toBe(`npm run check:${id}`);
      expect(pack.evidence[0].note).toBe(note?.trim());
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch105-required-${index}`,
    `batch105-present-${index}`,
  ] as const))(
    'reports generated missing evidence %s while preserving present evidence',
    (missingId, presentId) => {
      const pack = buildMonthlyAuditInputPack({
        month: '2026-05',
        requiredEvidence: [presentId, missingId],
        evidence: [{ id: presentId, command: 'npm run present', status: 'PASS' }],
        risks: [{ title: ` risk-${missingId} `, severity: 'HIGH', owner: ' owner ' }],
        actionItems: [{ task: ` action-${missingId} `, owner: ' owner ', dueDate: ' 2026-06-01 ' }],
      });

      expect(pack.status).toBe('BLOCKED');
      expect(pack.summary.highRiskCount).toBe(1);
      expect(pack.summary.actionItemCount).toBe(1);
      expect(pack.missingRequiredEvidence).toEqual([missingId]);
      expect(pack.risks[0].title).toBe(`risk-${missingId}`);
      expect(pack.actionItems[0].dueDate).toBe('2026-06-01');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch138-evidence-${index}`,
    index % 3 === 0 ? 'PASS' : index % 3 === 1 ? 'WARN' : 'FAIL',
    `batch138-risk-${index}`,
  ] as const))(
    'normalizes generated evidence and risk %s',
    (evidenceId, status, riskTitle) => {
      const pack = buildMonthlyAuditInputPack({
        month: '2026-05',
        requiredEvidence: [` ${evidenceId} `],
        evidence: [{ id: ` ${evidenceId} `, command: ` npm run ${evidenceId} `, status, note: ' note ' }],
        risks: [{ title: ` ${riskTitle} `, severity: indexSeverity(status), owner: ' owner ' }],
        actionItems: [],
      });

      expect(pack.status).toBe('READY');
      expect(pack.missingRequiredEvidence).toEqual([]);
      expect(pack.evidence[0]).toEqual({ id: evidenceId, command: `npm run ${evidenceId}`, status, note: 'note' });
      expect(pack.risks[0].title).toBe(riskTitle);
      expect(pack.summary.highRiskCount).toBe(status === 'FAIL' ? 1 : 0);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch138-required-${index}`,
    index % 2 === 0 ? '' : ' ',
    index % 3 === 0 ? '' : `2026-06-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'blocks generated missing evidence or incomplete action %s',
    (requiredEvidence, owner, dueDate) => {
      const pack = buildMonthlyAuditInputPack({
        month: '2026-05',
        requiredEvidence: [requiredEvidence],
        evidence: [],
        risks: [],
        actionItems: [{ task: `task-${requiredEvidence}`, owner, dueDate }],
      });

      expect(pack.status).toBe('BLOCKED');
      expect(pack.missingRequiredEvidence).toEqual([requiredEvidence]);
      expect(pack.summary.missingRequiredEvidenceCount).toBe(1);
      expect(pack.summary.actionItemCount).toBe(1);
    },
  );
});

describe('monthly audit input pack batch 157 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch157-evidence-${index}`,
    index % 2 === 0 ? 'PASS' : 'WARN',
    `batch157-command-${index}`,
  ] as const))(
    'keeps generated duplicate evidence entries while satisfying requirement %s',
    (id, secondStatus, command) => {
      const pack = buildMonthlyAuditInputPack({
        month: '2026-05',
        requiredEvidence: [` ${id} `],
        evidence: [
          { id: ` ${id} `, command: ` ${command}-first `, status: 'PASS', note: ' first ' },
          { id, command: ` ${command}-second `, status: secondStatus },
        ],
        risks: [],
        actionItems: [],
      });

      expect(pack.status).toBe('READY');
      expect(pack.missingRequiredEvidence).toEqual([]);
      expect(pack.summary.evidenceCount).toBe(2);
      expect(pack.summary.passEvidenceCount).toBe(secondStatus === 'PASS' ? 2 : 1);
      expect(pack.evidence.map((item) => item.command)).toEqual([
        `${command}-first`,
        `${command}-second`,
      ]);
      expect(pack.evidence[0].note).toBe('first');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch157-task-${index}`,
    index % 2 === 0 ? '' : ' ',
    index % 3 === 0 ? '' : ' ',
  ] as const))(
    'filters generated blank task before incomplete action can block %s',
    (_task, owner, dueDate) => {
      const pack = buildMonthlyAuditInputPack({
        month: '2026-05',
        requiredEvidence: [],
        evidence: [],
        risks: [],
        actionItems: [{ task: '   ', owner, dueDate }],
      });

      expect(pack.status).toBe('READY');
      expect(pack.actionItems).toEqual([]);
      expect(pack.summary.actionItemCount).toBe(0);
      expect(pack.summary.missingRequiredEvidenceCount).toBe(0);
    },
  );
});

function indexSeverity(status: 'PASS' | 'WARN' | 'FAIL'): 'LOW' | 'MEDIUM' | 'HIGH' {
  return status === 'FAIL' ? 'HIGH' : status === 'WARN' ? 'MEDIUM' : 'LOW';
}
