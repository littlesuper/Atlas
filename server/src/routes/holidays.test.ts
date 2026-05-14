import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';

type AuthRequest = Request & { user?: unknown };

const { mockPrisma, mockAuditLog, mockRefreshCache, mockFetchOfficial, mockGetHolidaysForYear, mockIsYearKnown } = vi.hoisted(() => ({
  mockPrisma: {
    holiday: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        holiday: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(mockTx);
    }),
  },
  mockAuditLog: vi.fn(),
  mockRefreshCache: vi.fn().mockResolvedValue(undefined),
  mockFetchOfficial: vi.fn(),
  mockGetHolidaysForYear: vi.fn().mockReturnValue([]),
  mockIsYearKnown: vi.fn().mockReturnValue(false),
}));

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
  HolidaySource: { MANUAL_INPUT: 'MANUAL_INPUT', OFFICIAL_API: 'OFFICIAL_API', BUILT_IN: 'BUILT_IN' },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
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
  isAdmin: (req: Request) =>
    (req.user && typeof req.user === 'object' && 'permissions' in req.user
      ? (req.user as { permissions: string[] }).permissions
      : []
    ).includes('*:*'),
}));

vi.mock('../middleware/validate', () => ({
  validate: () => (req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../utils/auditLog', () => ({ auditLog: mockAuditLog }));
vi.mock('../utils/workday', () => ({ refreshHolidayCache: mockRefreshCache }));
vi.mock('../utils/holidayData', () => ({
  getHolidaysForYear: mockGetHolidaysForYear,
  isYearKnown: mockIsYearKnown,
  KNOWN_YEARS: [2025, 2026],
}));
vi.mock('../services/holidaySource', () => ({ fetchOfficialHolidays: mockFetchOfficial }));

import holidayRoutes from './holidays';

const app = express();
app.use(express.json());
app.use('/api/holidays', holidayRoutes);

const sampleHoliday = {
  id: 'hol-1',
  date: new Date('2026-01-01T00:00:00.000Z'),
  name: '元旦',
  type: 'HOLIDAY',
  year: 2026,
  source: 'BUILT_IN',
  sourceUrl: null,
  syncedAt: null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/holidays
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/holidays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all holidays when no year filter', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([sampleHoliday]);

    const res = await request(app).get('/api/holidays');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('元旦');
    expect(res.body[0].date).toBe('2026-01-01');
  });

  it('filters by year', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);

    await request(app).get('/api/holidays?year=2026');

    expect(mockPrisma.holiday.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { year: 2026 } }),
    );
  });

  it('returns 500 on database error', async () => {
    mockPrisma.holiday.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/holidays');

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/holidays/known-years
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/holidays/known-years', () => {
  it('returns known years list', async () => {
    const res = await request(app).get('/api/holidays/known-years');

    expect(res.status).toBe(200);
    expect(res.body.knownYears).toEqual([2025, 2026]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/holidays
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/holidays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a holiday and returns 201', async () => {
    mockPrisma.holiday.create.mockResolvedValue(sampleHoliday);

    const res = await request(app)
      .post('/api/holidays')
      .send({ date: '2026-01-01', name: '元旦', type: 'HOLIDAY' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('元旦');
    expect(mockRefreshCache).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it('returns 409 on duplicate date', async () => {
    mockPrisma.holiday.create.mockRejectedValue({ code: 'P2002' });

    const res = await request(app)
      .post('/api/holidays')
      .send({ date: '2026-01-01', name: '元旦', type: 'HOLIDAY' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('已存在');
  });

  it('returns 500 on other database error', async () => {
    mockPrisma.holiday.create.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/holidays')
      .send({ date: '2026-01-01', name: '元旦', type: 'HOLIDAY' });

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/holidays/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /api/holidays/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a holiday', async () => {
    mockPrisma.holiday.findUnique.mockResolvedValue(sampleHoliday);
    mockPrisma.holiday.update.mockResolvedValue({ ...sampleHoliday, name: '春节' });

    const res = await request(app)
      .put('/api/holidays/hol-1')
      .send({ name: '春节' });

    expect(res.status).toBe(200);
    expect(mockRefreshCache).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it('returns 404 when holiday does not exist', async () => {
    mockPrisma.holiday.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/holidays/nonexistent')
      .send({ name: '春节' });

    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.holiday.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .put('/api/holidays/hol-1')
      .send({ name: '春节' });

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/holidays/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/holidays/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a holiday', async () => {
    mockPrisma.holiday.findUnique.mockResolvedValue(sampleHoliday);
    mockPrisma.holiday.delete.mockResolvedValue(sampleHoliday);

    const res = await request(app).delete('/api/holidays/hol-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRefreshCache).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it('returns 404 when holiday does not exist', async () => {
    mockPrisma.holiday.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/holidays/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.holiday.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/holidays/hol-1');

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/holidays/year/:year
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/holidays/year/:year', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all holidays for a year', async () => {
    mockPrisma.holiday.deleteMany.mockResolvedValue({ count: 5 });

    const res = await request(app).delete('/api/holidays/year/2026');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toBe(5);
    expect(mockRefreshCache).toHaveBeenCalled();
  });

  it('returns 400 for invalid year', async () => {
    const res = await request(app).delete('/api/holidays/year/abc');

    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.holiday.deleteMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/holidays/year/2026');

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/holidays/generate
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/holidays/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHolidaysForYear.mockReturnValue([
      { date: '2026-01-01', name: '元旦', type: 'HOLIDAY' },
    ]);
  });

  it('generates holidays from built-in data', async () => {
    mockPrisma.holiday.count.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        holiday: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(mockTx);
    });

    const res = await request(app)
      .post('/api/holidays/generate')
      .send({ year: 2026, preferOfficial: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.source).toBe('BUILT_IN');
    expect(mockRefreshCache).toHaveBeenCalled();
  });

  it('returns 409 when data exists without overwrite', async () => {
    mockPrisma.holiday.count.mockResolvedValue(5);

    const res = await request(app)
      .post('/api/holidays/generate')
      .send({ year: 2026, preferOfficial: false, overwrite: false });

    expect(res.status).toBe(409);
    expect(res.body.existing).toBe(5);
  });

  it('returns 400 when no entries available', async () => {
    mockPrisma.holiday.count.mockResolvedValue(0);
    mockGetHolidaysForYear.mockReturnValue([]);

    const res = await request(app)
      .post('/api/holidays/generate')
      .send({ year: 2026, preferOfficial: false });

    expect(res.status).toBe(400);
  });

  it('falls back to built-in when official source fails', async () => {
    mockPrisma.holiday.count.mockResolvedValue(0);
    mockFetchOfficial.mockRejectedValue(new Error('Network error'));
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        holiday: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(mockTx);
    });

    const res = await request(app)
      .post('/api/holidays/generate')
      .send({ year: 2026, preferOfficial: true });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('BUILT_IN');
    expect(res.body.warning).toContain('回退');
  });

  it('returns 500 on database error', async () => {
    mockPrisma.holiday.count.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/holidays/generate')
      .send({ year: 2026, preferOfficial: false });

    expect(res.status).toBe(500);
  });

  it('GET known-years returns array', async () => {
    const res = await request(app).get('/api/holidays/known-years');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('POST create returns 500 on database error', async () => {
    mockPrisma.holiday.create.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/holidays')
      .send({ date: '2026-01-01', name: '元旦', type: 'PUBLIC' });

    expect(res.status).toBe(500);
  });

  it('GET holidays by year returns empty array when no holidays', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/holidays?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET holidays returns 500 on database error', async () => {
    mockPrisma.holiday.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/holidays?year=2026');

    expect(res.status).toBe(500);
  });

  it('GET holidays handles year parameter as string with leading zeros', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/holidays?year=02026');

    expect(res.status).toBe(200);
  });

  it('DELETE holiday returns 404 for non-existent holiday', async () => {
    mockPrisma.holiday.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/holidays/nonexistent-id');

    expect(res.status).toBe(404);
  });

  it('DELETE holiday returns 500 on database error', async () => {
    mockPrisma.holiday.findUnique.mockResolvedValue({ id: 'h-1', date: '2026-01-01' });
    mockPrisma.holiday.delete.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/holidays/h-1');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/holidays batch 125 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => 2000 + index))(
    'applies generated year filter %s',
    async (year) => {
      mockPrisma.holiday.findMany.mockResolvedValue([]);

      const res = await request(app).get(`/api/holidays?year=${year}`);

      expect(res.status).toBe(200);
      expect(mockPrisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { year } }),
      );
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    2020 + index,
    `https://example.com/holiday-${index}.pdf`,
  ] as const))(
    'reports generated official source status for year %s',
    async (year, paper) => {
      mockPrisma.holiday.count.mockResolvedValue(indexedCount(year));
      mockFetchOfficial.mockResolvedValue({
        papers: [paper],
        days: [
          { date: `${year}-01-01`, name: '元旦', isOffDay: true },
          { date: `${year}-02-01`, name: '调休', isOffDay: false },
        ],
      });
      mockIsYearKnown.mockReturnValue(year % 2 === 0);

      const res = await request(app).get(`/api/holidays/source-status?year=${year}`);

      expect(res.status).toBe(200);
      expect(res.body.year).toBe(year);
      expect(res.body.existing).toBe(indexedCount(year));
      expect(res.body.officialAvailable).toBe(true);
      expect(res.body.officialPapers).toEqual([paper]);
      expect(res.body.officialDaysCount).toBe(2);
      expect(res.body.builtInAvailable).toBe(year % 2 === 0);
    },
  );
});

function indexedCount(year: number) {
  return year % 7;
}
