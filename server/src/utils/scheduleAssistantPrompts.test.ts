import { describe, it, expect } from 'vitest';
import {
  parseIntentResponse,
  buildIntentSystemPrompt,
  buildIntentUserPrompt,
  buildNarrateSystemPrompt,
  buildNarrateUserPrompt,
  type IntentPromptActivity,
} from './scheduleAssistantPrompts';
import type { ScheduleDiff } from './scheduleEngine';
import type { RiskFinding } from './scheduleRisks';

// 04 占位活动清单
const VALID_IDS = ['A1', 'A2', 'A3', 'M1'];
const PROJECT_ID = 'project-1';

const j = (obj: unknown) => JSON.stringify(obj);

// ─── parseIntentResponse：正样本 ──────────────────────────
describe('parseIntentResponse · positive samples (04 §正样本)', () => {
  it('P1: shift_activity A1 +14, confidence high', () => {
    const content = j({
      operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.intent.projectId).toBe(PROJECT_ID);
      expect(r.intent.operations).toEqual([
        { type: 'shift_activity', activityId: 'A1', deltaDays: 14 },
      ]);
      expect(r.intent.confidence).toBe('high');
    }
  });

  it('P2: shift_activity A1 -3', () => {
    const content = j({
      operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: -3 }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
  });

  it('P3: set_duration A3 5', () => {
    const content = j({
      operations: [{ type: 'set_duration', activityId: 'A3', durationDays: 5 }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
  });

  it('P4: set_planned A2 end 2026-07-10', () => {
    const content = j({
      operations: [
        { type: 'set_planned', activityId: 'A2', field: 'end', date: '2026-07-10' },
      ],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
  });

  it('P5: add_dependency A3 dependsOn A2', () => {
    const content = j({
      operations: [{ type: 'add_dependency', activityId: 'A3', dependsOnId: 'A2' }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
  });

  it('P6: remove_dependency A2 dependsOn A1', () => {
    const content = j({
      operations: [{ type: 'remove_dependency', activityId: 'A2', dependsOnId: 'A1' }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
  });

  it('P7: shift only A1, no downstream enumeration', () => {
    const content = j({
      operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Must NOT contain any explicit A2/A3 ops
      const touched = r.intent.operations.map((o) => o.activityId);
      expect(touched).toEqual(['A1']);
    }
  });

  it('strips ```json fenced code block', () => {
    const content = '```json\n' + j({ operations: [], confidence: 'low', unresolved: [] }) + '\n```';
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
  });

  it('injects projectId even if LLM omits or fakes it', () => {
    const content = j({
      projectId: 'WRONG-from-LLM',
      operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 1 }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.intent.projectId).toBe(PROJECT_ID);
  });
});

// ─── parseIntentResponse：负样本（反幻觉主战场） ─────────────
describe('parseIntentResponse · negative samples (04 §负样本/边界)', () => {
  it('N1: empty operations + unresolved is a VALID parse (noOp handled downstream)', () => {
    const content = j({
      operations: [],
      confidence: 'low',
      unresolved: ['包装设计'],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.intent.operations.length).toBe(0);
      expect(r.intent.unresolved).toEqual(['包装设计']);
    }
  });

  it('fabricated activityId → fabricated_id (hallucination backstop, 03 §2)', () => {
    const content = j({
      operations: [{ type: 'shift_activity', activityId: 'A9', deltaDays: 7 }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('fabricated_id');
      expect(r.detail).toContain('A9');
    }
  });

  it('fabricated dependsOnId → fabricated_id', () => {
    const content = j({
      operations: [{ type: 'add_dependency', activityId: 'A2', dependsOnId: 'ZZ' }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('fabricated_id');
  });

  it('non-JSON content → unparseable', () => {
    const r = parseIntentResponse('我不太确定您的意思', VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('unparseable');
  });

  it('missing required field (deltaDays) → invalid_schema', () => {
    const content = j({
      operations: [{ type: 'shift_activity', activityId: 'A1' }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('invalid_schema');
  });

  it('bad date format (2026/07/10) → invalid_schema', () => {
    const content = j({
      operations: [
        { type: 'set_planned', activityId: 'A2', field: 'end', date: '2026/07/10' },
      ],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('invalid_schema');
  });

  it('unknown operation type → invalid_schema', () => {
    const content = j({
      operations: [{ type: 'delete_activity', activityId: 'A1' }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('invalid_schema');
  });

  it('B4: cycle-forming dependency parses fine (validator rejects at apply, not here)', () => {
    // M1 already depends on A3; "整机测试(A3) 依赖 验收里程碑(M1)" forms a cycle.
    // Intent parsing itself should succeed — cycle detection is the apply stage's job.
    const content = j({
      operations: [{ type: 'add_dependency', activityId: 'A3', dependsOnId: 'M1' }],
      confidence: 'high',
      unresolved: [],
    });
    const r = parseIntentResponse(content, VALID_IDS, PROJECT_ID);
    expect(r.ok).toBe(true);
  });
});

// ─── prompt builders ──────────────────────────────────────
describe('buildIntentSystemPrompt', () => {
  it('contains anti-hallucination anchor (2026-04-26 incident)', () => {
    expect(buildIntentSystemPrompt()).toContain('2026-04-26');
  });
  it('forbids computing dates / downstream enumeration', () => {
    const p = buildIntentSystemPrompt();
    expect(p).toContain('不计算任何日期');
  });
});

describe('buildIntentUserPrompt', () => {
  const acts: IntentPromptActivity[] = [
    { id: 'A1', name: '硬件打样', isMilestone: false, planStartDate: '2026-03-02', planEndDate: '2026-03-06', dependsOn: [] },
    { id: 'M1', name: '验收里程碑', isMilestone: true, planStartDate: null, planEndDate: '2026-03-23', dependsOn: ['A3'] },
  ];
  it('lists all activity ids and marks milestone', () => {
    const p = buildIntentUserPrompt('把硬件打样推迟两周', acts);
    expect(p).toContain('id=A1');
    expect(p).toContain('id=M1');
    expect(p).toContain('里程碑');
    expect(p).toContain('把硬件打样推迟两周');
  });
});

describe('buildNarrateSystemPrompt', () => {
  it('forbids adding new facts', () => {
    expect(buildNarrateSystemPrompt()).toContain('不得新增任何事实');
  });
});

describe('buildNarrateUserPrompt', () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  it('renders changed rows and risks', () => {
    const diff: ScheduleDiff = {
      items: [
        {
          activityId: 'A1',
          name: '硬件打样',
          before: { start: d('2026-03-02'), end: d('2026-03-06') },
          after: { start: d('2026-03-16'), end: d('2026-03-20') },
          changed: true,
        },
      ],
    };
    const risks: RiskFinding[] = [
      { kind: 'hard_node_breach', activityId: 'M1', name: '验收里程碑', deadline: d('2026-08-03'), projected: d('2026-08-20') },
    ];
    const p = buildNarrateUserPrompt(diff, risks);
    expect(p).toContain('硬件打样');
    expect(p).toContain('2026-03-16');
    expect(p).toContain('验收里程碑');
  });
  it('says no changes / no risks when empty', () => {
    const p = buildNarrateUserPrompt({ items: [] }, []);
    expect(p).toContain('（无改动）');
    expect(p).toContain('（无风险）');
  });
});
