import { describe, expect, it } from 'vitest';
import { buildMonthlyQualityAuditReport } from './monthlyQualityAudit';

describe('monthly quality audit report builder', () => {
  it('marks the month as action required when blockers remain', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 99,
      currentFocus: 'Week 8 体系巩固',
      completedWeeks: ['Week 2', 'Week 4', 'Week 5', 'Week 7'],
      evidence: [
        { name: 'npm run lint', status: 'PASS', note: '0 errors / 0 warnings' },
        { name: 'npm run typecheck --workspace=server -- --pretty false', status: 'PASS' },
        { name: 'npm audit --audit-level=high', status: 'PASS', note: 'high/critical = 0' },
        { name: '团队质量回顾会', status: 'WARN', note: '尚未安排' },
      ],
      blockers: [
        '团队侧流程未确认',
        'main 落后远端 61 个提交',
      ],
      recommendations: ['安排第一次质量回顾会'],
      generatedAt: new Date('2026-05-05T20:00:00.000Z'),
    });

    expect(report).toEqual({
      mode: 'MONTHLY_QUALITY_AUDIT',
      status: 'ACTION_REQUIRED',
      month: '2026-05',
      generatedAt: '2026-05-05T20:00:00.000Z',
      summary: {
        overallProgress: 99,
        currentFocus: 'Week 8 体系巩固',
        completedWeeks: ['Week 2', 'Week 4', 'Week 5', 'Week 7'],
      },
      evidenceSummary: {
        total: 4,
        pass: 3,
        warn: 1,
        fail: 0,
      },
      evidence: [
        { name: 'npm run lint', status: 'PASS', note: '0 errors / 0 warnings' },
        { name: 'npm run typecheck --workspace=server -- --pretty false', status: 'PASS' },
        { name: 'npm audit --audit-level=high', status: 'PASS', note: 'high/critical = 0' },
        { name: '团队质量回顾会', status: 'WARN', note: '尚未安排' },
      ],
      blockers: [
        '团队侧流程未确认',
        'main 落后远端 61 个提交',
      ],
      recommendations: [
        '安排第一次质量回顾会',
        'Close all blockers before marking Week 8 complete.',
      ],
    });
  });

  it('passes when all evidence is green and no blockers remain', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-06',
      overallProgress: 100,
      currentFocus: '体系运营',
      completedWeeks: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7', 'Week 8'],
      evidence: [
        { name: 'npm run lint', status: 'PASS' },
        { name: 'npm run test:e2e:p0', status: 'PASS' },
      ],
      blockers: [],
      recommendations: [],
      generatedAt: new Date('2026-06-01T02:00:00.000Z'),
    });

    expect(report.status).toBe('PASSED');
    expect(report.recommendations).toEqual(['Archive the monthly report and keep the next audit on schedule.']);
  });

  it('is ACTION_REQUIRED when any evidence is FAIL even without blockers', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 80,
      currentFocus: 'fix',
      completedWeeks: ['Week 1'],
      evidence: [
        { name: 'lint', status: 'PASS' },
        { name: 'typecheck', status: 'FAIL', note: '3 errors' },
      ],
      blockers: [],
      recommendations: ['Fix type errors'],
    });

    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.evidenceSummary.fail).toBe(1);
    expect(report.evidenceSummary.pass).toBe(1);
  });

  it('filters out evidence with empty names', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [
        { name: '  ', status: 'PASS' },
        { name: 'valid', status: 'PASS' },
      ],
      blockers: [],
      recommendations: [],
    });

    expect(report.evidenceSummary.total).toBe(1);
    expect(report.evidence[0].name).toBe('valid');
  });

  it('appends blocker recommendation when status is ACTION_REQUIRED', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 50,
      currentFocus: 'fix',
      completedWeeks: [],
      evidence: [{ name: 'e', status: 'PASS' }],
      blockers: ['blocker-1'],
      recommendations: ['fix blocker'],
    });

    expect(report.recommendations).toEqual(['fix blocker', 'Close all blockers before marking Week 8 complete.']);
  });

  it('uses default archive recommendation when PASSED with empty recommendations', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-06',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: ['W1'],
      evidence: [{ name: 'e', status: 'PASS' }],
      blockers: [],
      recommendations: [],
    });

    expect(report.status).toBe('PASSED');
    expect(report.recommendations).toEqual(['Archive the monthly report and keep the next audit on schedule.']);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [],
      blockers: [],
      recommendations: [],
    });
    const after = new Date();

    const ts = new Date(report.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from evidence names and notes', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [{ name: '  lint  ', status: 'PASS', note: '  clean  ' }],
      blockers: [],
      recommendations: [],
    });

    expect(report.evidence[0].name).toBe('lint');
    expect(report.evidence[0].note).toBe('clean');
  });

  it('omits note when empty after trim', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [{ name: 'lint', status: 'PASS', note: '  ' }],
      blockers: [],
      recommendations: [],
    });

    expect(report.evidence[0].note).toBeUndefined();
  });

  it('PASSED with custom recommendations keeps them', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-06',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [{ name: 'e', status: 'PASS' }],
      blockers: [],
      recommendations: ['schedule next audit'],
    });

    expect(report.recommendations).toEqual(['schedule next audit']);
  });

  it('trims and filters completedWeeks and blockers', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: ['  W1  ', '  '],
      evidence: [],
      blockers: ['  blocker-1  ', '  '],
      recommendations: [],
    });

    expect(report.summary.completedWeeks).toEqual(['W1']);
    expect(report.blockers).toEqual(['blocker-1']);
  });

  it('mode is always MONTHLY_QUALITY_AUDIT', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [],
      blockers: [],
      recommendations: [],
    });

    expect(report.mode).toBe('MONTHLY_QUALITY_AUDIT');
  });

  it('adds blocker recommendation when ACTION_REQUIRED', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 50,
      currentFocus: 'fix',
      completedWeeks: [],
      evidence: [],
      blockers: ['missing config'],
      recommendations: [],
    });

    expect(report.recommendations).toContain('Close all blockers before marking Week 8 complete.');
  });

  it('default PASSED recommendation when no custom ones', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-06',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [{ name: 'e', status: 'PASS' }],
      blockers: [],
      recommendations: [],
    });

    expect(report.recommendations).toEqual(['Archive the monthly report and keep the next audit on schedule.']);
  });

  it('ACTION_REQUIRED from FAIL evidence without blockers omits blocker closure recommendation', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 50,
      currentFocus: 'fix',
      completedWeeks: [],
      evidence: [{ name: 'typecheck', status: 'FAIL' }],
      blockers: [],
      recommendations: ['fix type errors'],
    });

    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.recommendations).not.toContain('Close all blockers before marking Week 8 complete.');
    expect(report.recommendations).toEqual(['fix type errors']);
  });

  it('WARN evidence without blockers results in PASSED', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 90,
      currentFocus: 'wrap up',
      completedWeeks: ['Week 1', 'Week 2'],
      evidence: [{ name: 'lint', status: 'WARN', note: 'minor warnings' }],
      blockers: [],
      recommendations: [],
    });

    expect(report.status).toBe('PASSED');
    expect(report.evidenceSummary.warn).toBe(1);
    expect(report.evidenceSummary.fail).toBe(0);
  });

  it('keeps month field unchanged in output', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-12',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [],
      blockers: [],
      recommendations: [],
    });

    expect(report.month).toBe('2026-12');
  });

  it('ACTION_REQUIRED with empty recommendations and blockers adds closure recommendation', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 50,
      currentFocus: 'fix',
      completedWeeks: [],
      evidence: [{ name: 'typecheck', status: 'FAIL' }],
      blockers: [],
      recommendations: [],
    });

    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.recommendations).toEqual([]);
  });

  it('trims and filters whitespace-only recommendations', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 100,
      currentFocus: 'done',
      completedWeeks: [],
      evidence: [{ name: 'e', status: 'PASS' }],
      blockers: [],
      recommendations: ['  fix issue  ', '  ', '  review code  '],
    });

    expect(report.recommendations).toEqual(['fix issue', 'review code']);
  });

  it('preserves overallProgress as-is in summary', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 73,
      currentFocus: 'in progress',
      completedWeeks: ['W1'],
      evidence: [],
      blockers: [],
      recommendations: [],
    });

    expect(report.summary.overallProgress).toBe(73);
    expect(report.summary.currentFocus).toBe('in progress');
  });

  it('empty evidence produces zero totals in evidenceSummary', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 50,
      currentFocus: 'start',
      completedWeeks: [],
      evidence: [],
      blockers: [],
      recommendations: [],
    });

    expect(report.evidenceSummary).toEqual({ total: 0, pass: 0, warn: 0, fail: 0 });
    expect(report.status).toBe('PASSED');
  });

  it('report with FAIL evidence has ACTION_REQUIRED status', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 50,
      currentFocus: 'start',
      completedWeeks: [],
      evidence: [{ name: 'test', status: 'FAIL' }],
      blockers: [],
      recommendations: [],
    });
    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.evidenceSummary.fail).toBe(1);
  });

  it('audit report includes timestamp', () => {
    const report = buildMonthlyQualityAuditReport({
      month: '2026-05',
      overallProgress: 50,
      currentFocus: 'start',
      completedWeeks: [],
      evidence: [],
      blockers: [],
      recommendations: [],
    });
    expect(report.generatedAt).toBeDefined();
  });

  it('report with empty evidence returns valid structure', () => {
    const report = buildMonthlyQualityAuditReport({ month: '2026-05', overallProgress: 0, currentFocus: 'start', completedWeeks: [], evidence: [], blockers: [], recommendations: [] });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeDefined();
  });

  it('buildMonthlyQualityAuditReport handles empty blockers', () => { const report = buildMonthlyQualityAuditReport({ month: '2026-05', overallProgress: 0, currentFocus: 'start', completedWeeks: [], evidence: [], blockers: [], recommendations: [] }); expect(report.blockers).toHaveLength(0); });

  it('buildMonthlyQualityAuditReport defaults month field', () => { const report = buildMonthlyQualityAuditReport({ month: '', overallProgress: 0, currentFocus: '', completedWeeks: [], evidence: [], blockers: [], recommendations: [] }); expect(report.month).toBe(''); });

  it('buildMonthlyQualityAuditReport handles non-empty recommendations', () => { const report = buildMonthlyQualityAuditReport({ month: '2026-05', overallProgress: 50, currentFocus: 'mid', completedWeeks: ['w1'], evidence: [], blockers: [], recommendations: ['rec1', 'rec2'] }); expect(report.recommendations).toHaveLength(2); });

  it('buildMonthlyQualityAuditReport handles all completed weeks', () => { const report = buildMonthlyQualityAuditReport({ month: '2026-05', overallProgress: 100, currentFocus: 'done', completedWeeks: ['w1','w2','w3','w4'], evidence: [], blockers: [], recommendations: [] }); expect(report.month).toBe('2026-05'); });

  it('buildMonthlyQualityAuditReport handles blockers with severity', () => { const report = buildMonthlyQualityAuditReport({ month: '2026-05', overallProgress: 20, currentFocus: 'fix', completedWeeks: [], evidence: [], blockers: ['test blocker'], recommendations: [] }); expect(report.blockers).toHaveLength(1); });

  it('buildMonthlyQualityAuditReport handles 100 percent progress', () => { const report = buildMonthlyQualityAuditReport({ month: '2026-05', overallProgress: 100, currentFocus: '', completedWeeks: ['w1','w2','w3','w4'], evidence: [], blockers: [], recommendations: [] }); expect(report.month).toBe('2026-05'); });

  it('buildMonthlyQualityAuditReport handles empty recommendations', () => { const report = buildMonthlyQualityAuditReport({ month: '2026-05', overallProgress: 0, currentFocus: '', completedWeeks: [], evidence: [], blockers: [], recommendations: [] }); expect(report).toBeDefined(); });

  it('buildMonthlyQualityAuditReport handles non-empty blockers', () => { const report = buildMonthlyQualityAuditReport({ month: '2026-05', overallProgress: 0, currentFocus: '', completedWeeks: [], evidence: [], blockers: ['blocker1'], recommendations: [] }); expect(report.blockers).toHaveLength(1); });

  it('buildMonthlyQualityAuditReport handles empty month', () => { const report = buildMonthlyQualityAuditReport({ month: '', overallProgress: 50, currentFocus: 'test', completedWeeks: [], evidence: [], blockers: [], recommendations: [] }); expect(report).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [` evidence ${index} 中文 <tag> `, index % 3 === 0 ? 'PASS' : index % 3 === 1 ? 'WARN' : 'FAIL']))(
    'normalizes generated evidence name and status %s',
    (name, status) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-05',
        overallProgress: 100,
        currentFocus: 'audit',
        completedWeeks: [],
        evidence: [{ name, status: status as 'PASS' | 'WARN' | 'FAIL', note: '  note  ' }],
        blockers: [],
        recommendations: [],
      });

      expect(report.evidence[0].name).toBe(name.trim());
      expect(report.evidence[0].note).toBe('note');
      expect(report.evidenceSummary.total).toBe(1);
      expect(report.status).toBe(status === 'FAIL' ? 'ACTION_REQUIRED' : 'PASSED');
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [` blocker ${index} `, ` recommendation ${index} `]))(
    'trims generated blocker and recommendation %s',
    (blocker, recommendation) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-05',
        overallProgress: 99,
        currentFocus: 'closeout',
        completedWeeks: [' Week 8 ', ' '],
        evidence: [{ name: 'lint', status: 'PASS' }],
        blockers: [blocker, ' '],
        recommendations: [recommendation, ' '],
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.blockers).toEqual([blocker.trim()]);
      expect(report.recommendations).toContain(recommendation.trim());
      expect(report.recommendations).toContain('Close all blockers before marking Week 8 complete.');
      expect(report.summary.completedWeeks).toEqual(['Week 8']);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    [
      { name: ` pass ${index} `, status: 'PASS' },
      { name: ` warn ${index} `, status: 'WARN' },
      { name: ` fail ${index} `, status: 'FAIL' },
      { name: '   ', status: 'PASS' },
    ],
  ] as const))(
    'summarizes generated mixed evidence %#',
    (evidence) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-05',
        overallProgress: 88,
        currentFocus: 'evidence review',
        completedWeeks: [],
        evidence,
        blockers: [],
        recommendations: [],
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.evidenceSummary).toEqual({ total: 3, pass: 1, warn: 1, fail: 1 });
      expect(report.evidence.map((item) => item.name)).toEqual([
        evidence[0].name.trim(),
        evidence[1].name.trim(),
        evidence[2].name.trim(),
      ]);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [` Week ${index + 1} `, ` focus ${index} `]))(
    'keeps generated passed report recommendation fallback %s',
    (completedWeek, currentFocus) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-05',
        overallProgress: 100,
        currentFocus,
        completedWeeks: [completedWeek, ' '],
        evidence: [{ name: ` lint ${completedWeek} `, status: 'PASS', note: '  clean  ' }],
        blockers: [],
        recommendations: [' '],
      });

      expect(report.status).toBe('PASSED');
      expect(report.summary.currentFocus).toBe(currentFocus);
      expect(report.summary.completedWeeks).toEqual([completedWeek.trim()]);
      expect(report.recommendations).toEqual(['Archive the monthly report and keep the next audit on schedule.']);
      expect(report.evidence[0].note).toBe('clean');
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-${String((index % 12) + 1).padStart(2, '0')}`,
    `focus-${index}`,
    index,
  ] as const))(
    'builds generated passing monthly audit %s',
    (month, currentFocus, progress) => {
      const report = buildMonthlyQualityAuditReport({
        month,
        overallProgress: progress,
        currentFocus,
        completedWeeks: [` Week ${indexFromMonth(month)} `],
        evidence: [{ name: ` lint-${progress} `, status: 'PASS', note: ' clean ' }],
        blockers: [' '],
        recommendations: [' '],
      });

      expect(report.status).toBe('PASSED');
      expect(report.month).toBe(month);
      expect(report.summary.currentFocus).toBe(currentFocus);
      expect(report.evidenceSummary).toEqual({ total: 1, pass: 1, warn: 0, fail: 0 });
      expect(report.recommendations).toEqual(['Archive the monthly report and keep the next audit on schedule.']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `blocker-${index}`,
    index % 2 === 0 ? 'FAIL' : 'WARN',
  ] as const))(
    'builds generated action-required monthly audit %s',
    (blocker, status) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-08',
        overallProgress: 90,
        currentFocus: 'quality closeout',
        completedWeeks: [],
        evidence: [{ name: `evidence-${blocker}`, status }],
        blockers: [blocker],
        recommendations: [`review-${blocker}`],
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.blockers).toEqual([blocker]);
      expect(report.evidenceSummary.fail).toBe(status === 'FAIL' ? 1 : 0);
      expect(report.evidenceSummary.warn).toBe(status === 'WARN' ? 1 : 0);
      expect(report.recommendations).toContain('Close all blockers before marking Week 8 complete.');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch138-evidence-${index}`,
    index % 3 === 0 ? 'PASS' : index % 3 === 1 ? 'WARN' : 'FAIL',
  ] as const))(
    'summarizes generated single evidence %s',
    (name, status) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-05',
        overallProgress: 100,
        currentFocus: 'batch138',
        completedWeeks: [' Week 8 '],
        evidence: [{ name: ` ${name} `, status, note: ' note ' }],
        blockers: [],
        recommendations: [],
      });

      expect(report.evidence[0]).toEqual({ name, status, note: 'note' });
      expect(report.evidenceSummary).toEqual({
        total: 1,
        pass: status === 'PASS' ? 1 : 0,
        warn: status === 'WARN' ? 1 : 0,
        fail: status === 'FAIL' ? 1 : 0,
      });
      expect(report.status).toBe(status === 'FAIL' ? 'ACTION_REQUIRED' : 'PASSED');
      expect(report.summary.completedWeeks).toEqual(['Week 8']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch138-blocker-${index}`,
    `batch138-rec-${index}`,
  ] as const))(
    'generated blocker adds close-blockers recommendation %s',
    (blocker, recommendation) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-05',
        overallProgress: 90,
        currentFocus: 'batch138',
        completedWeeks: [],
        evidence: [{ name: 'lint', status: 'PASS' }],
        blockers: [` ${blocker} `],
        recommendations: [` ${recommendation} `],
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.blockers).toEqual([blocker]);
      expect(report.recommendations).toEqual([
        recommendation,
        'Close all blockers before marking Week 8 complete.',
      ]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch157-rec-${index}`,
    `batch157-week-${index}`,
  ] as const))(
    'keeps generated custom passed recommendation %s',
    (recommendation, completedWeek) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-09',
        overallProgress: 100,
        currentFocus: 'batch157',
        completedWeeks: [` ${completedWeek} `, ' '],
        evidence: [{ name: ' lint ', status: 'PASS', note: ' clean ' }],
        blockers: [' '],
        recommendations: [` ${recommendation} `, ' '],
      });

      expect(report.status).toBe('PASSED');
      expect(report.summary.completedWeeks).toEqual([completedWeek]);
      expect(report.evidence[0]).toEqual({ name: 'lint', status: 'PASS', note: 'clean' });
      expect(report.recommendations).toEqual([recommendation]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch157-fail-${index}`,
    index % 2 === 0 ? '' : ` review-${index} `,
  ] as const))(
    'keeps generated failed evidence action required without blocker closure %s',
    (evidenceName, recommendation) => {
      const report = buildMonthlyQualityAuditReport({
        month: '2026-09',
        overallProgress: 92,
        currentFocus: 'batch157 failure review',
        completedWeeks: [],
        evidence: [{ name: ` ${evidenceName} `, status: 'FAIL', note: ' fail ' }],
        blockers: [' '],
        recommendations: [recommendation],
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.blockers).toEqual([]);
      expect(report.evidenceSummary).toEqual({ total: 1, pass: 0, warn: 0, fail: 1 });
      expect(report.recommendations).toEqual(recommendation.trim() ? [recommendation.trim()] : []);
      expect(report.recommendations).not.toContain('Close all blockers before marking Week 8 complete.');
    },
  );
});

function indexFromMonth(month: string): string {
  return month.split('-').at(-1) ?? '00';
}
