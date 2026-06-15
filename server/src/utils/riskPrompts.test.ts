import { describe, it, expect } from 'vitest';
import { parseAIResponse, validateRiskLevel, buildRiskSystemPrompt, buildRiskUserPrompt } from './riskPrompts';
import type { RiskContext } from './riskContext';

describe('riskPrompts', () => {
  describe('parseAIResponse', () => {
    it('parses plain JSON', () => {
      const result = parseAIResponse('{"riskLevel":"HIGH","summary":"test"}');
      expect(result.riskLevel).toBe('HIGH');
      expect(result.summary).toBe('test');
    });

    it('parses JSON from fenced code block', () => {
      const result = parseAIResponse('```json\n{"riskLevel":"LOW","summary":"ok"}\n```');
      expect(result.riskLevel).toBe('LOW');
    });

    it('parses JSON from unfenced code block', () => {
      const result = parseAIResponse('```\n{"riskLevel":"MEDIUM","summary":"x"}\n```');
      expect(result.riskLevel).toBe('MEDIUM');
    });
  });

  describe('validateRiskLevel', () => {
    it('accepts valid uppercase levels', () => {
      expect(validateRiskLevel('LOW')).toBe('LOW');
      expect(validateRiskLevel('MEDIUM')).toBe('MEDIUM');
      expect(validateRiskLevel('HIGH')).toBe('HIGH');
      expect(validateRiskLevel('CRITICAL')).toBe('CRITICAL');
    });

    it('normalizes lowercase', () => {
      expect(validateRiskLevel('high')).toBe('HIGH');
      expect(validateRiskLevel('low')).toBe('LOW');
    });

    it('maps Chinese levels', () => {
      expect(validateRiskLevel('低')).toBe('LOW');
      expect(validateRiskLevel('中')).toBe('MEDIUM');
      expect(validateRiskLevel('高')).toBe('HIGH');
      expect(validateRiskLevel('严重')).toBe('CRITICAL');
    });

    it('AI-007 (GLM QA bug repro #7): 「极高」应归一化为 CRITICAL，而非回落 MEDIUM', () => {
      // test-plan AI-007（P1）：severity 中文「极高」→ CRITICAL。
      // 现状：riskPrompts.validateRiskLevel 的 cnMap 只有 {低,中,高,严重}，不含「极高」；
      // 「极高」未命中 valid 英文枚举、也未命中 cnMap → 回落默认 'MEDIUM'——把最高级别风险
      // 降级成中等，污染风险评估输出。
      expect(validateRiskLevel('极高')).toBe('CRITICAL');
    });

    it('defaults to MEDIUM for unknown', () => {
      expect(validateRiskLevel('unknown')).toBe('MEDIUM');
    });

    it('defaults to MEDIUM for undefined', () => {
      expect(validateRiskLevel(undefined)).toBe('MEDIUM');
    });
  });

  describe('buildRiskSystemPrompt', () => {
    it('returns a non-empty string', () => {
      expect(buildRiskSystemPrompt().length).toBeGreaterThan(100);
    });

    it('contains JSON output format instructions', () => {
      const prompt = buildRiskSystemPrompt();
      expect(prompt).toContain('riskLevel');
      expect(prompt).toContain('riskFactors');
      expect(prompt).toContain('suggestions');
    });

    it('contains severity levels', () => {
      const prompt = buildRiskSystemPrompt();
      expect(prompt).toContain('LOW');
      expect(prompt).toContain('MEDIUM');
      expect(prompt).toContain('HIGH');
      expect(prompt).toContain('CRITICAL');
    });
  });

  describe('buildRiskUserPrompt', () => {
    const baseContext: RiskContext = {
      project: { id: '1', name: '测试项目', status: 'IN_PROGRESS', priority: 'HIGH', progress: 65.5, startDate: '2025-01-01', endDate: '2025-12-31', managerName: '张三', memberCount: 5, totalActivities: 3 },
      ruleEngineMetrics: { riskLevel: 'MEDIUM', riskScore: 4, factors: [{ factor: '进度滞后', severity: 'MEDIUM', description: '差距15%', score: 2 }] },
      activities: [
        { id: 'a1', name: '设计', type: 'DESIGN', phase: '设计阶段', status: 'COMPLETED', priority: 'HIGH', assignees: ['李四'], planStartDate: '2025-01-01', planEndDate: '2025-02-01', planDuration: 30, startDate: '2025-01-01', endDate: '2025-02-05', duration: 35, dependencyCount: 0, isOnCriticalPath: true },
        { id: 'a2', name: '开发', type: 'DEVELOPMENT', phase: '开发阶段', status: 'IN_PROGRESS', priority: 'CRITICAL', assignees: ['王五', '赵六'], planStartDate: '2025-02-01', planEndDate: '2025-06-30', planDuration: 120, startDate: '2025-02-01', endDate: null, duration: null, dependencyCount: 2, isOnCriticalPath: true, overdueDays: 5 },
        { id: 'a3', name: '测试', type: 'TESTING', phase: null, status: 'NOT_STARTED', priority: 'MEDIUM', assignees: [], planStartDate: '2025-07-01', planEndDate: '2025-08-31', planDuration: 60, startDate: null, endDate: null, duration: null, dependencyCount: 1, isOnCriticalPath: false },
      ],
      criticalPathActivityIds: ['a1', 'a2'],
      historicalTrend: [
        { assessedAt: '2025-05-01T10:00:00.000Z', riskLevel: 'LOW', source: 'ai' },
        { assessedAt: '2025-05-08T10:00:00.000Z', riskLevel: 'MEDIUM', source: 'rule_engine' },
      ],
      latestWeeklyReportRisks: { riskWarning: '<b>延期风险</b>', risks: null, progressStatus: 'MINOR_ISSUE', weekEnd: '2025-05-09' },
      summary: { completedCount: 1, inProgressCount: 1, notStartedCount: 1, overdueCount: 1, unassignedCount: 1, avgDurationDeviation: 16.7, longestDependencyChain: 3, crossProjectConflictCount: 2 },
    };

    it('includes project name', () => {
      expect(buildRiskUserPrompt(baseContext)).toContain('测试项目');
    });

    it('includes progress percentage', () => {
      expect(buildRiskUserPrompt(baseContext)).toContain('65.5%');
    });

    it('includes manager name', () => {
      expect(buildRiskUserPrompt(baseContext)).toContain('张三');
    });

    it('includes rule engine risk level', () => {
      expect(buildRiskUserPrompt(baseContext)).toContain('MEDIUM');
    });

    it('includes risk factors', () => {
      expect(buildRiskUserPrompt(baseContext)).toContain('进度滞后');
    });

    it('includes summary stats', () => {
      const prompt = buildRiskUserPrompt(baseContext);
      expect(prompt).toContain('已完成：1');
      expect(prompt).toContain('逾期数：1');
      expect(prompt).toContain('未分配：1');
    });

    it('includes avg duration deviation when present', () => {
      expect(buildRiskUserPrompt(baseContext)).toContain('16.7%');
    });

    it('includes critical path activities', () => {
      const prompt = buildRiskUserPrompt(baseContext);
      expect(prompt).toContain('关键路径');
    });

    it('includes activity details with overdue days', () => {
      const prompt = buildRiskUserPrompt(baseContext);
      expect(prompt).toContain('逾期:5天');
    });

    it('includes historical trend', () => {
      const prompt = buildRiskUserPrompt(baseContext);
      expect(prompt).toContain('历史风险趋势');
      expect(prompt).toContain('LOW');
    });

    it('strips HTML from riskWarning', () => {
      const prompt = buildRiskUserPrompt(baseContext);
      expect(prompt).toContain('延期风险');
      expect(prompt).not.toContain('<b>');
    });

    it('omits avgDurationDeviation when null', () => {
      const ctx = { ...baseContext, summary: { ...baseContext.summary, avgDurationDeviation: null } };
      const prompt = buildRiskUserPrompt(ctx);
      expect(prompt).not.toContain('平均工期偏差');
    });

    it('omits critical path section when empty', () => {
      const ctx = { ...baseContext, criticalPathActivityIds: [], activities: baseContext.activities.map(a => ({ ...a, isOnCriticalPath: false })) };
      const prompt = buildRiskUserPrompt(ctx);
      expect(prompt).not.toContain('## 关键路径');
    });

    it('omits historical trend when empty', () => {
      const ctx = { ...baseContext, historicalTrend: [] };
      const prompt = buildRiskUserPrompt(ctx);
      expect(prompt).not.toContain('历史风险趋势');
    });

    it('omits weekly report when null', () => {
      const ctx = { ...baseContext, latestWeeklyReportRisks: null };
      const prompt = buildRiskUserPrompt(ctx);
      expect(prompt).not.toContain('最新周报');
    });

    it('ends with JSON instruction', () => {
      const prompt = buildRiskUserPrompt(baseContext);
      expect(prompt).toContain('输出 JSON 格式');
    });
  });

  it('parseAIResponse handles empty string', () => {
    expect(() => parseAIResponse('')).toThrow();
  });

  it('parseAIResponse handles valid JSON with extra whitespace', () => { const result = parseAIResponse('  {"riskLevel":"HIGH","riskFactors":[],"suggestions":[]}  '); expect(result.riskLevel).toBe('HIGH'); });

  it('parseAIResponse handles JSON with missing suggestions field', () => { const result = parseAIResponse('{"riskLevel":"MEDIUM","riskFactors":[]}'); expect(result.riskLevel).toBe('MEDIUM'); });

  it('parseAIResponse handles JSON with whitespace only', () => { expect(() => parseAIResponse('   ')).toThrow(); });

  it('parseAIResponse handles JSON with extra fields', () => { const result = parseAIResponse('{"riskLevel":"LOW","riskFactors":[],"suggestions":[],"extra":true}'); expect(result.riskLevel).toBe('LOW'); });

  it('parseAIResponse handles JSON with empty riskFactors', () => { const result = parseAIResponse('{"riskLevel":"LOW","riskFactors":[],"suggestions":[]}'); expect(result.riskFactors).toHaveLength(0); });

  it('parseAIResponse handles malformed JSON gracefully', () => { const result = parseAIResponse('{}'); expect(result).toBeDefined(); });

  it('parseAIResponse handles valid JSON with minimal fields', () => { const result = parseAIResponse('{"riskLevel":"LOW"}'); expect(result).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][index % 4],
    `因素-${index}`,
    `建议-${index}`,
  ] as const))(
    'parseAIResponse parses generated fenced payload %s %s',
    (riskLevel, factor, suggestion) => {
      const result = parseAIResponse(`前置文本\n\`\`\`json\n{"riskLevel":"${riskLevel}","riskFactors":[{"factor":"${factor}"}],"suggestions":["${suggestion}"],"actionItems":[{"action":"行动-${factor}"}]}\n\`\`\``);

      expect(result.riskLevel).toBe(riskLevel);
      expect(result.riskFactors).toEqual([{ factor }]);
      expect(result.suggestions).toEqual([suggestion]);
      expect(result.actionItems).toEqual([{ action: `行动-${factor}` }]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['低', '中', '高', '严重', 'low', 'medium', 'high', 'critical'][index % 8],
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][index % 8],
  ] as const))(
    'validateRiskLevel normalizes generated level %s',
    (input, expected) => {
      expect(validateRiskLevel(input)).toBe(expected);
    },
  );
});
