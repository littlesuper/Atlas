import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma, mockAssessRisk, mockBuildContext, mockTrimContext, mockCallAi, mockBuildSystemPrompt, mockBuildUserPrompt, mockParseAIResponse, mockValidateRiskLevel } = vi.hoisted(() => ({
  mockPrisma: {
    project: { findMany: vi.fn(), findUnique: vi.fn() },
    riskAssessment: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
  },
  mockAssessRisk: vi.fn(),
  mockBuildContext: vi.fn().mockResolvedValue({}),
  mockTrimContext: vi.fn().mockReturnValue({}),
  mockCallAi: vi.fn(),
  mockBuildSystemPrompt: vi.fn().mockReturnValue('system'),
  mockBuildUserPrompt: vi.fn().mockReturnValue('user'),
  mockParseAIResponse: vi.fn(),
  mockValidateRiskLevel: vi.fn().mockReturnValue('MEDIUM'),
}));

// ─── vi.mock calls ────────────────────────────────────────────────────────────

vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor() { return mockPrisma as any; } },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: 'Admin',
      roles: [{ id: 'r1', name: 'admin', description: null }],
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    };
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  sanitizePagination: (page: any, pageSize: any) => ({
    pageNum: parseInt(page) || 1,
    pageSizeNum: parseInt(pageSize) || 20,
  }),
}));

vi.mock('../utils/riskEngine', () => ({
  assessProjectRisk: mockAssessRisk,
}));

vi.mock('../utils/riskContext', () => ({
  buildRiskContext: mockBuildContext,
  trimContextForAI: mockTrimContext,
}));

vi.mock('../utils/riskPrompts', () => ({
  buildRiskSystemPrompt: mockBuildSystemPrompt,
  buildRiskUserPrompt: mockBuildUserPrompt,
  parseAIResponse: mockParseAIResponse,
  validateRiskLevel: mockValidateRiskLevel,
}));

vi.mock('../utils/aiClient', () => ({
  callAi: mockCallAi,
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import riskRoutes from './risk';

const app = express();
app.use(express.json());
app.use('/api/risk', riskRoutes);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/risk/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns risk summary for in-progress projects', async () => {
    const projects = [
      { id: 'p1', name: '项目A' },
      { id: 'p2', name: '项目B' },
    ];
    mockPrisma.project.findMany.mockResolvedValue(projects);

    const now = new Date();
    mockPrisma.riskAssessment.findFirst
      .mockResolvedValueOnce({ riskLevel: 'HIGH', assessedAt: now })
      .mockResolvedValueOnce({ riskLevel: 'LOW', assessedAt: now });

    const res = await request(app).get('/api/risk/summary');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].projectName).toBe('项目A');
    expect(res.body[0].riskLevel).toBe('HIGH');
    expect(res.body[1].projectName).toBe('项目B');
    expect(res.body[1].riskLevel).toBe('LOW');
  });
});

describe('GET /api/risk/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns dashboard with actionItems from aiEnhancedData', async () => {
    const projects = [{ id: 'p1', name: '项目A', productLine: '产品线1' }];
    mockPrisma.project.findMany.mockResolvedValue(projects);

    const now = new Date();
    const assessments = [
      {
        riskLevel: 'HIGH',
        assessedAt: now,
        source: 'ai',
        aiInsights: '风险较高',
        aiEnhancedData: {
          actionItems: [
            { action: '加派人手', priority: 'HIGH' },
            { action: '调整排期', priority: 'MEDIUM' },
          ],
        },
      },
    ];
    mockPrisma.riskAssessment.findMany.mockResolvedValue(assessments);

    const res = await request(app).get('/api/risk/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.topActionItems).toHaveLength(2);
    expect(res.body.topActionItems[0].action).toBe('加派人手');
    expect(res.body.topActionItems[0].priority).toBe('HIGH');
  });

  it('returns dashboard with riskDistribution and trendDirection', async () => {
    const projects = [{ id: 'p1', name: '项目A', productLine: '产品线1' }];
    mockPrisma.project.findMany.mockResolvedValue(projects);

    const now = new Date();
    const assessments = [
      { riskLevel: 'HIGH', assessedAt: now, source: 'ai', aiInsights: '风险较高', aiEnhancedData: null },
      { riskLevel: 'MEDIUM', assessedAt: new Date(Date.now() - 86400000), source: 'rule_engine', aiInsights: null, aiEnhancedData: null },
    ];
    mockPrisma.riskAssessment.findMany.mockResolvedValue(assessments);

    const res = await request(app).get('/api/risk/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.riskDistribution).toBeDefined();
    expect(res.body.riskDistribution.HIGH).toBe(1);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].trendDirection).toBe('WORSENING');
  });
});

describe('GET /api/risk/dashboard/insights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns AI insights with improvements, deteriorations and topConcerns', async () => {
    const projects = [{ id: 'p1', name: '项目A' }];
    mockPrisma.project.findMany.mockResolvedValue(projects);

    const assessments = [
      { riskLevel: 'MEDIUM', aiInsights: '风险降低' },
      { riskLevel: 'HIGH', aiInsights: '风险较高' },
    ];
    mockPrisma.riskAssessment.findMany.mockResolvedValue(assessments);

    const res = await request(app).get('/api/risk/dashboard/insights');

    expect(res.status).toBe(200);
    expect(res.body.improvements).toHaveLength(1);
    expect(res.body.deteriorations).toHaveLength(0);
    expect(res.body.topConcerns).toBeDefined();
    expect(res.body.generatedAt).toBeDefined();
  });
});

describe('GET /api/risk/project/:projectId/comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns comparison with 2 assessments', async () => {
    const now = new Date();
    const prev = new Date(Date.now() - 86400000);
    mockPrisma.riskAssessment.findMany.mockResolvedValue([
      { riskLevel: 'HIGH', assessedAt: now, riskFactors: [{ factor: '进度延迟' }, { factor: '资源不足' }] },
      { riskLevel: 'MEDIUM', assessedAt: prev, riskFactors: [{ factor: '资源不足' }, { factor: '需求变更' }] },
    ]);

    const res = await request(app).get('/api/risk/project/p1/comparison');

    expect(res.status).toBe(200);
    expect(res.body.current.riskLevel).toBe('HIGH');
    expect(res.body.previous.riskLevel).toBe('MEDIUM');
    expect(res.body.changes.levelChange).toBe('WORSENED');
    expect(res.body.changes.newRisks).toContain('进度延迟');
    expect(res.body.changes.resolvedRisks).toContain('需求变更');
    expect(res.body.changes.persistingRisks).toContain('资源不足');
  });

  it('returns comparison with 1 assessment', async () => {
    const now = new Date();
    mockPrisma.riskAssessment.findMany.mockResolvedValue([
      { riskLevel: 'LOW', assessedAt: now, riskFactors: [{ factor: '一切正常' }] },
    ]);

    const res = await request(app).get('/api/risk/project/p1/comparison');

    expect(res.status).toBe(200);
    expect(res.body.current.riskLevel).toBe('LOW');
    expect(res.body.previous).toBeNull();
    expect(res.body.changes.levelChange).toBe('UNCHANGED');
  });

  it('returns null values when 0 assessments', async () => {
    mockPrisma.riskAssessment.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/risk/project/p1/comparison');

    expect(res.status).toBe(200);
    expect(res.body.previous).toBeNull();
    expect(res.body.current).toBeNull();
    expect(res.body.changes).toBeNull();
  });
});

describe('GET /api/risk/project/:projectId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns assessment history for existing project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', name: '项目A' });

    const assessments = [
      { id: 'ra1', riskLevel: 'HIGH', assessedAt: new Date() },
      { id: 'ra2', riskLevel: 'MEDIUM', assessedAt: new Date() },
    ];
    mockPrisma.riskAssessment.findMany.mockResolvedValue(assessments);

    const res = await request(app).get('/api/risk/project/p1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].riskLevel).toBe('HIGH');
  });

  it('returns paginated assessment history when page/pageSize provided', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', name: '项目A' });

    const assessments = [
      { id: 'ra1', riskLevel: 'HIGH', assessedAt: new Date() },
    ];
    mockPrisma.riskAssessment.findMany.mockResolvedValue(assessments);
    mockPrisma.riskAssessment.count.mockResolvedValue(5);

    const res = await request(app).get('/api/risk/project/p1?page=1&pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(5);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
  });

  it('returns 404 for missing project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/risk/project/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
  });
});

describe('DELETE /api/risk/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes assessment successfully', async () => {
    mockPrisma.riskAssessment.findUnique.mockResolvedValue({ id: 'ra1' });
    mockPrisma.riskAssessment.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/risk/ra1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.riskAssessment.delete).toHaveBeenCalledWith({ where: { id: 'ra1' } });
  });

  it('returns 404 when assessment does not exist', async () => {
    mockPrisma.riskAssessment.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/risk/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('评估记录不存在');
    expect(mockPrisma.riskAssessment.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/risk/project/:projectId/assess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildContext.mockResolvedValue({
      ruleEngineMetrics: {
        riskLevel: 'MEDIUM',
        factors: [{ factor: '进度延迟', severity: 'MEDIUM' }],
      },
    });
    mockTrimContext.mockReturnValue({});
  });

  it('AI success - creates assessment with AI source', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', name: '项目A' });

    mockCallAi.mockResolvedValue({
      content: '{"riskLevel":"HIGH","riskFactors":[{"factor":"进度延迟"}],"suggestions":["加派人手"]}',
    });
    mockParseAIResponse.mockReturnValue({
      riskLevel: 'HIGH',
      riskFactors: [{ factor: '进度延迟' }],
      suggestions: ['加派人手'],
      aiInsights: 'AI分析结果',
      trendPrediction: '上升趋势',
      criticalPathAnalysis: null,
      actionItems: [{ action: '加派人手', priority: 'HIGH' }],
      resourceBottlenecks: [],
    });
    mockValidateRiskLevel.mockReturnValue('HIGH');

    const createdAssessment = {
      id: 'ra-new',
      projectId: 'p1',
      riskLevel: 'HIGH',
      source: 'ai',
      riskFactors: [{ factor: '进度延迟' }],
      suggestions: ['加派人手'],
      aiInsights: 'AI分析结果',
      aiEnhancedData: { trendPrediction: '上升趋势' },
    };
    mockPrisma.riskAssessment.create.mockResolvedValue(createdAssessment);

    const res = await request(app).post('/api/risk/project/p1/assess');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('ai');
    expect(res.body.riskLevel).toBe('HIGH');
    expect(mockCallAi).toHaveBeenCalledTimes(1);
    expect(mockBuildContext).toHaveBeenCalledWith('p1');
    expect(mockPrisma.riskAssessment.create).toHaveBeenCalledTimes(1);
  });

  it('AI failure - fallback to rule engine', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', name: '项目A' });

    mockCallAi.mockRejectedValue(new Error('AI service unavailable'));
    mockAssessRisk.mockResolvedValue({
      riskLevel: 'MEDIUM',
      factors: [{ factor: '进度延迟' }],
      suggestions: ['调整排期'],
    });

    const createdAssessment = {
      id: 'ra-fallback',
      projectId: 'p1',
      riskLevel: 'MEDIUM',
      source: 'rule_engine',
      riskFactors: [{ factor: '进度延迟', severity: 'MEDIUM' }],
      suggestions: ['调整排期'],
      aiInsights: null,
      aiEnhancedData: null,
    };
    mockPrisma.riskAssessment.create.mockResolvedValue(createdAssessment);

    const res = await request(app).post('/api/risk/project/p1/assess');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rule_engine');
    expect(mockAssessRisk).toHaveBeenCalledWith('p1');
    expect(mockPrisma.riskAssessment.create).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/risk/project/nonexistent/assess');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
    expect(mockCallAi).not.toHaveBeenCalled();
    expect(mockPrisma.riskAssessment.create).not.toHaveBeenCalled();
  });
});
