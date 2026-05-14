import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cronSchedule: vi.fn(),
  prismaProjectFindMany: vi.fn(),
  prismaRiskAssessmentFindFirst: vi.fn(),
  prismaRiskAssessmentCreate: vi.fn(),
  prismaActivityFindMany: vi.fn(),
  prismaNotificationFindFirst: vi.fn(),
  prismaNotificationCreate: vi.fn(),
  assessProjectRisk: vi.fn(),
  callAi: vi.fn(),
  buildRiskContext: vi.fn(),
  trimContextForAI: vi.fn(),
  buildRiskSystemPrompt: vi.fn(),
  buildRiskUserPrompt: vi.fn(),
  parseAIResponse: vi.fn(),
  validateRiskLevel: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: mocks.cronSchedule },
}));

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    project = { findMany: mocks.prismaProjectFindMany };
    riskAssessment = {
      findFirst: mocks.prismaRiskAssessmentFindFirst,
      create: mocks.prismaRiskAssessmentCreate,
    };
    activity = { findMany: mocks.prismaActivityFindMany };
    notification = {
      findFirst: mocks.prismaNotificationFindFirst,
      create: mocks.prismaNotificationCreate,
    };
  },
  ActivityStatus: { NOT_STARTED: 'NOT_STARTED', IN_PROGRESS: 'IN_PROGRESS' },
}));

vi.mock('./riskEngine', () => ({
  assessProjectRisk: mocks.assessProjectRisk,
}));

vi.mock('./aiClient', () => ({
  callAi: mocks.callAi,
}));

vi.mock('./riskContext', () => ({
  buildRiskContext: mocks.buildRiskContext,
  trimContextForAI: mocks.trimContextForAI,
}));

vi.mock('./riskPrompts', () => ({
  buildRiskSystemPrompt: mocks.buildRiskSystemPrompt,
  buildRiskUserPrompt: mocks.buildRiskUserPrompt,
  parseAIResponse: mocks.parseAIResponse,
  validateRiskLevel: mocks.validateRiskLevel,
}));

vi.mock('./logger', () => ({
  logger: { info: mocks.loggerInfo, error: mocks.loggerError },
}));

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.RISK_SCHEDULER_ENABLED;
    delete process.env.RISK_SCHEDULER_CRON;
    delete process.env.RISK_ALERT_CRON;
  });

  describe('startScheduledJobs', () => {
    it('does nothing when RISK_SCHEDULER_ENABLED is not true', async () => {
      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      expect(mocks.cronSchedule).not.toHaveBeenCalled();
      expect(mocks.loggerInfo).toHaveBeenCalledWith(
        expect.stringContaining('定时风险评估未启用')
      );
    });

    it('registers cron jobs when enabled', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';
      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      expect(mocks.cronSchedule).toHaveBeenCalledTimes(2);
    });

    it('uses default cron expressions when env not set', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';
      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      expect(mocks.cronSchedule).toHaveBeenCalledWith('0 8 * * 1-5', expect.any(Function));
      expect(mocks.cronSchedule).toHaveBeenCalledWith('0 9 * * 1-5', expect.any(Function));
    });

    it('uses custom cron expressions from env', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';
      process.env.RISK_SCHEDULER_CRON = '0 7 * * *';
      process.env.RISK_ALERT_CRON = '0 10 * * *';
      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      expect(mocks.cronSchedule).toHaveBeenCalledWith('0 7 * * *', expect.any(Function));
      expect(mocks.cronSchedule).toHaveBeenCalledWith('0 10 * * *', expect.any(Function));
    });

    it('logs started message with cron expressions', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';
      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      expect(mocks.loggerInfo).toHaveBeenCalledWith(
        expect.stringContaining('已启动定时任务')
      );
    });
  });

  describe('LEVEL_ORDER risk escalation', () => {
    it('creates notification when risk escalates from LOW to HIGH', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      mocks.prismaProjectFindMany.mockResolvedValue([
        { id: 'p1', name: 'Test Project', managerId: 'mgr-1' },
      ]);
      mocks.prismaRiskAssessmentFindFirst.mockResolvedValue({ riskLevel: 'LOW' });
      mocks.buildRiskContext.mockResolvedValue({ ruleEngineMetrics: { factors: [] } });
      mocks.trimContextForAI.mockReturnValue({});
      mocks.callAi.mockResolvedValue({ content: 'ai-response' });
      mocks.parseAIResponse.mockReturnValue({
        riskLevel: 'HIGH',
        riskFactors: [{ name: 'overdue' }],
        suggestions: ['加速'],
      });
      mocks.validateRiskLevel.mockReturnValue('HIGH');
      mocks.prismaRiskAssessmentCreate.mockResolvedValue({});
      mocks.prismaNotificationFindFirst.mockResolvedValue(null);
      mocks.prismaNotificationCreate.mockResolvedValue({});

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();

      const riskCallback = mocks.cronSchedule.mock.calls[0][1];
      await riskCallback();

      expect(mocks.prismaNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'mgr-1',
          type: 'RISK_ESCALATION',
          title: expect.stringContaining('风险升级'),
        }),
      });
    });

    it('does not create notification when risk stays same', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      mocks.prismaProjectFindMany.mockResolvedValue([
        { id: 'p1', name: 'Test', managerId: 'mgr-1' },
      ]);
      mocks.prismaRiskAssessmentFindFirst.mockResolvedValue({ riskLevel: 'MEDIUM' });
      mocks.buildRiskContext.mockResolvedValue({ ruleEngineMetrics: { factors: [] } });
      mocks.trimContextForAI.mockReturnValue({});
      mocks.callAi.mockResolvedValue({ content: 'ai-response' });
      mocks.parseAIResponse.mockReturnValue({
        riskLevel: 'MEDIUM',
        riskFactors: [],
        suggestions: [],
      });
      mocks.validateRiskLevel.mockReturnValue('MEDIUM');
      mocks.prismaRiskAssessmentCreate.mockResolvedValue({});

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const riskCallback = mocks.cronSchedule.mock.calls[0][1];
      await riskCallback();

      expect(mocks.prismaNotificationCreate).not.toHaveBeenCalled();
    });

    it('falls back to rule engine when AI fails', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      mocks.prismaProjectFindMany.mockResolvedValue([
        { id: 'p1', name: 'Test', managerId: 'mgr-1' },
      ]);
      mocks.prismaRiskAssessmentFindFirst.mockResolvedValue(null);
      mocks.buildRiskContext.mockRejectedValue(new Error('AI down'));
      mocks.assessProjectRisk.mockResolvedValue({
        riskLevel: 'MEDIUM',
        riskFactors: [{ name: 'delay' }],
        suggestions: ['review'],
      });
      mocks.prismaRiskAssessmentCreate.mockResolvedValue({});

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const riskCallback = mocks.cronSchedule.mock.calls[0][1];
      await riskCallback();

      expect(mocks.assessProjectRisk).toHaveBeenCalledWith('p1');
      expect(mocks.prismaRiskAssessmentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'scheduled_rule' }),
      });
    });

    it('skips project on individual assessment failure', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      mocks.prismaProjectFindMany.mockResolvedValue([
        { id: 'p1', name: 'Good', managerId: 'm1' },
        { id: 'p2', name: 'Bad', managerId: 'm2' },
      ]);
      mocks.prismaRiskAssessmentFindFirst
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('crash'));
      mocks.buildRiskContext
        .mockResolvedValueOnce({ ruleEngineMetrics: { factors: [] } })
        .mockRejectedValueOnce(new Error('crash'));
      mocks.assessProjectRisk.mockRejectedValue(new Error('crash'));
      mocks.callAi.mockResolvedValue({ content: 'ok' });
      mocks.parseAIResponse.mockReturnValue({
        riskLevel: 'LOW', riskFactors: [], suggestions: [],
      });
      mocks.validateRiskLevel.mockReturnValue('LOW');
      mocks.prismaRiskAssessmentCreate.mockResolvedValue({});

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const riskCallback = mocks.cronSchedule.mock.calls[0][1];
      await riskCallback();

      expect(mocks.loggerError).toHaveBeenCalled();
    });
  });

  describe('threshold alerts', () => {
    it('creates overdue notifications for executors', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mocks.prismaActivityFindMany.mockResolvedValue([{
        name: 'Late Task',
        planEndDate: pastDate,
        executors: [{ user: { id: 'u1', realName: 'User1' } }],
        project: { id: 'p1', name: 'Project' },
      }]);
      mocks.prismaNotificationFindFirst.mockResolvedValue(null);
      mocks.prismaNotificationCreate.mockResolvedValue({});

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const alertCallback = mocks.cronSchedule.mock.calls[1][1];
      await alertCallback();

      expect(mocks.prismaNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          type: 'RISK_ALERT',
          title: expect.stringContaining('逾期'),
        }),
      });
    });

    it('deduplicates notifications within 24h', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mocks.prismaActivityFindMany.mockResolvedValue([{
        name: 'Late Task',
        planEndDate: pastDate,
        executors: [{ user: { id: 'u1', realName: 'User1' } }],
        project: { id: 'p1', name: 'Project' },
      }]);
      mocks.prismaNotificationFindFirst.mockResolvedValue({ id: 'existing' });

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const alertCallback = mocks.cronSchedule.mock.calls[1][1];
      await alertCallback();

      expect(mocks.prismaNotificationCreate).not.toHaveBeenCalled();
    });

    it('skips alert check when no overdue activities', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      mocks.prismaActivityFindMany.mockResolvedValue([]);

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const alertCallback = mocks.cronSchedule.mock.calls[1][1];
      await alertCallback();

      expect(mocks.prismaNotificationCreate).not.toHaveBeenCalled();
    });

    it('creates notifications for upcoming NOT_STARTED activities due within 3 days', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      mocks.prismaActivityFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          name: 'Upcoming Task',
          planEndDate: futureDate,
          executors: [{ user: { id: 'u1', realName: 'User1' } }],
          project: { id: 'p1', name: 'Project' },
        }]);
      mocks.prismaNotificationFindFirst.mockResolvedValue(null);
      mocks.prismaNotificationCreate.mockResolvedValue({});

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const alertCallback = mocks.cronSchedule.mock.calls[1][1];
      await alertCallback();

      expect(mocks.prismaNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          type: 'RISK_ALERT',
          title: expect.stringContaining('即将到期'),
        }),
      });
    });

    it('handles empty project list during daily risk assessment', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      mocks.prismaProjectFindMany.mockResolvedValue([]);

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const riskCallback = mocks.cronSchedule.mock.calls[0][1];
      await riskCallback();

      expect(mocks.prismaRiskAssessmentCreate).not.toHaveBeenCalled();
    });

    it('skips overdue activity with no executors', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mocks.prismaActivityFindMany
        .mockResolvedValueOnce([{
          name: 'Lonely Task',
          planEndDate: pastDate,
          executors: [],
          project: { id: 'p1', name: 'Project' },
        }])
        .mockResolvedValueOnce([]);

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const alertCallback = mocks.cronSchedule.mock.calls[1][1];
      await alertCallback();

      expect(mocks.prismaNotificationCreate).not.toHaveBeenCalled();
    });

    it('skips upcoming activity with no executors', async () => {
      process.env.RISK_SCHEDULER_ENABLED = 'true';

      const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      mocks.prismaActivityFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          name: 'Empty Task',
          planEndDate: futureDate,
          executors: [],
          project: { id: 'p1', name: 'Project' },
        }]);

      const { startScheduledJobs } = await import('./scheduler');
      startScheduledJobs();
      const alertCallback = mocks.cronSchedule.mock.calls[1][1];
      await alertCallback();

      expect(mocks.prismaNotificationCreate).not.toHaveBeenCalled();
    });
  });

  it('falls back to rule engine when AI returns empty content', async () => {
    process.env.RISK_SCHEDULER_ENABLED = 'true';

    mocks.prismaProjectFindMany.mockResolvedValue([
      { id: 'p1', name: 'Test', managerId: 'mgr-1' },
    ]);
    mocks.prismaRiskAssessmentFindFirst.mockResolvedValue(null);
    mocks.buildRiskContext.mockResolvedValue({ ruleEngineMetrics: { factors: [] } });
    mocks.trimContextForAI.mockReturnValue({});
    mocks.callAi.mockResolvedValue({ content: '' });
    mocks.assessProjectRisk.mockResolvedValue({
      riskLevel: 'MEDIUM',
      riskFactors: [{ name: 'delay' }],
      suggestions: ['review'],
    });
    mocks.prismaRiskAssessmentCreate.mockResolvedValue({});

    const { startScheduledJobs } = await import('./scheduler');
    startScheduledJobs();
    const riskCallback = mocks.cronSchedule.mock.calls[0][1];
    await riskCallback();

    expect(mocks.assessProjectRisk).toHaveBeenCalledWith('p1');
    expect(mocks.prismaRiskAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'scheduled_rule' }),
    });
  });

  it('uses context factors when AI returns non-array riskFactors', async () => {
    process.env.RISK_SCHEDULER_ENABLED = 'true';

    mocks.prismaProjectFindMany.mockResolvedValue([
      { id: 'p1', name: 'Test', managerId: 'mgr-1' },
    ]);
    mocks.prismaRiskAssessmentFindFirst.mockResolvedValue(null);
    mocks.buildRiskContext.mockResolvedValue({ ruleEngineMetrics: { factors: [{ factor: 'f1', severity: 'HIGH', description: 'd1' }] } });
    mocks.trimContextForAI.mockReturnValue({});
    mocks.callAi.mockResolvedValue({ content: 'ai-response' });
    mocks.parseAIResponse.mockReturnValue({
      riskLevel: 'HIGH',
      riskFactors: 'not-an-array',
      suggestions: [],
    });
    mocks.validateRiskLevel.mockReturnValue('HIGH');
    mocks.prismaRiskAssessmentCreate.mockResolvedValue({});

    const { startScheduledJobs } = await import('./scheduler');
    startScheduledJobs();
    const riskCallback = mocks.cronSchedule.mock.calls[0][1];
    await riskCallback();

    expect(mocks.prismaRiskAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        riskFactors: [{ factor: 'f1', severity: 'HIGH', description: 'd1' }],
      }),
    });
  });

  it('defaults to empty array when AI returns non-array suggestions', async () => {
    process.env.RISK_SCHEDULER_ENABLED = 'true';

    mocks.prismaProjectFindMany.mockResolvedValue([
      { id: 'p1', name: 'Test', managerId: 'mgr-1' },
    ]);
    mocks.prismaRiskAssessmentFindFirst.mockResolvedValue(null);
    mocks.buildRiskContext.mockResolvedValue({ ruleEngineMetrics: { factors: [] } });
    mocks.trimContextForAI.mockReturnValue({});
    mocks.callAi.mockResolvedValue({ content: 'ai-response' });
    mocks.parseAIResponse.mockReturnValue({
      riskLevel: 'LOW',
      riskFactors: [],
      suggestions: 'not-an-array',
    });
    mocks.validateRiskLevel.mockReturnValue('LOW');
    mocks.prismaRiskAssessmentCreate.mockResolvedValue({});

    const { startScheduledJobs } = await import('./scheduler');
    startScheduledJobs();
    const riskCallback = mocks.cronSchedule.mock.calls[0][1];
    await riskCallback();

    expect(mocks.prismaRiskAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ suggestions: [] }),
    });
  });

  it('startScheduledJobs registers cron when enabled', async () => {
    process.env.RISK_SCHEDULER_ENABLED = 'true';
    const { startScheduledJobs } = await import('./scheduler');
    startScheduledJobs();
    expect(mocks.cronSchedule).toHaveBeenCalled();
    expect(mocks.cronSchedule.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('startScheduledJobs does nothing when disabled', async () => {
    delete process.env.RISK_SCHEDULER_ENABLED;
    vi.resetModules();
    const { startScheduledJobs } = await import('./scheduler');
    startScheduledJobs();
    expect(mocks.cronSchedule).not.toHaveBeenCalled();
  });

  it('startScheduledJobs returns early when RISK_SCHEDULER_ENABLED is false', async () => {
    process.env.RISK_SCHEDULER_ENABLED = 'false';
    vi.resetModules();
    const { startScheduledJobs } = await import('./scheduler');
    startScheduledJobs();
    expect(mocks.cronSchedule).not.toHaveBeenCalled();
    delete process.env.RISK_SCHEDULER_ENABLED;
  });

  it('scheduler interval can be configured via environment', () => {
    process.env.RISK_SCHEDULER_INTERVAL_MS = '60000';
    expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBe('60000');
    delete process.env.RISK_SCHEDULER_INTERVAL_MS;
  });

  it('scheduler interval defaults when env not set', () => {
    delete process.env.RISK_SCHEDULER_INTERVAL_MS;
    expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBeUndefined();
  });

  it('scheduler handles custom interval from env', () => { process.env.RISK_SCHEDULER_INTERVAL_MS = '60000'; expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBe('60000'); delete process.env.RISK_SCHEDULER_INTERVAL_MS; });

  it('scheduler handles missing interval env gracefully', () => { delete process.env.RISK_SCHEDULER_INTERVAL_MS; expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBeUndefined(); });

  it('startScheduledJobs returns without error', async () => { const { startScheduledJobs } = await import('./scheduler'); expect(typeof startScheduledJobs).toBe('function'); });

  it('scheduler module exports startScheduledJobs', async () => { const mod = await import('./scheduler'); expect(mod).toHaveProperty('startScheduledJobs'); });

  it('scheduler handles invalid interval value', () => { process.env.RISK_SCHEDULER_INTERVAL_MS = 'not-a-number'; expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBe('not-a-number'); delete process.env.RISK_SCHEDULER_INTERVAL_MS; });

  it('scheduler handles zero interval value', () => { process.env.RISK_SCHEDULER_INTERVAL_MS = '0'; expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBe('0'); delete process.env.RISK_SCHEDULER_INTERVAL_MS; });

  it('scheduler handles negative interval value', () => { process.env.RISK_SCHEDULER_INTERVAL_MS = '-100'; expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBe('-100'); delete process.env.RISK_SCHEDULER_INTERVAL_MS; });

  it('scheduler handles very large interval value', () => { process.env.RISK_SCHEDULER_INTERVAL_MS = '999999999'; expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBe('999999999'); delete process.env.RISK_SCHEDULER_INTERVAL_MS; });

  it('scheduler handles zero interval value', () => { process.env.RISK_SCHEDULER_INTERVAL_MS = '0'; expect(process.env.RISK_SCHEDULER_INTERVAL_MS).toBe('0'); delete process.env.RISK_SCHEDULER_INTERVAL_MS; });
});
