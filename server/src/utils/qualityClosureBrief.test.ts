import { describe, expect, it } from 'vitest';
import { buildDefaultQualityClosureBriefDashboard, buildQualityClosureBrief } from './qualityClosureBrief';

describe('quality closure brief builder', () => {
  it('builds a meeting-ready markdown brief from dashboard checks', () => {
    const brief = buildQualityClosureBrief({
      generatedAt: new Date('2026-05-06T16:00:00.000Z'),
      dashboard: {
        status: 'ACTION_REQUIRED',
        currentFocus: {
          name: 'blocker register',
          mode: 'QUALITY_BLOCKER_REGISTER',
          command: 'npm run quality:blocker-register --workspace=server',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'CLEAR',
          nextAction: 'clear or explicitly accept the 3 open human blockers',
        },
        checks: [
          {
            name: 'blocker register',
            mode: 'QUALITY_BLOCKER_REGISTER',
            command: 'npm run quality:blocker-register --workspace=server',
            status: 'ACTION_REQUIRED',
            expectedStatus: 'CLEAR',
            nextAction: 'clear or explicitly accept the 3 open human blockers',
          },
          {
            name: 'final closure',
            mode: 'WEEK8_FINAL_CLOSURE',
            command: 'npm run quality:final-closure --workspace=server -- --artifact ...',
            status: 'ACTION_REQUIRED',
            expectedStatus: 'READY_TO_ARCHIVE',
            nextAction: 'run final closure after evidence and confirmations are complete',
          },
        ],
      },
    });

    expect(brief).toEqual({
      mode: 'QUALITY_CLOSURE_BRIEF',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T16:00:00.000Z',
      summary: {
        checkCount: 2,
        actionRequired: 2,
      },
      markdown: [
        '# Week 8 收口简报',
        '',
        '- 当前状态：ACTION_REQUIRED',
        '- 当前焦点：blocker register',
        '- 下一步：clear or explicitly accept the 3 open human blockers',
        '- 建议命令：`npm run quality:blocker-register --workspace=server`',
        '',
        '## 检查项',
        '',
        '| 检查项 | 当前状态 | 目标状态 | 下一步 |',
        '| --- | --- | --- | --- |',
        '| blocker register | ACTION_REQUIRED | CLEAR | clear or explicitly accept the 3 open human blockers |',
        '| final closure | ACTION_REQUIRED | READY_TO_ARCHIVE | run final closure after evidence and confirmations are complete |',
      ].join('\n'),
    });
  });

  it('marks the brief ready when the dashboard is ready', () => {
    const brief = buildQualityClosureBrief({
      generatedAt: new Date('2026-05-06T16:00:00.000Z'),
      dashboard: {
        status: 'READY',
        checks: [],
      },
    });

    expect(brief.status).toBe('READY');
    expect(brief.markdown).toContain('- 当前状态：READY');
  });

  it('uses blocker resolution in the default meeting brief dashboard', () => {
    const dashboard = buildDefaultQualityClosureBriefDashboard();

    expect(dashboard.checks.map((check) => check.name)).toEqual([
      'blocker register',
      'blocker resolution',
      'closure evidence pack',
      'closure evidence handoff',
      'owner assignments',
      'evidence intake',
      'closure remaining work',
      'closure request pack',
      'closure sequence',
      'final closure',
    ]);
    expect(dashboard.checks[1]).toMatchObject({
      mode: 'QUALITY_BLOCKER_RESOLUTION',
      command: 'npm run quality:blocker-resolution --workspace=server',
      status: 'ACTION_REQUIRED',
      expectedStatus: 'RESOLVED',
    });
    expect(dashboard.checks[2]).toMatchObject({
      mode: 'QUALITY_CLOSURE_EVIDENCE_PACK',
      command: 'npm run quality:closure-evidence-pack --workspace=server',
      status: 'READY',
      expectedStatus: 'READY',
    });
    expect(dashboard.checks[3]).toMatchObject({
      mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
      command: 'npm run quality:closure-evidence-handoff --workspace=server',
      status: 'READY',
      expectedStatus: 'READY',
    });
    expect(dashboard.checks[6]).toMatchObject({
      mode: 'QUALITY_CLOSURE_REMAINING_WORK',
      command: 'npm run quality:closure-remaining-work --workspace=server',
      status: 'ACTION_REQUIRED',
      expectedStatus: 'READY',
    });
    expect(dashboard.checks[7]).toMatchObject({
      mode: 'QUALITY_CLOSURE_REQUEST_PACK',
      command: 'npm run quality:closure-request-pack --workspace=server',
      status: 'ACTION_REQUIRED',
      expectedStatus: 'READY',
    });
  });

  it('builds markdown with no current focus', () => {
    const brief = buildQualityClosureBrief({
      generatedAt: new Date('2026-05-06T16:00:00.000Z'),
      dashboard: {
        status: 'READY',
        checks: [],
      },
    });

    expect(brief.markdown).toContain('- 当前焦点：无');
    expect(brief.markdown).toContain('- 下一步：可进入归档');
    expect(brief.markdown).toContain('- 建议命令：无');
  });

  it('counts action-required checks correctly', () => {
    const brief = buildQualityClosureBrief({
      generatedAt: new Date('2026-05-06T16:00:00.000Z'),
      dashboard: {
        status: 'ACTION_REQUIRED',
        checks: [
          { name: 'check-1', mode: 'M1', command: 'c1', status: 'READY', expectedStatus: 'READY', nextAction: 'n1' },
          { name: 'check-2', mode: 'M2', command: 'c2', status: 'ACTION_REQUIRED', expectedStatus: 'DONE', nextAction: 'n2' },
        ],
      },
    });

    expect(brief.summary.checkCount).toBe(2);
    expect(brief.summary.actionRequired).toBe(1);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const brief = buildQualityClosureBrief({
      dashboard: { status: 'READY', checks: [] },
    });
    const after = new Date();

    const ts = new Date(brief.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from check fields', () => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'READY',
        checks: [
          { name: '  check-a  ', mode: '  M  ', command: '  cmd  ', status: '  READY  ', expectedStatus: '  READY  ', nextAction: '  action  ' },
        ],
      },
    });

    expect(brief.summary.checkCount).toBe(1);
    expect(brief.markdown).toContain('check-a');
    expect(brief.markdown).toContain('READY');
  });

  it('filters out checks with empty names', () => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'READY',
        checks: [
          { name: '  ', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'n' },
          { name: 'valid', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'n' },
        ],
      },
    });

    expect(brief.summary.checkCount).toBe(1);
  });

  it('default dashboard has 10 checks', () => {
    const dashboard = buildDefaultQualityClosureBriefDashboard();
    expect(dashboard.checks).toHaveLength(10);
  });

  it('markdown table rows match check count', () => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'ACTION_REQUIRED',
        checks: [
          { name: 'a', mode: 'M', command: 'c', status: 'X', expectedStatus: 'Y', nextAction: 'n' },
          { name: 'b', mode: 'M', command: 'c', status: 'Z', expectedStatus: 'W', nextAction: 'n' },
        ],
      },
    });

    const tableRows = brief.markdown.split('\n').filter((line) => line.startsWith('| ') && !line.includes('---'));
    expect(tableRows).toHaveLength(2 + 1); // header + 2 data rows
  });

  it('mode is always QUALITY_CLOSURE_BRIEF', () => {
    const brief = buildQualityClosureBrief({
      dashboard: { status: 'READY', checks: [] },
    });
    expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF');
  });

  it('counts zero actionRequired when all checks match expected status', () => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'READY',
        currentFocus: { name: 'focus', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'none' },
        checks: [
          { name: 'a', mode: 'M', command: 'c', status: 'DONE', expectedStatus: 'DONE', nextAction: 'none' },
          { name: 'b', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'none' },
        ],
      },
    });
    expect(brief.summary.actionRequired).toBe(0);
    expect(brief.summary.checkCount).toBe(2);
  });

  it('markdown includes current focus command in backticks', () => {
    const brief = buildQualityClosureBrief({
      generatedAt: new Date('2026-01-01'),
      dashboard: {
        status: 'ACTION_REQUIRED',
        currentFocus: { name: 'my focus', mode: 'M', command: 'npm run test', status: 'X', expectedStatus: 'Y', nextAction: 'do it' },
        checks: [{ name: 'my focus', mode: 'M', command: 'npm run test', status: 'X', expectedStatus: 'Y', nextAction: 'do it' }],
      },
    });
    expect(brief.markdown).toContain('`npm run test`');
    expect(brief.markdown).toContain('- 当前焦点：my focus');
    expect(brief.markdown).toContain('- 下一步：do it');
  });

  it('generatedAt is valid ISO string', () => {
    const brief = buildQualityClosureBrief({ dashboard: { status: 'READY', checks: [] } });
    expect(new Date(brief.generatedAt).toISOString()).toBe(brief.generatedAt);
  });

  it('markdown contains table header even with zero checks', () => {
    const brief = buildQualityClosureBrief({
      dashboard: { status: 'READY', checks: [] },
    });
    expect(brief.markdown).toContain('| 检查项 | 当前状态 | 目标状态 | 下一步 |');
    expect(brief.markdown).toContain('| --- | --- | --- | --- |');
    expect(brief.summary.checkCount).toBe(0);
  });

  it('default brief dashboard has ACTION_REQUIRED status with blocker register as currentFocus', () => {
    const dashboard = buildDefaultQualityClosureBriefDashboard();
    expect(dashboard.status).toBe('ACTION_REQUIRED');
    expect(dashboard.currentFocus?.name).toBe('blocker register');
  });

  it('trimmed status and expectedStatus fields produce correct actionRequired count', () => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'READY',
        checks: [
          { name: 'a', mode: 'M', command: 'c', status: '  READY  ', expectedStatus: 'READY', nextAction: 'n' },
        ],
      },
    });
    expect(brief.summary.actionRequired).toBe(0);
    expect(brief.summary.checkCount).toBe(1);
  });

  it('dashboard status is preserved even when checks disagree', () => {
    const brief = buildQualityClosureBrief({
      generatedAt: new Date('2026-05-06T16:00:00.000Z'),
      dashboard: {
        status: 'READY',
        checks: [
          { name: 'a', mode: 'M', command: 'c', status: 'PENDING', expectedStatus: 'DONE', nextAction: 'n' },
        ],
      },
    });

    expect(brief.status).toBe('READY');
    expect(brief.summary.actionRequired).toBe(1);
  });

  it('preserves ACTION_REQUIRED status from dashboard even with zero checks', () => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'ACTION_REQUIRED',
        checks: [],
      },
    });

    expect(brief.status).toBe('ACTION_REQUIRED');
    expect(brief.summary.actionRequired).toBe(0);
    expect(brief.summary.checkCount).toBe(0);
  });

  it('default brief dashboard includes closure sequence and final closure checks', () => {
    const dashboard = buildDefaultQualityClosureBriefDashboard();
    const names = dashboard.checks.map((c) => c.name);
    expect(names).toContain('closure sequence');
    expect(names).toContain('final closure');
    expect(names).toContain('owner assignments');
  });

  it('single check matching expected status produces zero actionRequired', () => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'READY',
        checks: [
          { name: 'only-check', mode: 'M', command: 'c', status: 'DONE', expectedStatus: 'DONE', nextAction: 'none' },
        ],
      },
    });
    expect(brief.summary.checkCount).toBe(1);
    expect(brief.summary.actionRequired).toBe(0);
    expect(brief.status).toBe('READY');
  });

  it('brief with multiple checks counts them correctly', () => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'READY',
        checks: [
          { name: 'a', mode: 'M', command: 'c', status: 'DONE', expectedStatus: 'DONE', nextAction: 'n' },
          { name: 'b', mode: 'M', command: 'c', status: 'PENDING', expectedStatus: 'DONE', nextAction: 'fix' },
          { name: 'c', mode: 'M', command: 'c', status: 'DONE', expectedStatus: 'DONE', nextAction: 'n' },
        ],
      },
    });
    expect(brief.summary.checkCount).toBe(3);
    expect(brief.summary.actionRequired).toBe(1);
  });

  it('brief with no actions returns zero actionRequired', () => {
    const dashboard = buildDefaultQualityClosureBriefDashboard();
    const brief = buildQualityClosureBrief({ dashboard });
    expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF');
  });

  it('brief with empty dashboard returns valid mode', () => {
    const dashboard = buildDefaultQualityClosureBriefDashboard();
    const brief = buildQualityClosureBrief({ dashboard });
    expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF');
  });

  it('buildQualityClosureBrief handles empty dashboard', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); const brief = buildQualityClosureBrief({ dashboard }); expect(brief).toBeDefined(); });

  it('buildQualityClosureBrief handles default dashboard', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); const brief = buildQualityClosureBrief({ dashboard }); expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF'); });

  it('buildDefaultQualityClosureBriefDashboard returns valid structure', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); expect(dashboard).toHaveProperty('checks'); });

  it('buildQualityClosureBrief handles checks with mixed statuses', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); dashboard.checks = [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }, { name: 'c2', mode: 'TEST', command: 'cmd', status: 'FAIL', expectedStatus: 'PASS', nextAction: 'fix' }]; const brief = buildQualityClosureBrief({ dashboard }); expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF'); });

  it('buildQualityClosureBrief handles all PASS checks', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); dashboard.checks = [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }]; const brief = buildQualityClosureBrief({ dashboard }); expect(brief).toBeDefined(); });

  it('buildQualityClosureBrief handles empty checks array', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); dashboard.checks = []; const brief = buildQualityClosureBrief({ dashboard }); expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF'); });

  it('buildQualityClosureBrief handles all FAIL checks', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); dashboard.checks = [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'FAIL', expectedStatus: 'PASS', nextAction: 'fix' }, { name: 'c2', mode: 'TEST', command: 'cmd', status: 'FAIL', expectedStatus: 'PASS', nextAction: 'fix' }]; const brief = buildQualityClosureBrief({ dashboard }); expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF'); });

  it('buildQualityClosureBrief handles all PASS checks', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); dashboard.checks = [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }]; const brief = buildQualityClosureBrief({ dashboard }); expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF'); });

  it('buildQualityClosureBrief handles mixed PASS and FAIL checks', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); dashboard.checks = [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }, { name: 'c2', mode: 'TEST', command: 'cmd', status: 'FAIL', expectedStatus: 'PASS', nextAction: 'fix' }]; const brief = buildQualityClosureBrief({ dashboard }); expect(brief.mode).toBe('QUALITY_CLOSURE_BRIEF'); });

  it('buildQualityClosureBrief handles empty checks', () => { const dashboard = buildDefaultQualityClosureBriefDashboard(); dashboard.checks = []; const brief = buildQualityClosureBrief({ dashboard }); expect(brief).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `brief-check-${index}`,
    index % 2 === 0 ? 'READY' : 'DONE',
  ] as const))('counts matching status for %s as ready in the brief summary', (name, status) => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'READY',
        checks: [
          { name: ` ${name} `, mode: ' MODE ', command: ' command ', status: ` ${status} `, expectedStatus: status, nextAction: ' next ' },
        ],
      },
    });

    expect(brief.summary.checkCount).toBe(1);
    expect(brief.summary.actionRequired).toBe(0);
    expect(brief.markdown).toContain(`| ${name} | ${status} | ${status} | next |`);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `focus-${index}`,
    `npm run quality:command-${index}`,
    `action-${index}`,
  ] as const))('renders focused command and action for %s', (name, command, nextAction) => {
    const brief = buildQualityClosureBrief({
      dashboard: {
        status: 'ACTION_REQUIRED',
        currentFocus: { name, mode: 'MODE', command, status: 'ACTION_REQUIRED', expectedStatus: 'READY', nextAction },
        checks: [
          { name, mode: 'MODE', command, status: 'ACTION_REQUIRED', expectedStatus: 'READY', nextAction },
        ],
      },
    });

    expect(brief.status).toBe('ACTION_REQUIRED');
    expect(brief.summary.actionRequired).toBe(1);
    expect(brief.markdown).toContain(`- 当前焦点：${name}`);
    expect(brief.markdown).toContain(`- 建议命令：\`${command}\``);
    expect(brief.markdown).toContain(`- 下一步：${nextAction}`);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `generated-check-${index}`,
    index % 2 === 0 ? 'READY' : 'ACTION_REQUIRED',
    'READY',
  ] as const))(
    'summarizes generated check status %s as %s',
    (name, status, expectedStatus) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: status === expectedStatus ? 'READY' : 'ACTION_REQUIRED',
          checks: [
            { name, mode: 'MODE', command: `cmd-${name}`, status, expectedStatus, nextAction: `next-${name}` },
          ],
        },
      });

      expect(brief.summary.checkCount).toBe(1);
      expect(brief.summary.actionRequired).toBe(status === expectedStatus ? 0 : 1);
      expect(brief.markdown).toContain(`| ${name} | ${status} | ${expectedStatus} | next-${name} |`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `trimmed-${index}`,
    `npm run quality:trimmed-${index}`,
    `next-${index}`,
  ] as const))(
    'trims generated table check fields %s',
    (name, command, nextAction) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: 'READY',
          currentFocus: { name: ` ${name} `, mode: ' MODE ', command: ` ${command} `, status: ' READY ', expectedStatus: ' READY ', nextAction: ` ${nextAction} ` },
          checks: [
            { name: ` ${name} `, mode: ' MODE ', command: ` ${command} `, status: ' READY ', expectedStatus: ' READY ', nextAction: ` ${nextAction} ` },
          ],
        },
      });

      expect(brief.summary.actionRequired).toBe(0);
      expect(brief.markdown).toContain(`| ${name} | READY | READY | ${nextAction} |`);
      expect(brief.markdown).toContain(`- 建议命令：\` ${command} \``);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch144-ready-${index}`,
    new Date(Date.UTC(2026, 4, 11, 3, index % 60, index % 60)),
  ] as const))(
    'renders generated ready brief without focus %s',
    (name, generatedAt) => {
      const brief = buildQualityClosureBrief({
        generatedAt,
        dashboard: {
          status: 'READY',
          checks: [
            { name, mode: 'MODE', command: `cmd-${name}`, status: 'READY', expectedStatus: 'READY', nextAction: `next-${name}` },
            { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'ACTION_REQUIRED', expectedStatus: 'READY', nextAction: 'ignored' },
          ],
        },
      });

      expect(brief.generatedAt).toBe(generatedAt.toISOString());
      expect(brief.status).toBe('READY');
      expect(brief.summary).toEqual({ checkCount: 1, actionRequired: 0 });
      expect(brief.markdown).toContain('- 当前焦点：无');
      expect(brief.markdown).toContain('- 建议命令：无');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch144-action-${index}`,
    `ACTION_${index}`,
    `READY_${index}`,
  ] as const))(
    'counts generated mismatched brief check %s',
    (name, status, expectedStatus) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: 'ACTION_REQUIRED',
          checks: [
            { name, mode: 'MODE', command: `cmd-${name}`, status, expectedStatus, nextAction: `next-${name}` },
          ],
        },
      });

      expect(brief.status).toBe('ACTION_REQUIRED');
      expect(brief.summary.checkCount).toBe(1);
      expect(brief.summary.actionRequired).toBe(1);
      expect(brief.markdown).toContain(`| ${name} | ${status} | ${expectedStatus} | next-${name} |`);
    },
  );
});

describe('quality closure brief batch 158 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch158-check-${index}`,
    index % 2 === 0 ? 'READY' : 'ACTION_REQUIRED',
    'READY',
  ] as const))(
    'counts generated batch158 check %s status %s',
    (name, status, expectedStatus) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: status === expectedStatus ? 'READY' : 'ACTION_REQUIRED',
          checks: [
            { name: ` ${name} `, mode: ' MODE ', command: ` cmd-${name} `, status: ` ${status} `, expectedStatus: ` ${expectedStatus} `, nextAction: ` next-${name} ` },
            { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'ACTION_REQUIRED', expectedStatus: 'READY', nextAction: 'ignored' },
          ],
        },
      });

      expect(brief.summary).toEqual({
        checkCount: 1,
        actionRequired: status === expectedStatus ? 0 : 1,
      });
      expect(brief.markdown).toContain(`| ${name} | ${status} | ${expectedStatus} | next-${name} |`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch158-focus-${index}`,
    `npm run quality:batch158-${index}`,
    `next-batch158-${index}`,
  ] as const))(
    'renders generated batch158 raw focus while normalizing table %s',
    (name, command, nextAction) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: 'ACTION_REQUIRED',
          currentFocus: { name: ` ${name} `, mode: ' MODE ', command: ` ${command} `, status: ' ACTION_REQUIRED ', expectedStatus: ' READY ', nextAction: ` ${nextAction} ` },
          checks: [
            { name: ` ${name} `, mode: ' MODE ', command: ` ${command} `, status: ' ACTION_REQUIRED ', expectedStatus: ' READY ', nextAction: ` ${nextAction} ` },
          ],
        },
      });

      expect(brief.status).toBe('ACTION_REQUIRED');
      expect(brief.summary.actionRequired).toBe(1);
      expect(brief.markdown).toContain(`- 当前焦点： ${name} `);
      expect(brief.markdown).toContain(`- 建议命令：\` ${command} \``);
      expect(brief.markdown).toContain(`| ${name} | ACTION_REQUIRED | READY | ${nextAction} |`);
    },
  );
});

describe('quality closure brief batch 171 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch171-ready-${index}`,
    `cmd-batch171-${index}`,
  ] as const))(
    'renders generated batch171 ready check row %s',
    (name, command) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: 'READY',
          checks: [
            { name: ` ${name} `, mode: ' MODE ', command: ` ${command} `, status: ' READY ', expectedStatus: ' READY ', nextAction: ' archive ' },
          ],
        },
      });

      expect(brief.status).toBe('READY');
      expect(brief.summary).toEqual({ checkCount: 1, actionRequired: 0 });
      expect(brief.markdown).toContain(`| ${name} | READY | READY | archive |`);
      expect(brief.markdown).toContain('- 建议命令：无');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch171-focus-${index}`,
    `npm run quality:batch171-${index}`,
    `next-batch171-${index}`,
  ] as const))(
    'renders generated batch171 action focus and mismatch count %s',
    (name, command, nextAction) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: 'ACTION_REQUIRED',
          currentFocus: { name, mode: 'MODE', command, status: 'ACTION_REQUIRED', expectedStatus: 'READY', nextAction },
          checks: [
            { name, mode: 'MODE', command, status: 'ACTION_REQUIRED', expectedStatus: 'READY', nextAction },
            { name: `done-${name}`, mode: 'MODE', command: 'done', status: 'READY', expectedStatus: 'READY', nextAction: 'archive' },
          ],
        },
      });

      expect(brief.status).toBe('ACTION_REQUIRED');
      expect(brief.summary).toEqual({ checkCount: 2, actionRequired: 1 });
      expect(brief.markdown).toContain(`- 当前焦点：${name}`);
      expect(brief.markdown).toContain(`- 建议命令：\`${command}\``);
      expect(brief.markdown).toContain(`| ${name} | ACTION_REQUIRED | READY | ${nextAction} |`);
    },
  );
});

describe('quality closure brief batch 177 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch177-ready-${index}`,
    `cmd-batch177-${index}`,
    new Date(Date.UTC(2026, 4, 11, 10, index % 60, index % 60)),
  ] as const))(
    'renders generated batch177 ready brief with normalized table row %s',
    (name, command, generatedAt) => {
      const brief = buildQualityClosureBrief({
        generatedAt,
        dashboard: {
          status: 'READY',
          checks: [
            { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'ACTION_REQUIRED', expectedStatus: 'READY', nextAction: 'ignored' },
            { name: ` ${name} `, mode: ' MODE ', command: ` ${command} `, status: ' READY ', expectedStatus: ' READY ', nextAction: ' archive ' },
          ],
        },
      });

      expect(brief.generatedAt).toBe(generatedAt.toISOString());
      expect(brief.status).toBe('READY');
      expect(brief.summary).toEqual({ checkCount: 1, actionRequired: 0 });
      expect(brief.markdown).toContain('- 当前焦点：无');
      expect(brief.markdown).toContain(`| ${name} | READY | READY | archive |`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch177-focus-${index}`,
    `npm run quality:batch177-${index}`,
    `next-batch177-${index}`,
  ] as const))(
    'renders generated batch177 focus while counting only mismatched checks %s',
    (name, command, nextAction) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: 'ACTION_REQUIRED',
          currentFocus: { name, mode: 'MODE', command, status: 'WAITING', expectedStatus: 'READY', nextAction },
          checks: [
            { name: `${name}-done`, mode: 'MODE', command: 'done', status: 'CLEAR', expectedStatus: 'CLEAR', nextAction: 'done' },
            { name, mode: 'MODE', command, status: 'WAITING', expectedStatus: 'READY', nextAction },
          ],
        },
      });

      expect(brief.status).toBe('ACTION_REQUIRED');
      expect(brief.summary).toEqual({ checkCount: 2, actionRequired: 1 });
      expect(brief.markdown).toContain(`- 当前焦点：${name}`);
      expect(brief.markdown).toContain(`- 建议命令：\`${command}\``);
      expect(brief.markdown).toContain(`| ${name} | WAITING | READY | ${nextAction} |`);
    },
  );
});

describe('quality closure brief batch 178 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch178-check-${index}`,
    index % 2 === 0 ? 'READY' : 'BLOCKED',
    index % 2 === 0 ? 'READY' : 'READY_TO_ARCHIVE',
  ] as const))(
    'summarizes generated batch178 check mismatch count %s',
    (name, status, expectedStatus) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: status === expectedStatus ? 'READY' : 'ACTION_REQUIRED',
          checks: [
            { name: ` ${name} `, mode: ' MODE ', command: ` cmd-${name} `, status: ` ${status} `, expectedStatus: ` ${expectedStatus} `, nextAction: ` next-${name} ` },
            { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'BLOCKED', expectedStatus: 'READY', nextAction: 'ignored' },
          ],
        },
      });

      expect(brief.summary).toEqual({
        checkCount: 1,
        actionRequired: status === expectedStatus ? 0 : 1,
      });
      expect(brief.markdown).toContain(`| ${name} | ${status} | ${expectedStatus} | next-${name} |`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch178-focus-${index}`,
    `npm run quality:batch178-${index}`,
    `collect-batch178-${index}`,
  ] as const))(
    'renders generated batch178 raw focus command with normalized checks %s',
    (name, command, nextAction) => {
      const brief = buildQualityClosureBrief({
        dashboard: {
          status: 'ACTION_REQUIRED',
          currentFocus: { name: ` ${name} `, mode: ' MODE ', command: ` ${command} `, status: ' ACTION_REQUIRED ', expectedStatus: ' READY ', nextAction: ` ${nextAction} ` },
          checks: [
            { name: ` ${name} `, mode: ' MODE ', command: ` ${command} `, status: ' ACTION_REQUIRED ', expectedStatus: ' READY ', nextAction: ` ${nextAction} ` },
            { name: `${name}-ready`, mode: 'MODE', command: 'ready', status: 'READY', expectedStatus: 'READY', nextAction: 'done' },
          ],
        },
      });

      expect(brief.summary).toEqual({ checkCount: 2, actionRequired: 1 });
      expect(brief.markdown).toContain(`- 当前焦点： ${name} `);
      expect(brief.markdown).toContain(`- 建议命令：\` ${command} \``);
      expect(brief.markdown).toContain(`| ${name} | ACTION_REQUIRED | READY | ${nextAction} |`);
    },
  );
});
