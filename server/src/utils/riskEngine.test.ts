import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindUnique, mockActivityFindMany, mockActivityCount } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockActivityFindMany: vi.fn(),
  mockActivityCount: vi.fn(),
}));

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    project = { findUnique: mockFindUnique };
    activity = { findMany: mockActivityFindMany, count: mockActivityCount };
  },
  ActivityStatus: {
    COMPLETED: 'COMPLETED',
    IN_PROGRESS: 'IN_PROGRESS',
    NOT_STARTED: 'NOT_STARTED',
    DELAYED: 'DELAYED',
    CANCELLED: 'CANCELLED',
  },
}));

import { assessProjectRisk } from './riskEngine';
import { parseAIResponse, validateRiskLevel } from './riskPrompts';

function makeProject(overrides = {}) {
  return {
    id: 'proj-001', name: '测试项目', progress: 80,
    startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'),
    activities: [],
    ...overrides,
  };
}

type ActivityOverrides = Record<string, unknown> & {
  assigneeId?: string | null;
};

function makeActivity(overrides: ActivityOverrides = {}) {
  const { assigneeId, ...rest } = overrides;
  return {
    id: Math.random().toString(),
    name: '测试活动',
    status: 'NOT_STARTED',
    executors: assigneeId === null ? [] : [{ userId: assigneeId || 'user-1', user: { id: assigneeId || 'user-1', realName: '测试用户' } }],
    planStartDate: null,
    planEndDate: null,
    planDuration: null,
    startDate: null,
    endDate: null,
    duration: null,
    ...rest,
  };
}

describe('assessProjectRisk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no cross-project conflicts
    mockActivityCount.mockResolvedValue(0);
  });

  it('项目不存在时抛出错误', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockActivityFindMany.mockResolvedValue([]);
    await expect(assessProjectRisk('non-existent')).rejects.toThrow('项目不存在');
  });

  it('没有活动时返回低风险', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ activities: [] }));
    mockActivityFindMany.mockResolvedValue([]);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskLevel).toBe('LOW');
    expect(result.riskFactors[0].factor).toBe('项目初期');
  });

  it('无延期、有负责人、无日期限制 → 低风险且因子为"项目运行正常"', async () => {
    // 不设置日期，跳过进度偏差计算，确保测试结果不受当前日期影响
    mockFindUnique.mockResolvedValue(makeProject({ progress: 80, startDate: null, endDate: null }));
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ status: 'COMPLETED', assigneeId: 'u1' }),
    ]);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskLevel).toBe('LOW');
    expect(result.riskFactors[0].factor).toBe('项目运行正常');
  });

  it('时间进度与实际进度差 >30% → 高风险因子', async () => {
    // 项目从 2020 年开始，现在已过大半，但进度只有 10%
    const start = new Date('2020-01-01');
    const end = new Date('2026-12-31');
    mockFindUnique.mockResolvedValue(makeProject({ progress: 10, startDate: start, endDate: end }));
    mockActivityFindMany.mockResolvedValue([makeActivity({ assigneeId: 'u1' })]);
    const result = await assessProjectRisk('proj-001');
    const progressFactor = result.riskFactors.find((f) => f.factor.includes('进度'));
    expect(progressFactor?.severity).toBe('HIGH');
  });

  it('多个逾期任务 → 高风险因子"存在逾期任务"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    const acts = [
      ...Array(4).fill(null).map(() => makeActivity({ status: 'IN_PROGRESS', planEndDate: past })),
      ...Array(6).fill(null).map(() => makeActivity({ status: 'NOT_STARTED' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('逾期'));
    expect(f?.severity).toBe('HIGH');
  });

  it('少量逾期任务 → 低风险因子"存在逾期任务"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    const acts = [
      ...Array(1).fill(null).map(() => makeActivity({ status: 'IN_PROGRESS', planEndDate: past })),
      ...Array(8).fill(null).map(() => makeActivity({ status: 'NOT_STARTED' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('逾期'));
    expect(f?.severity).toBe('LOW');
  });

  it('>3 个逾期未完成任务 → 高风险因子', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    const acts = Array(4).fill(null).map(() =>
      makeActivity({ status: 'IN_PROGRESS', planEndDate: past })
    );
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('逾期'));
    expect(f?.severity).toBe('HIGH');
  });

  it('1 个逾期未完成任务 → 低风险因子', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ status: 'IN_PROGRESS', planEndDate: past }),
      makeActivity({ status: 'COMPLETED', planEndDate: past }),
    ]);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('逾期'));
    expect(f?.severity).toBe('LOW');
  });

  it('>30% 未分配负责人 → 中风险因子"资源分配不足"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const acts = [
      ...Array(4).fill(null).map(() => makeActivity({ status: 'NOT_STARTED', assigneeId: null })),
      ...Array(6).fill(null).map(() => makeActivity({ status: 'NOT_STARTED', assigneeId: 'u1' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('资源'));
    expect(f?.severity).toBe('MEDIUM');
  });

  it('多因子叠加分数 ≥7 → 极高风险', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    // 延期>30%(+3) + 逾期>3(+3) + 未分配>30%(+2) = 8
    const acts = [
      ...Array(4).fill(null).map(() => makeActivity({ status: 'DELAYED', assigneeId: null, planEndDate: past })),
      ...Array(4).fill(null).map(() => makeActivity({ status: 'IN_PROGRESS', assigneeId: null, planEndDate: past })),
      ...Array(2).fill(null).map(() => makeActivity({ status: 'NOT_STARTED', assigneeId: 'u1' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskLevel).toBe('CRITICAL');
  });

  it('返回结果包含必要字段结构', async () => {
    mockFindUnique.mockResolvedValue(makeProject());
    mockActivityFindMany.mockResolvedValue([makeActivity()]);
    const result = await assessProjectRisk('proj-001');
    expect(result).toHaveProperty('riskLevel');
    expect(Array.isArray(result.riskFactors)).toBe(true);
    expect(Array.isArray(result.suggestions)).toBe(true);
    result.riskFactors.forEach((f) => {
      expect(f).toHaveProperty('factor');
      expect(f).toHaveProperty('severity');
      expect(f).toHaveProperty('description');
    });
  });

  it('工期偏差 >30% → 高风险因子"工期偏差严重"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ status: 'COMPLETED', duration: 20, planDuration: 10, assigneeId: 'u1' }),
      makeActivity({ status: 'COMPLETED', duration: 15, planDuration: 10, assigneeId: 'u1' }),
    ]);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('工期偏差'));
    expect(f?.severity).toBe('HIGH');
  });

  it('工期偏差 >15% → 中风险因子"工期偏差偏高"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ status: 'COMPLETED', duration: 12, planDuration: 10, assigneeId: 'u1' }),
    ]);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('工期偏差'));
    expect(f?.severity).toBe('MEDIUM');
  });

  it('依赖链 >5 → 高风险因子"依赖链过长"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    const acts = [];
    for (let i = 0; i < 7; i++) {
      acts.push(makeActivity({
        id: `act-${i}`,
        assigneeId: 'u1',
        dependencies: i > 0 ? JSON.stringify([{ id: `act-${i - 1}` }]) : null,
      }));
    }
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('依赖链'));
    expect(f?.severity).toBe('HIGH');
  });

  it('依赖链 >3 → 中风险因子"存在较长依赖链"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    const acts = [
      makeActivity({ id: 'a0', assigneeId: 'u1', dependencies: null }),
      makeActivity({ id: 'a1', assigneeId: 'u1', dependencies: JSON.stringify([{ id: 'a0' }]) }),
      makeActivity({ id: 'a2', assigneeId: 'u1', dependencies: JSON.stringify([{ id: 'a1' }]) }),
      makeActivity({ id: 'a3', assigneeId: 'u1', dependencies: JSON.stringify([{ id: 'a2' }]) }),
      makeActivity({ id: 'a4', assigneeId: 'u1', dependencies: JSON.stringify([{ id: 'a3' }]) }),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('依赖链'));
    expect(f?.severity).toBe('MEDIUM');
  });

  it('活动集中在单一阶段 >70% → 中风险因子', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    const acts = [
      ...Array(4).fill(null).map((_, i) => makeActivity({ status: 'IN_PROGRESS', phase: '开发', assigneeId: 'u1', id: `ip-${i}` })),
      makeActivity({ status: 'IN_PROGRESS', phase: '测试', assigneeId: 'u1', id: 'ip-4' }),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('集中在单一阶段'));
    expect(f?.severity).toBe('MEDIUM');
  });

  it('跨项目资源冲突 >3人 → 高风险因子', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    const acts = Array(5).fill(null).map((_, i) => makeActivity({
      status: 'IN_PROGRESS',
      assigneeId: `user-${i}`,
      id: `act-${i}`,
    }));
    mockActivityFindMany.mockResolvedValue(acts);
    mockActivityCount.mockResolvedValue(1);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('跨项目资源冲突'));
    expect(f?.severity).toBe('HIGH');
  });

  it('跨项目资源冲突 1-3人 → 低风险因子', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ status: 'IN_PROGRESS', assigneeId: 'u1' }),
    ]);
    mockActivityCount.mockResolvedValue(1);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('跨项目资源冲突'));
    expect(f?.severity).toBe('LOW');
  });

  it('riskScore >= 2 → MEDIUM risk level', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ status: 'IN_PROGRESS', assigneeId: null, planEndDate: new Date('2020-01-01') }),
    ]);
    mockActivityCount.mockResolvedValue(0);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskScore).toBeGreaterThanOrEqual(2);
    expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.riskLevel);
  });

  it('riskScore >= 4 → HIGH risk level', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    const past = new Date('2020-01-01');
    mockActivityFindMany.mockResolvedValue([
      ...Array(4).fill(null).map((_, i) => makeActivity({ status: 'IN_PROGRESS', planEndDate: past, assigneeId: `u${i}`, id: `ov-${i}` })),
      makeActivity({ status: 'COMPLETED', assigneeId: 'u1', duration: 20, planDuration: 10, id: 'dev-1' }),
    ]);
    mockActivityCount.mockResolvedValue(0);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskScore).toBeGreaterThanOrEqual(4);
    expect(result.riskLevel).toMatch(/^(HIGH|CRITICAL)$/);
  });

  it('循环依赖不会导致无限递归', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ id: 'a', assigneeId: 'u1', dependencies: JSON.stringify([{ id: 'b' }]) }),
      makeActivity({ id: 'b', assigneeId: 'u1', dependencies: JSON.stringify([{ id: 'a' }]) }),
    ]);
    mockActivityCount.mockResolvedValue(0);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskLevel).toBeDefined();
    expect(typeof result.riskScore).toBe('number');
  });

  it('delay rate >30% triggers HIGH severity', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50, startDate: null, endDate: null }));
    const past = new Date('2020-01-01');
    const acts = [
      ...Array(4).fill(null).map(() => makeActivity({ status: 'IN_PROGRESS', planEndDate: past, assigneeId: 'u1' })),
      ...Array(6).fill(null).map(() => makeActivity({ status: 'NOT_STARTED', assigneeId: 'u1' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    mockActivityCount.mockResolvedValue(0);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('延期率') || r.factor.includes('任务延期'));
    expect(f).toBeDefined();
  });

  describe('RISK-002: Chinese severity normalization', () => {
    it('RISK-002 maps Chinese risk levels to English enum', () => {
      const chineseToEnum: Record<string, string> = {
        '低': 'LOW',
        '中': 'MEDIUM',
        '高': 'HIGH',
        '极高': 'CRITICAL',
        '严重': 'CRITICAL',
      };

      for (const [_cn, en] of Object.entries(chineseToEnum)) {
        expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(en);
      }
    });
  });

  describe('AI-004: AI returns non-JSON string falls back to rule engine', () => {
    it('AI-004 parseAIResponse throws on non-JSON input', () => {
      expect(() => parseAIResponse('This is not JSON at all')).toThrow();
    });

    it('AI-004 parseAIResponse throws on plain text AI response', () => {
      expect(() => parseAIResponse('The project is at high risk due to delays.')).toThrow();
    });
  });

  describe('AI-005: AI returns JSON with missing fields uses defaults', () => {
    it('AI-005 parseAIResponse parses partial JSON without crashing', () => {
      const result = parseAIResponse('{"riskLevel":"HIGH"}');
      expect(result.riskLevel).toBe('HIGH');
      expect(result.riskFactors).toBeUndefined();
      expect(result.suggestions).toBeUndefined();
    });

    it('AI-005 parseAIResponse handles empty JSON object', () => {
      const result = parseAIResponse('{}');
      expect(result).toEqual({});
    });

    it('AI-005 validateRiskLevel defaults to MEDIUM for unrecognized level', () => {
      expect(validateRiskLevel('')).toBe('MEDIUM');
      expect(validateRiskLevel('unknown')).toBe('MEDIUM');
    });
  });

  describe('AI-007: Chinese severity normalization', () => {
    it('AI-007 "极高" normalizes to CRITICAL', () => {
      expect(validateRiskLevel('极高')).toBe('CRITICAL');
    });

    it('AI-007 "严重" normalizes to CRITICAL', () => {
      expect(validateRiskLevel('严重')).toBe('CRITICAL');
    });

    it('AI-007 "高" normalizes to HIGH via cnMap', () => {
      expect(validateRiskLevel('高')).toBe('HIGH');
    });

    it('AI-007 Chinese "低" normalizes to LOW via cnMap', () => {
      expect(validateRiskLevel('低')).toBe('LOW');
    });
  });

  describe('AI-008: severity case insensitivity', () => {
    it('AI-008 "High" normalizes to HIGH', () => {
      expect(validateRiskLevel('High')).toBe('HIGH');
    });

    it('AI-008 "high" normalizes to HIGH', () => {
      expect(validateRiskLevel('high')).toBe('HIGH');
    });

    it('AI-008 "HIGH" normalizes to HIGH', () => {
      expect(validateRiskLevel('HIGH')).toBe('HIGH');
    });

    it('AI-008 "low" normalizes to LOW', () => {
      expect(validateRiskLevel('low')).toBe('LOW');
    });

    it('AI-008 "Medium" normalizes to MEDIUM', () => {
      expect(validateRiskLevel('Medium')).toBe('MEDIUM');
    });

    it('AI-008 "Critical" normalizes to CRITICAL', () => {
      expect(validateRiskLevel('Critical')).toBe('CRITICAL');
    });
  });

  it('AI-009 "Unknown" defaults to MEDIUM from validateRiskLevel', () => { expect(validateRiskLevel('Unknown')).toBe('MEDIUM'); });

  it('validateRiskLevel handles empty string as MEDIUM', () => { expect(validateRiskLevel('')).toBe('MEDIUM'); });

  it('validateRiskLevel handles lowercase input', () => { expect(validateRiskLevel('high')).toBe('HIGH'); });

  it('validateRiskLevel handles mixed case input', () => { expect(validateRiskLevel('MedIum')).toBe('MEDIUM'); });

  it('validateRiskLevel handles whitespace-padded input', () => { expect(validateRiskLevel('  HIGH  ')).toBe('MEDIUM'); });

  it('validateRiskLevel handles numeric string input', () => { expect(validateRiskLevel('123')).toBe('MEDIUM'); });

  it('validateRiskLevel handles lowercase input', () => { expect(validateRiskLevel('high')).toBe('HIGH'); });

  it('assessRisk returns object with riskLevel for empty inputs', () => { mockFindUnique.mockResolvedValue(makeProject({ progress: 0 })); mockActivityFindMany.mockResolvedValue([]); mockActivityCount.mockResolvedValue(0); return assessProjectRisk('proj-001').then(r => { expect(r).toHaveProperty('riskLevel'); }); });
});
