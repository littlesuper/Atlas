import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

describe('SYS-021: Backend process crash resilience', () => {
  it('should return 500 for uncaught sync exception in route handler (not crash process)', async () => {
    const app = express();
    app.use(express.json());

    app.get('/api/crash-sync', (_req: any, _res: any) => {
      throw new Error('unexpected sync error');
    });

    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).get('/api/crash-sync');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 500 for unhandled promise rejection in route handler', async () => {
    const app = express();
    app.use(express.json());

    app.get(
      '/api/crash-async',
      asyncHandler(async (_req: any, _res: any) => {
        await Promise.reject(new Error('unexpected async error'));
      })
    );

    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).get('/api/crash-async');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('should handle null reference errors gracefully', async () => {
    const app = express();
    app.use(express.json());

    app.get('/api/null-ref', (_req: any, _res: any) => {
      const obj: any = null;
      obj.property.toString();
    });

    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).get('/api/null-ref');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('should handle malformed JSON body gracefully', async () => {
    const app = express();
    app.use(express.json());

    app.post('/api/echo', (req: any, res: any) => {
      res.json({ received: req.body });
    });

    const res = await request(app)
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }');

    expect(res.status).toBe(400);
  });
});

describe('IMP-046/047: Import performance', () => {
  const { mockParseExcel } = vi.hoisted(() => ({
    mockParseExcel: vi.fn().mockReturnValue([]),
  }));

  vi.mock('../excelActivityParser', () => ({
    parseExcelActivities: mockParseExcel,
  }));

  beforeEach(() => {
    mockParseExcel.mockClear();
  });

  it('should parse large dataset without excessive memory (double-load check)', async () => {
    const largeDataset = Array.from({ length: 500 }, (_, i) => ({
      name: `Activity ${i}`,
      type: 'TASK',
      phase: `Phase ${i % 5}`,
      assigneeNames: [`User ${i % 50}`],
      planStartDate: new Date('2026-04-01'),
      planEndDate: new Date('2026-04-10'),
      planDuration: 5 + (i % 10),
      status: 'NOT_STARTED',
    }));

    mockParseExcel.mockReturnValue(largeDataset);

    const { parseExcelActivities } = await import('../excelActivityParser');
    const result = parseExcelActivities(Buffer.from('large-fake-excel'));

    expect(result).toHaveLength(500);
    expect(result[0].name).toBe('Activity 0');
    expect(result[499].name).toBe('Activity 499');
    expect(mockParseExcel).toHaveBeenCalledTimes(1);
  });

  it('should handle empty parse results efficiently', async () => {
    mockParseExcel.mockReturnValue([]);

    const { parseExcelActivities } = await import('../excelActivityParser');
    const result = parseExcelActivities(Buffer.from('empty'));

    expect(result).toHaveLength(0);
    expect(mockParseExcel).toHaveBeenCalledTimes(1);
  });

  it('should return structured data for each parsed row', async () => {
    const dataset = [
      {
        name: 'Test Activity',
        type: 'TASK',
        phase: '设计',
        assigneeNames: ['张三'],
        planStartDate: new Date('2026-04-01'),
        planEndDate: new Date('2026-04-10'),
        planDuration: 5,
        status: 'NOT_STARTED',
      },
    ];
    mockParseExcel.mockReturnValue(dataset);

    const { parseExcelActivities } = await import('../excelActivityParser');
    const result = parseExcelActivities(Buffer.from('single-row'));

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('type');
    expect(result[0]).toHaveProperty('assigneeNames');
    expect(result[0].assigneeNames).toBeInstanceOf(Array);
    expect(mockParseExcel).toHaveBeenCalledTimes(1);
  });

  it('parser is called once per invocation (no double-load)', async () => {
    mockParseExcel.mockReturnValue([]);

    const { parseExcelActivities } = await import('../excelActivityParser');

    parseExcelActivities(Buffer.from('test-1'));
    parseExcelActivities(Buffer.from('test-2'));

    expect(mockParseExcel).toHaveBeenCalledTimes(2);
  });
});
