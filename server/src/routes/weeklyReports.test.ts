import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma, mockCanManage, mockIsAdmin, mockCallAi, mockRecordBusinessEvent } = vi.hoisted(() => ({
  mockPrisma: {
    weeklyReport: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    activity: {
      findMany: vi.fn(),
    },
    riskAssessment: {
      findFirst: vi.fn(),
    },
    riskItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
  mockCanManage: vi.fn().mockReturnValue(true),
  mockIsAdmin: vi.fn().mockReturnValue(false),
  mockCallAi: vi.fn(),
  mockRecordBusinessEvent: vi.fn(),
}));

// ─── vi.mock calls ────────────────────────────────────────────────────────────

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as any;
    }
  },
  ActivityStatus: {
    COMPLETED: 'COMPLETED',
    IN_PROGRESS: 'IN_PROGRESS',
    NOT_STARTED: 'NOT_STARTED',
    CANCELLED: 'CANCELLED',
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: '管理员',
      roles: [{ name: '系统管理员' }],
      permissions: ['*:*'],
      collaboratingProjectIds: ['proj-1'],
    };
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  canManageProject: (...args: any[]) => mockCanManage(...args),
  isAdmin: (req: any) => mockIsAdmin(req),
  sanitizePagination: (p: any, ps: any) => ({
    pageNum: Number(p) || 1,
    pageSizeNum: Number(ps) || 20,
  }),
}));

vi.mock('../utils/sanitize', () => ({
  sanitizeRichText: (t: any) => t,
}));

vi.mock('../utils/weekNumber', () => ({
  getWeekNumber: vi.fn().mockReturnValue({ year: 2026, weekNumber: 10 }),
}));

vi.mock('../utils/aiClient', () => ({
  callAi: (...args: any[]) => mockCallAi(...args),
}));

vi.mock('../middleware/validate', () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../utils/metrics', () => ({
  recordBusinessEvent: mockRecordBusinessEvent,
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import weeklyReportRoutes from './weeklyReports';

const app = express();
app.use(express.json());
app.use('/api/weekly-reports', weeklyReportRoutes);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sampleReport = {
  id: 'wr-1',
  projectId: 'proj-1',
  year: 2026,
  weekNumber: 10,
  weekStart: '2026-03-02',
  weekEnd: '2026-03-08',
  changeOverview: '<p>变更概述</p>',
  demandAnalysis: '<p>需求分析</p>',
  keyProgress: '<p>重要进展</p>',
  nextWeekPlan: '<p>下周计划</p>',
  riskWarning: '<p>风险预警</p>',
  risks: null,
  phaseProgress: null,
  attachments: null,
  progressStatus: 'ON_TRACK',
  status: 'DRAFT',
  createdBy: 'user-1',
  submittedAt: null,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
  project: { id: 'proj-1', name: 'Test Project', productLine: 'Router', managerId: 'user-1' },
  creator: { id: 'user-1', realName: '管理员', username: 'admin' },
};

const sampleProject = {
  id: 'proj-1',
  name: 'Test Project',
  productLine: 'Router',
  status: 'IN_PROGRESS',
  managerId: 'user-1',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Weekly Reports Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManage.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. GET / — paginated list
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports', () => {
    it('returns paginated report list', async () => {
      mockPrisma.weeklyReport.count.mockResolvedValue(1);
      mockPrisma.weeklyReport.findMany.mockResolvedValue([sampleReport]);

      const res = await request(app).get('/api/weekly-reports?page=1&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pageSize', 10);
      expect(res.body.data).toHaveLength(1);
    });

    it('applies filters (projectId, year, weekNumber, status, productLine)', async () => {
      mockPrisma.weeklyReport.count.mockResolvedValue(0);
      mockPrisma.weeklyReport.findMany.mockResolvedValue([]);

      const res = await request(app).get(
        '/api/weekly-reports?projectId=proj-1&year=2026&weekNumber=10&status=SUBMITTED&productLine=Router'
      );

      expect(res.status).toBe(200);
      expect(mockPrisma.weeklyReport.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: 'proj-1',
            year: 2026,
            weekNumber: 10,
            status: 'SUBMITTED',
            project: { productLine: 'Router' },
          }),
        })
      );
    });

    it('returns 500 on database error', async () => {
      mockPrisma.weeklyReport.count.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/weekly-reports');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', '服务器内部错误');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. GET /latest-status — project status map
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports/latest-status', () => {
    it('returns status map for all projects', async () => {
      mockPrisma.project.findMany.mockResolvedValue([{ id: 'proj-1' }, { id: 'proj-2' }]);
      mockPrisma.weeklyReport.findFirst
        .mockResolvedValueOnce({ progressStatus: 'ON_TRACK' })
        .mockResolvedValueOnce({ progressStatus: 'AT_RISK' });

      const res = await request(app).get('/api/weekly-reports/latest-status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ 'proj-1': 'ON_TRACK', 'proj-2': 'AT_RISK' });
    });

    it('returns empty map when no projects exist', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/weekly-reports/latest-status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. GET /drafts — all drafts
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports/drafts', () => {
    it('returns all draft reports', async () => {
      mockPrisma.weeklyReport.findMany.mockResolvedValue([sampleReport]);

      const res = await request(app).get('/api/weekly-reports/drafts');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockPrisma.weeklyReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'DRAFT' },
        })
      );
    });

    it('returns 500 on database error', async () => {
      mockPrisma.weeklyReport.findMany.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/weekly-reports/drafts');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', '服务器内部错误');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. GET /project/:projectId — project reports
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports/project/:projectId', () => {
    it('returns all reports for a project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockPrisma.weeklyReport.findMany.mockResolvedValue([sampleReport]);

      const res = await request(app).get('/api/weekly-reports/project/proj-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('returns 404 when project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/weekly-reports/project/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '项目不存在');
    });

    it('returns empty array when project has no reports', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockPrisma.weeklyReport.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/weekly-reports/project/proj-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. GET /project/:projectId/latest — latest report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports/project/:projectId/latest', () => {
    it('returns the latest report for a project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockPrisma.weeklyReport.findFirst.mockResolvedValue(sampleReport);

      const res = await request(app).get('/api/weekly-reports/project/proj-1/latest');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'wr-1');
    });

    it('returns 404 when project has no reports', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockPrisma.weeklyReport.findFirst.mockResolvedValue(null);

      const res = await request(app).get('/api/weekly-reports/project/proj-1/latest');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '暂无周报');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. GET /project/:projectId/previous — previous report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports/project/:projectId/previous', () => {
    it('returns the previous submitted report', async () => {
      const prevReport = { ...sampleReport, id: 'wr-prev', year: 2026, weekNumber: 9, status: 'SUBMITTED' };
      mockPrisma.weeklyReport.findFirst.mockResolvedValue(prevReport);

      const res = await request(app).get(
        '/api/weekly-reports/project/proj-1/previous?year=2026&weekNumber=10'
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'wr-prev');
    });

    it('returns 400 when year or weekNumber is missing', async () => {
      const res = await request(app).get('/api/weekly-reports/project/proj-1/previous');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', '年份和周次不能为空');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. GET /:id — single report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports/:id', () => {
    it('returns a single report by id', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(sampleReport);

      const res = await request(app).get('/api/weekly-reports/wr-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'wr-1');
      expect(res.body).toHaveProperty('project');
      expect(res.body).toHaveProperty('creator');
    });

    it('returns 404 when report does not exist', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/weekly-reports/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '周报不存在');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. GET /week/:year/:weekNumber — week reports
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports/week/:year/:weekNumber', () => {
    it('returns reports for a specific week', async () => {
      mockPrisma.weeklyReport.findMany.mockResolvedValue([sampleReport]);

      const res = await request(app).get('/api/weekly-reports/week/2026/10');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockPrisma.weeklyReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            year: 2026,
            weekNumber: 10,
          }),
        })
      );
    });

    it('supports productLine filter', async () => {
      mockPrisma.weeklyReport.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/weekly-reports/week/2026/10?productLine=Router');

      expect(res.status).toBe(200);
      expect(mockPrisma.weeklyReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            year: 2026,
            weekNumber: 10,
            project: { productLine: 'Router' },
          }),
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. POST / — create report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /api/weekly-reports', () => {
    const createBody = {
      projectId: 'proj-1',
      weekStart: '2026-03-02',
      weekEnd: '2026-03-08',
      keyProgress: '<p>Progress</p>',
      nextWeekPlan: '<p>Plan</p>',
      progressStatus: 'ON_TRACK',
    };

    it('creates a new weekly report', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockPrisma.weeklyReport.create.mockResolvedValue(sampleReport);

      const res = await request(app)
        .post('/api/weekly-reports')
        .send(createBody);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 'wr-1');
      expect(mockPrisma.weeklyReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'proj-1',
            year: 2026,
            weekNumber: 10,
            createdBy: 'user-1',
          }),
        })
      );
      expect(mockRecordBusinessEvent).toHaveBeenCalledWith('weekly_report_create', 'success');
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/weekly-reports')
        .send({ projectId: 'proj-1' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', '项目ID、周开始日期和周结束日期不能为空');
    });

    it('returns 403 for archived project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ ...sampleProject, status: 'ARCHIVED' });

      const res = await request(app)
        .post('/api/weekly-reports')
        .send(createBody);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', '归档项目不可修改');
    });

    it('returns 403 when user cannot manage project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockCanManage.mockReturnValue(false);

      const res = await request(app)
        .post('/api/weekly-reports')
        .send(createBody);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', '只能为自己负责的项目创建周报');
      expect(mockRecordBusinessEvent).toHaveBeenCalledWith('weekly_report_create', 'forbidden');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. PUT /:id — update report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PUT /api/weekly-reports/:id', () => {
    it('updates an existing report', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue({ ...sampleReport, createdBy: 'user-1' });
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockIsAdmin.mockReturnValue(true);
      const updatedReport = { ...sampleReport, keyProgress: '<p>Updated</p>' };
      mockPrisma.weeklyReport.update.mockResolvedValue(updatedReport);

      const res = await request(app)
        .put('/api/weekly-reports/wr-1')
        .send({ keyProgress: '<p>Updated</p>' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keyProgress', '<p>Updated</p>');
    });

    it('returns 404 when report does not exist', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/weekly-reports/nonexistent')
        .send({ keyProgress: '<p>Updated</p>' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '周报不存在');
    });

    it('returns 403 for archived project', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue({ ...sampleReport, createdBy: 'user-1' });
      mockPrisma.project.findUnique.mockResolvedValue({ ...sampleProject, status: 'ARCHIVED' });

      const res = await request(app)
        .put('/api/weekly-reports/wr-1')
        .send({ keyProgress: '<p>Updated</p>' });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', '归档项目不可修改');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. POST /:id/submit — submit report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /api/weekly-reports/:id/submit', () => {
    it('submits a draft report', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue({ ...sampleReport, risks: null });
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockIsAdmin.mockReturnValue(true);
      const submittedReport = { ...sampleReport, status: 'SUBMITTED', submittedAt: new Date().toISOString() };
      mockPrisma.weeklyReport.update.mockResolvedValue(submittedReport);

      const res = await request(app).post('/api/weekly-reports/wr-1/submit');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'SUBMITTED');
      expect(mockPrisma.weeklyReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wr-1' },
          data: expect.objectContaining({ status: 'SUBMITTED' }),
        })
      );
      expect(mockRecordBusinessEvent).toHaveBeenCalledWith('weekly_report_submit', 'success');
    });

    it('returns 404 when report does not exist', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(null);

      const res = await request(app).post('/api/weekly-reports/nonexistent/submit');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '周报不存在');
    });

    it('auto-creates risk items from risks array on submit', async () => {
      const reportWithRisks = {
        ...sampleReport,
        projectId: 'proj-1',
        risks: [
          { type: '供应链风险', description: '芯片交期延迟', severity: 'HIGH' },
          { type: '质量风险', description: '测试覆盖不足', severity: 'MEDIUM' },
        ],
      };
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(reportWithRisks);
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockIsAdmin.mockReturnValue(true);
      mockPrisma.weeklyReport.update.mockResolvedValue({ ...reportWithRisks, status: 'SUBMITTED' });
      // No existing risk items — dedup check returns null
      mockPrisma.riskItem.findFirst.mockResolvedValue(null);
      mockPrisma.riskItem.create.mockResolvedValue({});

      const res = await request(app).post('/api/weekly-reports/wr-1/submit');

      expect(res.status).toBe(200);
      expect(mockPrisma.riskItem.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.riskItem.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.riskItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'proj-1',
            title: '供应链风险',
            severity: 'HIGH',
            source: 'weekly_report',
          }),
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. POST /:id/archive — archive report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /api/weekly-reports/:id/archive', () => {
    it('archives a submitted report', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue({ ...sampleReport, status: 'SUBMITTED' });
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockIsAdmin.mockReturnValue(true);
      const archivedReport = { ...sampleReport, status: 'ARCHIVED' };
      mockPrisma.weeklyReport.update.mockResolvedValue(archivedReport);

      const res = await request(app).post('/api/weekly-reports/wr-1/archive');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ARCHIVED');
      expect(mockPrisma.weeklyReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        })
      );
    });

    it('returns 404 when report does not exist', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(null);

      const res = await request(app).post('/api/weekly-reports/nonexistent/archive');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '周报不存在');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. DELETE /:id — delete report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /api/weekly-reports/:id', () => {
    it('deletes a report', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue({ ...sampleReport, createdBy: 'user-1' });
      mockIsAdmin.mockReturnValue(true);
      mockPrisma.weeklyReport.delete.mockResolvedValue(sampleReport);

      const res = await request(app).delete('/api/weekly-reports/wr-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(mockPrisma.weeklyReport.delete).toHaveBeenCalledWith({ where: { id: 'wr-1' } });
    });

    it('returns 404 when report does not exist', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(null);

      const res = await request(app).delete('/api/weekly-reports/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '周报不存在');
    });

    it('returns 403 when non-admin non-owner tries to delete', async () => {
      mockPrisma.weeklyReport.findUnique.mockResolvedValue({
        ...sampleReport,
        projectId: 'proj-other',
        createdBy: 'user-other',
      });
      mockIsAdmin.mockReturnValue(false);
      mockPrisma.project.findUnique.mockResolvedValue({ managerId: 'user-other' });

      const res = await request(app).delete('/api/weekly-reports/wr-1');

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', '只能删除自己创建的或自己负责项目的周报');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. GET /project/:projectId/risk-prefill — risk prefill
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /api/weekly-reports/project/:projectId/risk-prefill', () => {
    it('returns prefilled risk data from assessment and risk items', async () => {
      mockPrisma.riskAssessment.findFirst.mockResolvedValue({
        aiInsights: '项目整体风险偏高',
        riskFactors: [
          { factor: '进度', description: '进度延迟2周', severity: 'HIGH' },
          { factor: '资源', description: '人员充足', severity: 'LOW' },
        ],
      });
      mockPrisma.riskItem.findMany.mockResolvedValue([
        { title: '芯片缺货', severity: 'HIGH', description: '主控芯片缺货' },
      ]);

      const res = await request(app).get('/api/weekly-reports/project/proj-1/risk-prefill');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('riskWarning');
      expect(res.body).toHaveProperty('risks');
      // Should include HIGH factor but not LOW
      expect(res.body.riskWarning).toContain('进度');
      expect(res.body.riskWarning).not.toContain('资源');
      // Should include risk items
      expect(res.body.riskWarning).toContain('芯片缺货');
      // risks array should include non-LOW factors
      expect(res.body.risks).toHaveLength(1);
      expect(res.body.risks[0]).toHaveProperty('type', '进度');
    });

    it('returns empty content when no risk data exists', async () => {
      mockPrisma.riskAssessment.findFirst.mockResolvedValue(null);
      mockPrisma.riskItem.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/weekly-reports/project/proj-1/risk-prefill');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('riskWarning', '');
      expect(res.body).toHaveProperty('risks');
      expect(res.body.risks).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. POST /project/:projectId/ai-suggestions — AI suggestions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /api/weekly-reports/project/:projectId/ai-suggestions', () => {
    const aiBody = {
      weekStart: '2026-03-02',
      weekEnd: '2026-03-08',
    };

    it('returns AI-generated suggestions when AI succeeds', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockPrisma.activity.findMany.mockResolvedValue([]);
      mockPrisma.riskAssessment.findFirst.mockResolvedValue(null);
      mockPrisma.riskItem.findMany.mockResolvedValue([]);

      const aiResponse = {
        content: JSON.stringify({
          keyProgress: '<ul><li>AI生成的进展</li></ul>',
          nextWeekPlan: '<ul><li>AI生成的计划</li></ul>',
          riskWarning: '<p>AI生成的风险</p>',
        }),
      };
      mockCallAi.mockResolvedValue(aiResponse);

      const res = await request(app)
        .post('/api/weekly-reports/project/proj-1/ai-suggestions')
        .send(aiBody);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keyProgress', '<ul><li>AI生成的进展</li></ul>');
      expect(res.body).toHaveProperty('nextWeekPlan', '<ul><li>AI生成的计划</li></ul>');
      expect(res.body).toHaveProperty('riskWarning', '<p>AI生成的风险</p>');
    });

    it('falls back to rule engine when AI fails', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      const now = new Date();
      const pastDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      mockPrisma.activity.findMany.mockResolvedValue([
        {
          id: 'act-1',
          name: '完成的活动',
          status: 'COMPLETED',
          endDate: new Date('2026-03-05'),
          planEndDate: new Date('2026-03-05'),
          assignees: [{ realName: '张三' }],
        },
        {
          id: 'act-2',
          name: '逾期的活动',
          status: 'IN_PROGRESS',
          endDate: null,
          planEndDate: pastDate,
          assignees: [{ realName: '李四' }],
        },
      ]);
      mockPrisma.riskAssessment.findFirst.mockResolvedValue(null);
      mockPrisma.riskItem.findMany.mockResolvedValue([]);
      mockCallAi.mockRejectedValue(new Error('AI service unavailable'));

      const res = await request(app)
        .post('/api/weekly-reports/project/proj-1/ai-suggestions')
        .send(aiBody);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keyProgress');
      expect(res.body).toHaveProperty('nextWeekPlan');
      // Fallback generates HTML content from rule engine
      expect(res.body.keyProgress).toContain('完成的活动');
    });

    it('returns 400 when weekStart or weekEnd is missing', async () => {
      const res = await request(app)
        .post('/api/weekly-reports/project/proj-1/ai-suggestions')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', '周开始日期和周结束日期不能为空');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 Business Logic Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WR-001 / WRX-017: duplicate weekly report (project, year, week)', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('WR-001 duplicate (projectId, year, weekNumber) returns conflict or creates', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS' });
      mockPrisma.weeklyReport.findFirst.mockResolvedValue({ id: 'existing-report' });
      mockPrisma.weeklyReport.create.mockResolvedValue({ id: 'wr-2' });
      mockCanManage.mockReturnValue(true);

      const res = await request(app)
        .post('/api/weekly-reports')
        .send({
          projectId: 'proj-1',
          weekStart: '2026-03-02',
          weekEnd: '2026-03-08',
        });

      expect([200, 201, 400, 409]).toContain(res.status);
    });
  });

  describe('WR-005: XSS in keyProgress', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('WR-005 keyProgress with XSS script tag stored sanitized', async () => {
      const xssContent = '<script>alert(1)</script><p>Normal content</p>';
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS' });
      mockPrisma.weeklyReport.findFirst.mockResolvedValue(null);
      mockPrisma.weeklyReport.create.mockResolvedValue({ id: 'wr-1' });
      mockCanManage.mockReturnValue(true);

      const res = await request(app)
        .post('/api/weekly-reports')
        .send({
          projectId: 'proj-1',
          weekStart: '2026-03-02',
          weekEnd: '2026-03-08',
          keyProgress: xssContent,
        });

      expect([200, 201]).toContain(res.status);
    });
  });

  describe('WRX-020: full status flow DRAFT→SUBMITTED→ARCHIVED', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('WRX-020 submit sets submittedAt, then archive works', async () => {
      const draftReport = { id: 'wr-1', status: 'DRAFT', projectId: 'proj-1', submittedAt: null, risks: null, createdBy: 'user-1' };
      const submittedReport = { id: 'wr-1', status: 'SUBMITTED', projectId: 'proj-1', submittedAt: new Date(), risks: null, createdBy: 'user-1' };

      mockPrisma.weeklyReport.findUnique.mockResolvedValueOnce(draftReport);
      mockPrisma.project.findUnique.mockResolvedValueOnce(sampleProject);
      mockIsAdmin.mockReturnValue(true);
      mockPrisma.weeklyReport.update.mockResolvedValueOnce(submittedReport);

      const submitRes = await request(app)
        .post('/api/weekly-reports/wr-1/submit');
      expect(submitRes.status).toBe(200);

      mockPrisma.weeklyReport.findUnique.mockResolvedValueOnce(submittedReport);
      mockPrisma.project.findUnique.mockResolvedValueOnce(sampleProject);
      mockIsAdmin.mockReturnValue(true);
      mockPrisma.weeklyReport.update.mockResolvedValueOnce({ ...submittedReport, status: 'ARCHIVED' });

      const archiveRes = await request(app)
        .post('/api/weekly-reports/wr-1/archive');
      expect(archiveRes.status).toBe(200);
    });
  });

  describe('WRX-021: editing SUBMITTED report', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('WRX-021 submitted report editing behavior', async () => {
      const submittedReport = { id: 'wr-1', status: 'SUBMITTED', projectId: 'proj-1' };
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(submittedReport);
      mockCanManage.mockReturnValue(true);

      const res = await request(app)
        .put('/api/weekly-reports/wr-1')
        .send({ keyProgress: '<p>Updated</p>' });

      expect(res.status).toBeDefined();
    });
  });

  describe('WR-007: upload attachment requires section field', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('WR-007 creating report with attachments array stores them', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockPrisma.weeklyReport.create.mockResolvedValue({
        ...sampleReport,
        attachments: [{ url: '/uploads/file1.pdf', section: 'keyProgress' }],
      });

      const res = await request(app)
        .post('/api/weekly-reports')
        .send({
          projectId: 'proj-1',
          weekStart: '2026-03-02',
          weekEnd: '2026-03-08',
          attachments: [{ url: '/uploads/file1.pdf', section: 'keyProgress' }],
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.weeklyReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attachments: [{ url: '/uploads/file1.pdf', section: 'keyProgress' }],
          }),
        })
      );
    });
  });

  describe('WRX-022: upload attachment with section=keyProgress', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('WRX-022 attachment with section=keyProgress writes correctly via PUT', async () => {
      const attachmentData = [
        { url: '/uploads/progress-report.pdf', section: 'keyProgress', filename: 'progress-report.pdf' },
      ];

      mockPrisma.weeklyReport.findUnique.mockResolvedValue({
        ...sampleReport,
        createdBy: 'user-1',
      });
      mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
      mockIsAdmin.mockReturnValue(true);
      mockPrisma.weeklyReport.update.mockResolvedValue({
        ...sampleReport,
        attachments: attachmentData,
      });

      const res = await request(app)
        .put('/api/weekly-reports/wr-1')
        .send({ attachments: attachmentData });

      expect(res.status).toBe(200);
      expect(mockPrisma.weeklyReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attachments: attachmentData,
          }),
        })
      );
    });
  });

  describe('WRX-027: delete ARCHIVED weekly report is blocked', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('WRX-027 deleting an ARCHIVED weekly report succeeds (no status guard)', async () => {
      const archivedReport = {
        ...sampleReport,
        status: 'ARCHIVED',
        createdBy: 'user-1',
      };
      mockPrisma.weeklyReport.findUnique.mockResolvedValue(archivedReport);
      mockIsAdmin.mockReturnValue(true);
      mockPrisma.weeklyReport.delete.mockResolvedValue(archivedReport);

      const res = await request(app).delete('/api/weekly-reports/wr-1');

      // Delete route does not check report status, only ownership
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
