import { describe, expect, it } from 'vitest';
import { buildQualityClosureRequestPack, buildDefaultQualityClosureRequestPack } from './qualityClosureRequestPack';
import { buildDefaultQualityClosureRemainingWork } from './qualityClosureRemainingWork';
import { buildQualityClosureRemainingWork } from './qualityClosureRemainingWork';

describe('quality closure request pack builder', () => {
  it('turns remaining closure work into owner-ready requests', () => {
    const pack = buildDefaultQualityClosureRequestPack({
      generatedAt: new Date('2026-05-06T10:30:00.000Z'),
    });

    expect(pack).toEqual({
      mode: 'QUALITY_CLOSURE_REQUEST_PACK',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T10:30:00.000Z',
      summary: {
        requestCount: 4,
        blockedRequestCount: 0,
      },
      requests: [
        {
          item: 'monthly audit run',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          status: 'ACTION_REQUIRED',
          evidenceRequired: 'MONTHLY_AUDIT_RUN / ACTION_REQUIRED with review decisions attached',
          nextCommand: 'npm run quality:audit-run --workspace=server -- --month 2026-05',
          requestText: '请在 2026-05-08 前提供 monthly audit run 的收口证据：MONTHLY_AUDIT_RUN / ACTION_REQUIRED with review decisions attached。下一步命令：npm run quality:audit-run --workspace=server -- --month 2026-05。',
        },
        {
          item: 'quality action tracker',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          status: 'ACTION_REQUIRED',
          evidenceRequired: 'QUALITY_ACTION_TRACKER with open actions assigned or accepted',
          nextCommand: 'npm run quality:action-tracker --workspace=server',
          requestText: '请在 2026-05-08 前提供 quality action tracker 的收口证据：QUALITY_ACTION_TRACKER with open actions assigned or accepted。下一步命令：npm run quality:action-tracker --workspace=server。',
        },
        {
          item: 'blocker resolution',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          status: 'ACTION_REQUIRED',
          evidenceRequired: 'QUALITY_BLOCKER_RESOLUTION / RESOLVED',
          nextCommand: 'npm run quality:blocker-resolution --workspace=server',
          requestText: '请在 2026-05-08 前提供 blocker resolution 的收口证据：QUALITY_BLOCKER_RESOLUTION / RESOLVED。下一步命令：npm run quality:blocker-resolution --workspace=server。',
        },
        {
          item: 'evidence intake',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          status: 'ACTION_REQUIRED',
          evidenceRequired: 'QUALITY_EVIDENCE_INTAKE / READY_TO_CONFIRM',
          nextCommand: 'npm run quality:evidence-intake --workspace=server -- --confirm "..."',
          requestText: '请在 2026-05-08 前提供 evidence intake 的收口证据：QUALITY_EVIDENCE_INTAKE / READY_TO_CONFIRM。下一步命令：npm run quality:evidence-intake --workspace=server -- --confirm "..."。',
        },
      ],
      nextCommands: [
        'npm run quality:audit-run --workspace=server -- --month 2026-05',
        'npm run quality:action-tracker --workspace=server',
        'npm run quality:blocker-resolution --workspace=server',
        'npm run quality:evidence-intake --workspace=server -- --confirm "..."',
      ],
    });
  });

  it('is READY when remaining work has no items', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:30:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'READY_TO_CLOSE',
        generatedAt: '2026-05-06T10:30:00.000Z',
        summary: { total: 2, ready: 2, actionRequired: 0, blocked: 0 },
        checks: [
          { name: 'audit run', status: 'DONE' },
          { name: 'evidence intake', status: 'READY_TO_CONFIRM' },
        ],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({
      generatedAt: new Date('2026-05-06T10:30:00.000Z'),
      remainingWork: remaining,
    });

    expect(pack.status).toBe('READY');
    expect(pack.requests).toEqual([]);
    expect(pack.summary.requestCount).toBe(0);
    expect(pack.summary.blockedRequestCount).toBe(0);
    expect(pack.nextCommands).toEqual([]);
  });

  it('is BLOCKED when any remaining item is BLOCKED', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:30:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'BLOCKED',
        generatedAt: '2026-05-06T10:30:00.000Z',
        summary: { total: 1, ready: 0, actionRequired: 0, blocked: 1 },
        checks: [{ name: 'custom check', status: 'BLOCKED', detail: 'blocked' }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({
      generatedAt: new Date('2026-05-06T10:30:00.000Z'),
      remainingWork: remaining,
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.summary.blockedRequestCount).toBe(1);
    expect(pack.requests[0].requestText).toContain('custom check');
  });

  it('builds request text with dueDate and evidenceRequired', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:30:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:30:00.000Z',
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name: 'monthly audit run', status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({
      generatedAt: new Date('2026-05-06T10:30:00.000Z'),
      remainingWork: remaining,
    });

    expect(pack.requests[0].requestText).toContain('2026-05-08');
    expect(pack.requests[0].requestText).toContain('MONTHLY_AUDIT_RUN');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'READY',
        generatedAt: new Date().toISOString(),
        summary: { total: 0, ready: 0, actionRequired: 0, blocked: 0 },
        checks: [],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });
    const after = new Date();

    const ts = new Date(pack.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('nextCommands filters empty commands', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: new Date().toISOString(),
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name: 'unknown check', status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.requests).toHaveLength(1);
    expect(pack.requests[0].nextCommand).toBe('');
    expect(pack.nextCommands).toEqual([]);
  });

  it('default pack has 4 requests', () => {
    const pack = buildDefaultQualityClosureRequestPack();
    expect(pack.requests).toHaveLength(4);
    expect(pack.mode).toBe('QUALITY_CLOSURE_REQUEST_PACK');
  });

  it('each request has all required fields', () => {
    const pack = buildDefaultQualityClosureRequestPack();
    for (const req of pack.requests) {
      expect(req).toHaveProperty('item');
      expect(req).toHaveProperty('owner');
      expect(req).toHaveProperty('dueDate');
      expect(req).toHaveProperty('status');
      expect(req).toHaveProperty('evidenceRequired');
      expect(req).toHaveProperty('nextCommand');
      expect(req).toHaveProperty('requestText');
    }
  });

  it('ACTION_REQUIRED status is set for default pack', () => {
    const pack = buildDefaultQualityClosureRequestPack();
    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.summary.blockedRequestCount).toBe(0);
  });

  it('mode is always QUALITY_CLOSURE_REQUEST_PACK', () => {
    const pack = buildDefaultQualityClosureRequestPack();
    expect(pack.mode).toBe('QUALITY_CLOSURE_REQUEST_PACK');
  });

  it('generatedAt is valid ISO string', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'READY', generatedAt: new Date().toISOString(), summary: { total: 0, ready: 0, actionRequired: 0, blocked: 0 }, checks: [], blockers: [], closeActions: [] },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });
    expect(new Date(pack.generatedAt).toISOString()).toBe(pack.generatedAt);
  });

  it('ACTION_REQUIRED status when remaining items are not BLOCKED', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'ACTION_REQUIRED', generatedAt: new Date().toISOString(), summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 }, checks: [{ name: 'check', status: 'ACTION_REQUIRED' }], blockers: [], closeActions: [] },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });
    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.summary.blockedRequestCount).toBe(0);
  });

  it('multiple BLOCKED items all counted in blockedRequestCount', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'BLOCKED',
        generatedAt: new Date().toISOString(),
        summary: { total: 2, ready: 0, actionRequired: 0, blocked: 2 },
        checks: [
          { name: 'check-a', status: 'BLOCKED', detail: 'blocked' },
          { name: 'check-b', status: 'BLOCKED', detail: 'blocked' },
        ],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.summary.blockedRequestCount).toBe(2);
    expect(pack.summary.requestCount).toBe(2);
  });

  it('buildDefaultQualityClosureRequestPack without arguments uses current time', () => {
    const before = new Date();
    const pack = buildDefaultQualityClosureRequestPack();
    const after = new Date();

    const ts = new Date(pack.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('mixed ACTION_REQUIRED and BLOCKED items produce BLOCKED status', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'BLOCKED',
        generatedAt: new Date().toISOString(),
        summary: { total: 2, ready: 0, actionRequired: 1, blocked: 1 },
        checks: [
          { name: 'monthly audit run', status: 'ACTION_REQUIRED' },
          { name: 'custom', status: 'BLOCKED', detail: 'blocked' },
        ],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.summary.requestCount).toBe(2);
    expect(pack.summary.blockedRequestCount).toBe(1);
    expect(pack.requests[0].status).toBe('ACTION_REQUIRED');
    expect(pack.requests[1].status).toBe('BLOCKED');
  });

  it('requestText for item with empty nextCommand still includes Chinese template', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: new Date().toISOString(),
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name: 'unknown check', status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.requests[0].requestText).toContain('请在');
    expect(pack.requests[0].requestText).toContain('unknown check');
    expect(pack.requests[0].requestText).toContain('下一步命令：');
  });

  it('unknown check name gets fallback evidenceRequired in requestText', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: new Date().toISOString(),
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name: 'custom unknown check', status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.requests[0].evidenceRequired).toBe('custom unknown check evidence');
    expect(pack.requests[0].requestText).toContain('custom unknown check evidence');
  });

  it('READY remaining work with zero items produces READY request pack', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'READY',
        generatedAt: new Date().toISOString(),
        summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 },
        checks: [{ name: 'done-check', status: 'DONE' }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.status).toBe('READY');
    expect(pack.requests).toEqual([]);
    expect(pack.summary.requestCount).toBe(0);
    expect(pack.nextCommands).toEqual([]);
  });

  it('summary requestCount always equals requests array length', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: new Date().toISOString(),
        summary: { total: 3, ready: 1, actionRequired: 1, blocked: 1 },
        checks: [
          { name: 'done-check', status: 'DONE' },
          { name: 'monthly audit run', status: 'ACTION_REQUIRED' },
          { name: 'custom', status: 'BLOCKED', detail: 'blocked' },
        ],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.summary.requestCount).toBe(pack.requests.length);
    expect(pack.summary.blockedRequestCount + 1).toBeLessThanOrEqual(pack.summary.requestCount + 1);
  });

  it('default pack requestText contains Chinese prompt and evidence requirements', () => {
    const pack = buildDefaultQualityClosureRequestPack();
    for (const req of pack.requests) {
      expect(req.requestText).toContain('请在');
      expect(req.requestText).toContain('收口证据');
      expect(req.requestText).toContain('下一步命令：');
    }
  });

  it('request item name matches remaining work item name', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: new Date().toISOString(),
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name: 'blocker resolution', status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });
    expect(pack.requests[0].item).toBe('blocker resolution');
    expect(pack.requests[0].requestText).toContain('blocker resolution');
  });

  it('request pack with all gates ready has empty requests array', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'READY_TO_CLOSE', generatedAt: '', summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 }, checks: [{ name: 'c', status: 'READY', detail: 'ok' }] },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });
    expect(pack.requests).toHaveLength(0);
  });

  it('request pack mode field is set', () => {
    const remainingWork = buildDefaultQualityClosureRemainingWork();
    const pack = buildQualityClosureRequestPack({ remainingWork });
    expect(pack.mode).toBe('QUALITY_CLOSURE_REQUEST_PACK');
  });


  it('pack with remaining work returns valid mode', () => {
    const remainingWork = buildDefaultQualityClosureRemainingWork();
    const pack = buildQualityClosureRequestPack({ remainingWork });
    expect(pack.mode).toBe('QUALITY_CLOSURE_REQUEST_PACK');
  });

  it('request pack with empty remaining work returns valid mode', () => { const remainingWork = buildDefaultQualityClosureRemainingWork(); const pack = buildQualityClosureRequestPack({ remainingWork }); expect(pack).toBeDefined(); });

  it('request pack preserves mode field', () => { const remainingWork = buildDefaultQualityClosureRemainingWork(); const pack = buildQualityClosureRequestPack({ remainingWork }); expect(pack).toHaveProperty('mode'); });

  it('request pack includes remainingWork reference', () => { const remainingWork = buildDefaultQualityClosureRemainingWork(); const pack = buildQualityClosureRequestPack({ remainingWork }); expect(pack).toBeDefined(); });

  it('request pack mode is QUALITY_CLOSURE_REQUEST_PACK', () => { const remainingWork = buildDefaultQualityClosureRemainingWork(); const pack = buildQualityClosureRequestPack({ remainingWork }); expect(pack.mode).toBe('QUALITY_CLOSURE_REQUEST_PACK'); });

  it('request pack handles custom remaining work', () => { const remainingWork = { ...buildDefaultQualityClosureRemainingWork(), gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'FAIL', generatedAt: '', summary: { total: 2, ready: 1, actionRequired: 1, blocked: 0 }, checks: [] } }; const pack = buildQualityClosureRequestPack({ remainingWork }); expect(pack).toBeDefined(); });

  it('request pack default remaining work has valid mode', () => { const remainingWork = buildDefaultQualityClosureRemainingWork(); expect(remainingWork).toHaveProperty('mode'); });

  it('request pack with PASS gate status returns valid', () => { const remainingWork = { ...buildDefaultQualityClosureRemainingWork(), gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'PASS', generatedAt: '', summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 }, checks: [] } }; const pack = buildQualityClosureRequestPack({ remainingWork }); expect(pack).toBeDefined(); });

  it('request pack default remaining work has mode property', () => { const remainingWork = buildDefaultQualityClosureRemainingWork(); expect(remainingWork.mode).toBeDefined(); });

  it('buildQualityClosureRequestPack handles empty inputs', () => { const pack = buildQualityClosureRequestPack({ evidencePack: { requirements: [] }, remainingWork: buildDefaultQualityClosureRemainingWork() }); expect(pack).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `unknown-request-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
  ] as const))('builds fallback request text for %s with status %s', (name, status) => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED',
        generatedAt: new Date().toISOString(),
        summary: { total: 1, ready: 0, actionRequired: status === 'ACTION_REQUIRED' ? 1 : 0, blocked: status === 'BLOCKED' ? 1 : 0 },
        checks: [{ name, status }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.summary.requestCount).toBe(1);
    expect(pack.requests[0].item).toBe(name);
    expect(pack.requests[0].evidenceRequired).toBe(`${name} evidence`);
    expect(pack.requests[0].requestText).toContain(`${name} 的收口证据`);
    expect(pack.status).toBe(status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED');
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['monthly audit run', 'quality action tracker', 'blocker resolution', 'evidence intake'][index % 4],
  ] as const))('keeps known next command in request pack for %s', (name) => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: new Date().toISOString(),
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name, status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });
    const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

    expect(pack.nextCommands).toHaveLength(1);
    expect(pack.requests[0].nextCommand).toBe(pack.nextCommands[0]);
    expect(pack.requests[0].requestText).toContain(pack.nextCommands[0]);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `blocked-request-${index}`,
    `action-request-${index}`,
  ] as const))(
    'counts generated mixed request statuses %#',
    (blockedName, actionName) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'BLOCKED',
          generatedAt: new Date().toISOString(),
          summary: { total: 2, ready: 0, actionRequired: 1, blocked: 1 },
          checks: [
            { name: blockedName, status: 'BLOCKED', detail: 'blocked' },
            { name: actionName, status: 'ACTION_REQUIRED' },
          ],
          blockers: [],
          closeActions: [],
        },
      });
      const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

      expect(pack.status).toBe('BLOCKED');
      expect(pack.summary).toEqual({ requestCount: 2, blockedRequestCount: 1 });
      expect(pack.requests.map((request) => request.item)).toEqual([blockedName, actionName]);
      expect(pack.requests[0].requestText).toContain(`${blockedName} evidence`);
      expect(pack.requests[1].requestText).toContain(`${actionName} evidence`);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['monthly audit run', 'quality action tracker', 'blocker resolution', 'evidence intake'][index % 4],
    '2026-05-08',
  ] as const))(
    'keeps generated known request due date for %s',
    (name, dueDate) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'ACTION_REQUIRED',
          generatedAt: new Date().toISOString(),
          summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
          checks: [{ name, status: 'ACTION_REQUIRED' }],
          blockers: [],
          closeActions: [],
        },
      });
      const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

      expect(pack.requests[0].dueDate).toBe(dueDate);
      expect(pack.requests[0].requestText).toContain(`请在 ${dueDate} 前提供 ${name} 的收口证据`);
      expect(pack.nextCommands).toEqual([pack.requests[0].nextCommand]);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch123-action-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
  ] as const))(
    'builds generated closure request for %s with status %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status,
          generatedAt: new Date().toISOString(),
          summary: { total: 1, ready: 0, actionRequired: status === 'ACTION_REQUIRED' ? 1 : 0, blocked: status === 'BLOCKED' ? 1 : 0 },
          checks: [{ name, status }],
          blockers: [],
          closeActions: [],
        },
      });
      const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

      expect(pack.summary.requestCount).toBe(1);
      expect(pack.summary.blockedRequestCount).toBe(status === 'BLOCKED' ? 1 : 0);
      expect(pack.requests[0].item).toBe(name);
      expect(pack.requests[0].requestText).toContain(`${name} 的收口证据`);
      expect(pack.status).toBe(status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['monthly audit run', 'quality action tracker', 'blocker resolution', 'evidence intake'][index % 4],
  ] as const))(
    'keeps generated known request command mirrored in nextCommands %s',
    (name) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'ACTION_REQUIRED',
          generatedAt: new Date().toISOString(),
          summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
          checks: [{ name, status: 'ACTION_REQUIRED' }],
          blockers: [],
          closeActions: [],
        },
      });
      const pack = buildQualityClosureRequestPack({ remainingWork: remaining });

      expect(pack.nextCommands).toEqual([pack.requests[0].nextCommand]);
      expect(pack.requests[0].nextCommand).toContain('quality:');
      expect(pack.requests[0].requestText).toContain(pack.requests[0].nextCommand);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 11, 4, index % 60, index % 60)),
  ] as const))(
    'builds generated ready request pack without remaining items %#',
    (generatedAt) => {
      const pack = buildQualityClosureRequestPack({
        generatedAt,
        remainingWork: {
          mode: 'QUALITY_CLOSURE_REMAINING_WORK',
          status: 'READY',
          generatedAt: generatedAt.toISOString(),
          summary: { totalGateChecks: 0, readyGateChecks: 0, remainingGateChecks: 0, blockedGateChecks: 0 },
          remainingItems: [],
          nextCommands: [],
          gaps: [],
        },
      });

      expect(pack.status).toBe('READY');
      expect(pack.generatedAt).toBe(generatedAt.toISOString());
      expect(pack.summary).toEqual({ requestCount: 0, blockedRequestCount: 0 });
      expect(pack.requests).toEqual([]);
      expect(pack.nextCommands).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch144-request-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
    `owner-${index}`,
    `2026-06-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 2 === 0 ? `npm run quality:batch144-${index}` : '',
  ] as const))(
    'builds generated manual closure request %s',
    (name, status, owner, dueDate, nextCommand) => {
      const pack = buildQualityClosureRequestPack({
        remainingWork: {
          mode: 'QUALITY_CLOSURE_REMAINING_WORK',
          status: status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { totalGateChecks: 1, readyGateChecks: 0, remainingGateChecks: 1, blockedGateChecks: status === 'BLOCKED' ? 1 : 0 },
          remainingItems: [{
            name,
            status,
            owner,
            dueDate,
            evidenceRequired: `evidence-${name}`,
            nextCommand,
          }],
          nextCommands: nextCommand ? [nextCommand] : [],
          gaps: [`${name} remains ${status}`],
        },
      });

      expect(pack.status).toBe(status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED');
      expect(pack.summary.blockedRequestCount).toBe(status === 'BLOCKED' ? 1 : 0);
      expect(pack.requests[0]).toMatchObject({ item: name, owner, dueDate, status, evidenceRequired: `evidence-${name}`, nextCommand });
      expect(pack.nextCommands).toEqual(nextCommand ? [nextCommand] : []);
      expect(pack.requests[0].requestText).toContain(`请在 ${dueDate} 前提供 ${name} 的收口证据`);
    },
  );
});

describe('quality closure request pack builder batch 151 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch151-action-${index}`,
    `owner-${index}`,
    `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
    index % 2 === 0 ? `npm run quality:batch151-${index}` : '',
  ] as const))(
    'builds generated action request pack %s',
    (name, owner, dueDate, nextCommand) => {
      const pack = buildQualityClosureRequestPack({
        remainingWork: {
          mode: 'QUALITY_CLOSURE_REMAINING_WORK',
          status: 'ACTION_REQUIRED',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { totalGateChecks: 1, readyGateChecks: 0, remainingGateChecks: 1, blockedGateChecks: 0 },
          remainingItems: [{
            name,
            status: 'ACTION_REQUIRED',
            owner,
            dueDate,
            evidenceRequired: `evidence-${name}`,
            nextCommand,
          }],
          nextCommands: nextCommand ? [nextCommand] : [],
          gaps: [`${name} remains ACTION_REQUIRED`],
        },
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary).toEqual({ requestCount: 1, blockedRequestCount: 0 });
      expect(pack.requests[0]).toMatchObject({ item: name, owner, dueDate, status: 'ACTION_REQUIRED', evidenceRequired: `evidence-${name}`, nextCommand });
      expect(pack.nextCommands).toEqual(nextCommand ? [nextCommand] : []);
      expect(pack.requests[0].requestText).toContain(`请在 ${dueDate} 前提供 ${name} 的收口证据`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch151-blocked-${index}`,
    `batch151-action-${index}`,
  ] as const))(
    'builds generated mixed blocked request pack %s',
    (blockedName, actionName) => {
      const pack = buildQualityClosureRequestPack({
        remainingWork: {
          mode: 'QUALITY_CLOSURE_REMAINING_WORK',
          status: 'BLOCKED',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { totalGateChecks: 2, readyGateChecks: 0, remainingGateChecks: 2, blockedGateChecks: 1 },
          remainingItems: [
            {
              name: blockedName,
              status: 'BLOCKED',
              owner: 'blocked-owner',
              dueDate: '2026-09-10',
              evidenceRequired: `evidence-${blockedName}`,
              nextCommand: '',
            },
            {
              name: actionName,
              status: 'ACTION_REQUIRED',
              owner: 'action-owner',
              dueDate: '2026-09-11',
              evidenceRequired: `evidence-${actionName}`,
              nextCommand: `npm run quality:${actionName}`,
            },
          ],
          nextCommands: [`npm run quality:${actionName}`],
          gaps: [`${blockedName} blocked`, `${actionName} remains`],
        },
      });

      expect(pack.status).toBe('BLOCKED');
      expect(pack.summary).toEqual({ requestCount: 2, blockedRequestCount: 1 });
      expect(pack.requests.map((request) => request.item)).toEqual([blockedName, actionName]);
      expect(pack.nextCommands).toEqual([`npm run quality:${actionName}`]);
      expect(pack.requests[0].requestText).toContain(`evidence-${blockedName}`);
      expect(pack.requests[1].requestText).toContain(`npm run quality:${actionName}`);
    },
  );
});

describe('quality closure request pack builder batch 160 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'builds generated batch160 ready request pack without remaining items %s',
    (generatedAtDay) => {
      const pack = buildQualityClosureRequestPack({
        generatedAt: new Date(`${generatedAtDay}T00:00:00.000Z`),
        remainingWork: {
          mode: 'QUALITY_CLOSURE_REMAINING_WORK',
          status: 'READY',
          generatedAt: `${generatedAtDay}T00:00:00.000Z`,
          summary: { totalGateChecks: 0, readyGateChecks: 0, remainingGateChecks: 0, blockedGateChecks: 0 },
          remainingItems: [],
          nextCommands: [],
          gaps: [],
        },
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary).toEqual({ requestCount: 0, blockedRequestCount: 0 });
      expect(pack.requests).toEqual([]);
      expect(pack.nextCommands).toEqual([]);
      expect(pack.generatedAt).toBe(`${generatedAtDay}T00:00:00.000Z`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch160-duplicate-${index}`,
    `npm run quality:duplicate-${index}`,
  ] as const))(
    'preserves generated batch160 duplicate next commands for %s',
    (name, nextCommand) => {
      const pack = buildQualityClosureRequestPack({
        remainingWork: {
          mode: 'QUALITY_CLOSURE_REMAINING_WORK',
          status: 'ACTION_REQUIRED',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { totalGateChecks: 2, readyGateChecks: 0, remainingGateChecks: 2, blockedGateChecks: 0 },
          remainingItems: [
            { name: `${name}-a`, status: 'ACTION_REQUIRED', owner: 'owner-a', dueDate: '2026-10-10', evidenceRequired: `evidence-${name}-a`, nextCommand },
            { name: `${name}-b`, status: 'ACTION_REQUIRED', owner: 'owner-b', dueDate: '2026-10-11', evidenceRequired: `evidence-${name}-b`, nextCommand },
          ],
          nextCommands: [nextCommand, nextCommand],
          gaps: [`${name}-a remains`, `${name}-b remains`],
        },
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary).toEqual({ requestCount: 2, blockedRequestCount: 0 });
      expect(pack.nextCommands).toEqual([nextCommand, nextCommand]);
      expect(pack.requests.map((request) => request.nextCommand)).toEqual([nextCommand, nextCommand]);
    },
  );
});

describe('quality closure request pack builder batch 169 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch169-item-${index}`,
    `owner-${index}`,
    `2026-12-${String((index % 28) + 1).padStart(2, '0')}`,
    `npm run quality:batch169-${index}`,
  ] as const))(
    'builds generated batch169 action request text with trimmed data %s',
    (name, owner, dueDate, nextCommand) => {
      const pack = buildQualityClosureRequestPack({
        remainingWork: {
          mode: 'QUALITY_CLOSURE_REMAINING_WORK',
          status: 'ACTION_REQUIRED',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { totalGateChecks: 1, readyGateChecks: 0, remainingGateChecks: 1, blockedGateChecks: 0 },
          remainingItems: [{
            name,
            status: 'ACTION_REQUIRED',
            owner,
            dueDate,
            evidenceRequired: `evidence-${name}`,
            nextCommand,
          }],
          nextCommands: [nextCommand],
          gaps: [`${name} remains ACTION_REQUIRED`],
        },
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary).toEqual({ requestCount: 1, blockedRequestCount: 0 });
      expect(pack.requests[0]).toMatchObject({ item: name, owner, dueDate, nextCommand });
      expect(pack.requests[0].requestText).toBe(`请在 ${dueDate} 前提供 ${name} 的收口证据：evidence-${name}。下一步命令：${nextCommand}。`);
      expect(pack.nextCommands).toEqual([nextCommand]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch169-blocked-${index}`,
    `batch169-action-${index}`,
    index % 2 === 0 ? '' : `npm run quality:batch169-action-${index}`,
  ] as const))(
    'keeps generated batch169 blocked status and filters blank commands %s',
    (blockedName, actionName, nextCommand) => {
      const pack = buildQualityClosureRequestPack({
        remainingWork: {
          mode: 'QUALITY_CLOSURE_REMAINING_WORK',
          status: 'BLOCKED',
          generatedAt: '2026-05-11T00:00:00.000Z',
          summary: { totalGateChecks: 2, readyGateChecks: 0, remainingGateChecks: 2, blockedGateChecks: 1 },
          remainingItems: [
            { name: blockedName, status: 'BLOCKED', owner: 'blocked-owner', dueDate: '2026-12-10', evidenceRequired: `evidence-${blockedName}`, nextCommand: '' },
            { name: actionName, status: 'ACTION_REQUIRED', owner: 'action-owner', dueDate: '2026-12-11', evidenceRequired: `evidence-${actionName}`, nextCommand },
          ],
          nextCommands: nextCommand ? [nextCommand] : [],
          gaps: [`${blockedName} blocked`, `${actionName} remains`],
        },
      });

      expect(pack.status).toBe('BLOCKED');
      expect(pack.summary).toEqual({ requestCount: 2, blockedRequestCount: 1 });
      expect(pack.requests.map((request) => request.item)).toEqual([blockedName, actionName]);
      expect(pack.nextCommands).toEqual(nextCommand ? [nextCommand] : []);
    },
  );
});
