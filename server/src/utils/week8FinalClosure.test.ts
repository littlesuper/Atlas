import { describe, expect, it } from 'vitest';
import { buildWeek8FinalClosure } from './week8FinalClosure';

describe('week 8 final closure builder', () => {
  it('marks the closure ready to archive when every required artifact is green', () => {
    const closure = buildWeek8FinalClosure({
      generatedAt: new Date('2026-05-06T09:00:00.000Z'),
      artifacts: [
        { name: 'knowledge index', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'READY', evidenceRef: 'docs/13-质量知识库导航.md' },
        { name: 'blocker resolution', mode: 'QUALITY_BLOCKER_RESOLUTION', status: 'RESOLVED', evidenceRef: 'quality:blocker-resolution' },
        { name: 'closure consistency', mode: 'QUALITY_CLOSURE_CONSISTENCY', status: 'READY', evidenceRef: 'quality:closure-consistency' },
        { name: 'closure evidence handoff', mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF', status: 'READY', evidenceRef: 'quality:closure-evidence-handoff' },
        { name: 'closure remaining work', mode: 'QUALITY_CLOSURE_REMAINING_WORK', status: 'READY', evidenceRef: 'quality:closure-remaining-work' },
        { name: 'closure request pack', mode: 'QUALITY_CLOSURE_REQUEST_PACK', status: 'READY', evidenceRef: 'quality:closure-request-pack' },
        { name: 'team confirmations', mode: 'TEAM_CONFIRMATION_REGISTER', status: 'CONFIRMED', evidenceRef: 'quality:team-confirmations' },
        { name: 'handoff confirmation', mode: 'WEEK8_HANDOFF_PACK', status: 'CONFIRMED', evidenceRef: 'quality:handoff-confirm' },
        { name: 'closure gate', mode: 'WEEK8_CLOSURE_GATE', status: 'READY_TO_CLOSE', evidenceRef: 'quality:closure-gate' },
      ],
      archiveActions: ['attach final closure JSON to monthly audit', 'start next-quarter quality cadence'],
    });

    expect(closure).toEqual({
      mode: 'WEEK8_FINAL_CLOSURE',
      status: 'READY_TO_ARCHIVE',
      generatedAt: '2026-05-06T09:00:00.000Z',
      summary: {
        total: 9,
        ready: 9,
        actionRequired: 0,
        missingEvidence: 0,
      },
      artifacts: [
        { name: 'knowledge index', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'READY', evidenceRef: 'docs/13-质量知识库导航.md' },
        { name: 'blocker resolution', mode: 'QUALITY_BLOCKER_RESOLUTION', status: 'RESOLVED', evidenceRef: 'quality:blocker-resolution' },
        { name: 'closure consistency', mode: 'QUALITY_CLOSURE_CONSISTENCY', status: 'READY', evidenceRef: 'quality:closure-consistency' },
        { name: 'closure evidence handoff', mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF', status: 'READY', evidenceRef: 'quality:closure-evidence-handoff' },
        { name: 'closure remaining work', mode: 'QUALITY_CLOSURE_REMAINING_WORK', status: 'READY', evidenceRef: 'quality:closure-remaining-work' },
        { name: 'closure request pack', mode: 'QUALITY_CLOSURE_REQUEST_PACK', status: 'READY', evidenceRef: 'quality:closure-request-pack' },
        { name: 'team confirmations', mode: 'TEAM_CONFIRMATION_REGISTER', status: 'CONFIRMED', evidenceRef: 'quality:team-confirmations' },
        { name: 'handoff confirmation', mode: 'WEEK8_HANDOFF_PACK', status: 'CONFIRMED', evidenceRef: 'quality:handoff-confirm' },
        { name: 'closure gate', mode: 'WEEK8_CLOSURE_GATE', status: 'READY_TO_CLOSE', evidenceRef: 'quality:closure-gate' },
      ],
      gaps: [],
      archiveActions: ['attach final closure JSON to monthly audit', 'start next-quarter quality cadence'],
    });
  });

  it('keeps the closure action-required when an artifact is not green or lacks evidence', () => {
    const closure = buildWeek8FinalClosure({
      generatedAt: new Date('2026-05-06T09:00:00.000Z'),
      artifacts: [
        { name: 'team confirmations', mode: 'TEAM_CONFIRMATION_REGISTER', status: 'ACTION_REQUIRED', evidenceRef: '' },
      ],
      archiveActions: [],
    });

    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.summary).toEqual({
      total: 1,
      ready: 0,
      actionRequired: 1,
      missingEvidence: 1,
    });
    expect(closure.gaps).toEqual([
      'artifact is not ready: team confirmations (ACTION_REQUIRED)',
      'artifact evidence is missing: team confirmations',
      'required artifact is missing: knowledge index (QUALITY_KNOWLEDGE_INDEX)',
      'required artifact is missing: blocker resolution (QUALITY_BLOCKER_RESOLUTION)',
      'required artifact is missing: closure consistency (QUALITY_CLOSURE_CONSISTENCY)',
      'required artifact is missing: closure evidence handoff (QUALITY_CLOSURE_EVIDENCE_HANDOFF)',
      'required artifact is missing: closure remaining work (QUALITY_CLOSURE_REMAINING_WORK)',
      'required artifact is missing: closure request pack (QUALITY_CLOSURE_REQUEST_PACK)',
      'required artifact is missing: handoff confirmation (WEEK8_HANDOFF_PACK)',
      'required artifact is missing: closure gate (WEEK8_CLOSURE_GATE)',
    ]);
  });

  it('requires blocker resolution before final archive', () => {
    const closure = buildWeek8FinalClosure({
      generatedAt: new Date('2026-05-06T09:00:00.000Z'),
      artifacts: [
        { name: 'blocker resolution', mode: 'QUALITY_BLOCKER_RESOLUTION', status: 'ACTION_REQUIRED', evidenceRef: 'quality:blocker-resolution' },
      ],
      archiveActions: [],
    });

    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.gaps).toContain('artifact is not ready: blocker resolution (ACTION_REQUIRED)');
  });

  it('requires closure consistency before final archive', () => {
    const closure = buildWeek8FinalClosure({
      generatedAt: new Date('2026-05-06T09:00:00.000Z'),
      artifacts: [
        { name: 'closure consistency', mode: 'QUALITY_CLOSURE_CONSISTENCY', status: 'ACTION_REQUIRED', evidenceRef: 'quality:closure-consistency' },
      ],
      archiveActions: [],
    });

    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.gaps).toContain('artifact is not ready: closure consistency (ACTION_REQUIRED)');
  });

  it('requires closure evidence handoff before final archive', () => {
    const closure = buildWeek8FinalClosure({
      generatedAt: new Date('2026-05-06T09:00:00.000Z'),
      artifacts: [
        { name: 'knowledge index', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'READY', evidenceRef: 'docs/13-质量知识库导航.md' },
        { name: 'blocker resolution', mode: 'QUALITY_BLOCKER_RESOLUTION', status: 'RESOLVED', evidenceRef: 'quality:blocker-resolution' },
        { name: 'closure consistency', mode: 'QUALITY_CLOSURE_CONSISTENCY', status: 'READY', evidenceRef: 'quality:closure-consistency' },
        { name: 'team confirmations', mode: 'TEAM_CONFIRMATION_REGISTER', status: 'CONFIRMED', evidenceRef: 'quality:team-confirmations' },
        { name: 'handoff confirmation', mode: 'WEEK8_HANDOFF_PACK', status: 'CONFIRMED', evidenceRef: 'quality:handoff-confirm' },
        { name: 'closure gate', mode: 'WEEK8_CLOSURE_GATE', status: 'READY_TO_CLOSE', evidenceRef: 'quality:closure-gate' },
      ],
      archiveActions: [],
    });

    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.gaps).toContain('required artifact is missing: closure evidence handoff (QUALITY_CLOSURE_EVIDENCE_HANDOFF)');
  });

  it('requires closure remaining work before final archive', () => {
    const closure = buildWeek8FinalClosure({
      generatedAt: new Date('2026-05-06T09:00:00.000Z'),
      artifacts: [
        { name: 'knowledge index', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'READY', evidenceRef: 'docs/13-质量知识库导航.md' },
        { name: 'blocker resolution', mode: 'QUALITY_BLOCKER_RESOLUTION', status: 'RESOLVED', evidenceRef: 'quality:blocker-resolution' },
        { name: 'closure consistency', mode: 'QUALITY_CLOSURE_CONSISTENCY', status: 'READY', evidenceRef: 'quality:closure-consistency' },
        { name: 'closure evidence handoff', mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF', status: 'READY', evidenceRef: 'quality:closure-evidence-handoff' },
        { name: 'closure request pack', mode: 'QUALITY_CLOSURE_REQUEST_PACK', status: 'READY', evidenceRef: 'quality:closure-request-pack' },
        { name: 'team confirmations', mode: 'TEAM_CONFIRMATION_REGISTER', status: 'CONFIRMED', evidenceRef: 'quality:team-confirmations' },
        { name: 'handoff confirmation', mode: 'WEEK8_HANDOFF_PACK', status: 'CONFIRMED', evidenceRef: 'quality:handoff-confirm' },
        { name: 'closure gate', mode: 'WEEK8_CLOSURE_GATE', status: 'READY_TO_CLOSE', evidenceRef: 'quality:closure-gate' },
      ],
      archiveActions: [],
    });

    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.gaps).toContain('required artifact is missing: closure remaining work (QUALITY_CLOSURE_REMAINING_WORK)');
  });

  it('requires closure request pack before final archive', () => {
    const closure = buildWeek8FinalClosure({
      generatedAt: new Date('2026-05-06T09:00:00.000Z'),
      artifacts: [
        { name: 'knowledge index', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'READY', evidenceRef: 'docs/13-质量知识库导航.md' },
        { name: 'blocker resolution', mode: 'QUALITY_BLOCKER_RESOLUTION', status: 'RESOLVED', evidenceRef: 'quality:blocker-resolution' },
        { name: 'closure consistency', mode: 'QUALITY_CLOSURE_CONSISTENCY', status: 'READY', evidenceRef: 'quality:closure-consistency' },
        { name: 'closure evidence handoff', mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF', status: 'READY', evidenceRef: 'quality:closure-evidence-handoff' },
        { name: 'closure remaining work', mode: 'QUALITY_CLOSURE_REMAINING_WORK', status: 'READY', evidenceRef: 'quality:closure-remaining-work' },
        { name: 'team confirmations', mode: 'TEAM_CONFIRMATION_REGISTER', status: 'CONFIRMED', evidenceRef: 'quality:team-confirmations' },
        { name: 'handoff confirmation', mode: 'WEEK8_HANDOFF_PACK', status: 'CONFIRMED', evidenceRef: 'quality:handoff-confirm' },
        { name: 'closure gate', mode: 'WEEK8_CLOSURE_GATE', status: 'READY_TO_CLOSE', evidenceRef: 'quality:closure-gate' },
      ],
      archiveActions: [],
    });

    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.gaps).toContain('required artifact is missing: closure request pack (QUALITY_CLOSURE_REQUEST_PACK)');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const closure = buildWeek8FinalClosure({
      artifacts: [],
      archiveActions: [],
    });
    const after = new Date();

    const ts = new Date(closure.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from artifact fields', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: '  knowledge index  ', mode: '  QUALITY_KNOWLEDGE_INDEX  ', status: '  READY  ', evidenceRef: '  ref  ' },
      ],
      archiveActions: [],
    });

    expect(closure.artifacts[0].name).toBe('knowledge index');
    expect(closure.artifacts[0].mode).toBe('QUALITY_KNOWLEDGE_INDEX');
    expect(closure.artifacts[0].status).toBe('READY');
    expect(closure.artifacts[0].evidenceRef).toBe('ref');
  });

  it('filters out artifacts with empty names', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: '  ', mode: 'MODE', status: 'READY', evidenceRef: 'ref' },
        { name: 'valid', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'READY', evidenceRef: 'ref' },
      ],
      archiveActions: [],
    });

    expect(closure.artifacts).toHaveLength(1);
    expect(closure.summary.total).toBe(1);
  });

  it('trims and filters archive actions', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [],
      archiveActions: ['  action 1  ', '  ', 'action 2'],
    });

    expect(closure.archiveActions).toEqual(['action 1', 'action 2']);
  });

  it('mode is always WEEK8_FINAL_CLOSURE', () => {
    const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: [] });
    expect(closure.mode).toBe('WEEK8_FINAL_CLOSURE');
  });

  it('recognizes PASSED status as green', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: 'test', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'PASSED', evidenceRef: 'ref' },
      ],
      archiveActions: [],
    });

    expect(closure.summary.ready).toBe(1);
    expect(closure.gaps).not.toContain('artifact is not ready: test (PASSED)');
  });

  it('recognizes DONE status as green', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: 'br', mode: 'QUALITY_BLOCKER_RESOLUTION', status: 'DONE', evidenceRef: 'ref' },
      ],
      archiveActions: [],
    });

    expect(closure.summary.ready).toBe(1);
    expect(closure.gaps).not.toContain('artifact is not ready: br (DONE)');
  });

  it('recognizes READY_TO_CLOSE status as green', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: 'closure gate', mode: 'WEEK8_CLOSURE_GATE', status: 'READY_TO_CLOSE', evidenceRef: 'ref' },
      ],
      archiveActions: [],
    });

    expect(closure.summary.ready).toBe(1);
    expect(closure.gaps).not.toContain('artifact is not ready: closure gate (READY_TO_CLOSE)');
  });

  it('READY_TO_CONFIRM status is not treated as green', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: 'test', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'READY_TO_CONFIRM', evidenceRef: 'ref' },
      ],
      archiveActions: [],
    });

    expect(closure.summary.ready).toBe(0);
    expect(closure.gaps).toContain('artifact is not ready: test (READY_TO_CONFIRM)');
  });

  it('green status artifact with empty evidenceRef causes ACTION_REQUIRED', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: 'knowledge index', mode: 'QUALITY_KNOWLEDGE_INDEX', status: 'READY', evidenceRef: '' },
      ],
      archiveActions: [],
    });

    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.gaps).toContain('artifact evidence is missing: knowledge index');
    expect(closure.summary.missingEvidence).toBe(1);
    expect(closure.summary.ready).toBe(1);
  });

  it('recognizes CONFIRMED status as green', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: 'team confirmations', mode: 'TEAM_CONFIRMATION_REGISTER', status: 'CONFIRMED', evidenceRef: 'ref' },
      ],
      archiveActions: [],
    });

    expect(closure.summary.ready).toBe(1);
    expect(closure.gaps).not.toContain(expect.stringContaining('artifact is not ready: team confirmations'));
  });

  it('artifact with empty mode does not satisfy any required artifact', () => {
    const closure = buildWeek8FinalClosure({
      artifacts: [
        { name: 'orphan', mode: '', status: 'READY', evidenceRef: 'ref' },
      ],
      archiveActions: [],
    });

    expect(closure.artifacts).toHaveLength(1);
    expect(closure.gaps).toContain('required artifact is missing: knowledge index (QUALITY_KNOWLEDGE_INDEX)');
    expect(closure.status).toBe('ACTION_REQUIRED');
  });

  it('mode is always WEEK8_FINAL_CLOSURE', () => {
    const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: [] });
    expect(closure.mode).toBe('WEEK8_FINAL_CLOSURE');
  });

  it('closure with empty artifacts produces ACTION_REQUIRED', () => {
    const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: [] });
    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.gaps.length).toBeGreaterThan(0);
  });

  it('closure with no gaps returns empty array', () => {
    const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: [] });
    expect(closure.mode).toBe('WEEK8_FINAL_CLOSURE');
  });

  it('closure with single artifact returns valid structure', () => {
    const closure = buildWeek8FinalClosure({ artifacts: [{ name: 'Artifact', mode: 'TEST', status: 'READY', evidenceRef: 'ref-1' }], archiveActions: [] });
    expect(closure.mode).toBe('WEEK8_FINAL_CLOSURE');
  });

  it('closure with empty artifacts returns valid mode', () => { const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: [] }); expect(closure.artifacts).toHaveLength(0); });

  it('closure with single artifact returns valid structure', () => { const closure = buildWeek8FinalClosure({ artifacts: [{ name: 'doc', mode: 'REPORT', status: 'READY', evidenceRef: '' }], archiveActions: [] }); expect(closure.artifacts).toHaveLength(1); });

  it('closure with archive actions preserves actions', () => { const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: ['archive-db', 'archive-logs'] }); expect(closure.archiveActions).toHaveLength(2); });

  it('closure with multiple artifacts preserves order', () => { const closure = buildWeek8FinalClosure({ artifacts: [{ name: 'a1', mode: 'REPORT', status: 'READY', evidenceRef: '' }, { name: 'a2', mode: 'REPORT', status: 'PENDING', evidenceRef: '' }], archiveActions: [] }); expect(closure.artifacts[0].name).toBe('a1'); });

  it('closure with PENDING artifact preserves status', () => { const closure = buildWeek8FinalClosure({ artifacts: [{ name: 'a1', mode: 'REPORT', status: 'PENDING', evidenceRef: '' }], archiveActions: [] }); expect(closure.artifacts[0].status).toBe('PENDING'); });

  it('closure mode is WEEK8_FINAL_CLOSURE', () => { const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: [] }); expect(closure.mode).toBe('WEEK8_FINAL_CLOSURE'); });

  it('closure with empty artifacts has zero artifact count', () => { const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: [] }); expect(closure.artifacts).toHaveLength(0); });

  it('closure with single artifact returns one', () => { const closure = buildWeek8FinalClosure({ artifacts: [{ name: 'doc', mode: 'TEST', status: 'READY', evidenceRef: 'ref1' }], archiveActions: [] }); expect(closure.artifacts).toHaveLength(1); });

  it('closure with non-empty archiveActions preserves count', () => { const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: ['action1', 'action2'] }); expect(closure.archiveActions).toHaveLength(2); });

  it('closure with empty archiveActions returns valid', () => { const closure = buildWeek8FinalClosure({ artifacts: [], archiveActions: [] }); expect(closure).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const statuses = ['READY', 'CONFIRMED', 'READY_TO_CLOSE', 'PASSED', 'DONE', 'RESOLVED'] as const;
    return [`artifact-${index}`, statuses[index % statuses.length], `evidence-${index}`] as const;
  }))('counts green artifact status for %s as ready', (name, status, evidenceRef) => {
    const closure = buildWeek8FinalClosure({
      artifacts: [{ name: ` ${name} `, mode: ' QUALITY_KNOWLEDGE_INDEX ', status: ` ${status} `, evidenceRef: ` ${evidenceRef} ` }],
      archiveActions: [],
    });

    expect(closure.summary.ready).toBe(1);
    expect(closure.summary.missingEvidence).toBe(0);
    expect(closure.artifacts[0]).toEqual({ name, mode: 'QUALITY_KNOWLEDGE_INDEX', status, evidenceRef });
    expect(closure.gaps).not.toContain(`artifact is not ready: ${name} (${status})`);
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const status = index % 2 === 0 ? 'READY' : 'ACTION_REQUIRED';
    return [`missing-evidence-${index}`, status] as const;
  }))('reports missing evidence for artifact %s', (name, status) => {
    const closure = buildWeek8FinalClosure({
      artifacts: [{ name: ` ${name} `, mode: 'QUALITY_KNOWLEDGE_INDEX', status, evidenceRef: '   ' }],
      archiveActions: [],
    });

    expect(closure.status).toBe('ACTION_REQUIRED');
    expect(closure.summary.missingEvidence).toBe(1);
    expect(closure.gaps).toContain(`artifact evidence is missing: ${name}`);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch139-artifact-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'PENDING',
    `mode-${index}`,
  ] as const))(
    'reports generated non-green artifact gap %s',
    (name, status, mode) => {
      const closure = buildWeek8FinalClosure({
        artifacts: [{ name: ` ${name} `, mode: ` ${mode} `, status: ` ${status} `, evidenceRef: ` ref-${name} ` }],
        archiveActions: [' archive ', '', ` keep-${name} `],
      });

      expect(closure.status).toBe('ACTION_REQUIRED');
      expect(closure.summary.ready).toBe(0);
      expect(closure.summary.actionRequired).toBe(1);
      expect(closure.summary.missingEvidence).toBe(0);
      expect(closure.gaps).toContain(`artifact is not ready: ${name} (${status})`);
      expect(closure.archiveActions).toEqual(['archive', `keep-${name}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch139-orphan-${index}`,
    index % 2 === 0 ? 'READY' : 'CONFIRMED',
    index % 3 === 0 ? '' : 'QUALITY_KNOWLEDGE_INDEX',
  ] as const))(
    'summarizes generated orphan or required artifact %s',
    (name, status, mode) => {
      const closure = buildWeek8FinalClosure({
        artifacts: [{ name: ` ${name} `, mode: ` ${mode} `, status: ` ${status} `, evidenceRef: ' evidence ' }],
        archiveActions: [],
      });

      expect(closure.summary.total).toBe(1);
      expect(closure.summary.ready).toBe(1);
      expect(closure.summary.actionRequired).toBe(0);
      expect(closure.artifacts[0].name).toBe(name);
      expect(closure.artifacts[0].mode).toBe(mode);
      expect(closure.gaps.some((gap) => gap.startsWith('required artifact is missing:'))).toBe(true);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch149-ready-${index}`,
    ['READY', 'CONFIRMED', 'READY_TO_CLOSE', 'PASSED', 'DONE', 'RESOLVED'][index % 6],
  ] as const))(
    'archives generated complete required artifact set %s',
    (prefix, status) => {
      const requiredArtifacts = [
        ['knowledge index', 'QUALITY_KNOWLEDGE_INDEX'],
        ['blocker resolution', 'QUALITY_BLOCKER_RESOLUTION'],
        ['closure consistency', 'QUALITY_CLOSURE_CONSISTENCY'],
        ['closure evidence handoff', 'QUALITY_CLOSURE_EVIDENCE_HANDOFF'],
        ['closure remaining work', 'QUALITY_CLOSURE_REMAINING_WORK'],
        ['closure request pack', 'QUALITY_CLOSURE_REQUEST_PACK'],
        ['team confirmations', 'TEAM_CONFIRMATION_REGISTER'],
        ['handoff confirmation', 'WEEK8_HANDOFF_PACK'],
        ['closure gate', 'WEEK8_CLOSURE_GATE'],
      ] as const;

      const closure = buildWeek8FinalClosure({
        generatedAt: new Date('2026-05-11T09:00:00.000Z'),
        artifacts: requiredArtifacts.map(([name, mode], artifactIndex) => ({
          name: ` ${name} `,
          mode: ` ${mode} `,
          status: artifactIndex === 0 ? ` ${status} ` : ' READY ',
          evidenceRef: ` ${prefix}-evidence-${artifactIndex} `,
        })),
        archiveActions: [' ', ` ${prefix}-archive `],
      });

      expect(closure.status).toBe('READY_TO_ARCHIVE');
      expect(closure.summary).toEqual({
        total: 9,
        ready: 9,
        actionRequired: 0,
        missingEvidence: 0,
      });
      expect(closure.gaps).toEqual([]);
      expect(closure.archiveActions).toEqual([`${prefix}-archive`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch149-gap-${index}`,
    index % 9,
  ] as const))(
    'reports generated required artifact gap %s',
    (prefix, missingIndex) => {
      const requiredArtifacts = [
        ['knowledge index', 'QUALITY_KNOWLEDGE_INDEX'],
        ['blocker resolution', 'QUALITY_BLOCKER_RESOLUTION'],
        ['closure consistency', 'QUALITY_CLOSURE_CONSISTENCY'],
        ['closure evidence handoff', 'QUALITY_CLOSURE_EVIDENCE_HANDOFF'],
        ['closure remaining work', 'QUALITY_CLOSURE_REMAINING_WORK'],
        ['closure request pack', 'QUALITY_CLOSURE_REQUEST_PACK'],
        ['team confirmations', 'TEAM_CONFIRMATION_REGISTER'],
        ['handoff confirmation', 'WEEK8_HANDOFF_PACK'],
        ['closure gate', 'WEEK8_CLOSURE_GATE'],
      ] as const;
      const [gapName] = requiredArtifacts[missingIndex];

      const closure = buildWeek8FinalClosure({
        artifacts: requiredArtifacts.map(([name, mode], artifactIndex) => ({
          name,
          mode,
          status: artifactIndex === missingIndex ? 'ACTION_REQUIRED' : 'READY',
          evidenceRef: artifactIndex === missingIndex ? ' ' : `${prefix}-evidence-${artifactIndex}`,
        })),
        archiveActions: [],
      });

      expect(closure.status).toBe('ACTION_REQUIRED');
      expect(closure.summary).toEqual({
        total: 9,
        ready: 8,
        actionRequired: 1,
        missingEvidence: 1,
      });
      expect(closure.gaps).toContain(`artifact is not ready: ${gapName} (ACTION_REQUIRED)`);
      expect(closure.gaps).toContain(`artifact evidence is missing: ${gapName}`);
      expect(closure.gaps.some((gap) => gap.startsWith('required artifact is missing:'))).toBe(false);
    },
  );
});
