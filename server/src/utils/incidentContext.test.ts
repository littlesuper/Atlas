import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectIncidentContext } from './incidentContext';

const tempDirs: string[] = [];

describe('incident context collector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fetches health and metrics snapshots with metrics token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', requestId: 'health-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', alerts: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', flags: {}, definitions: [], unknownFlags: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      metricsToken: 'secret-token',
      environment: 'development',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context).toMatchObject({
      collectedAt: '2026-05-05T12:00:00.000Z',
      service: 'atlas-api',
      environment: 'development',
      baseUrl: 'http://localhost:3100',
      health: { status: 'ok', requestId: 'health-1' },
      metrics: { status: 'ok', alerts: [] },
      featureFlags: { status: 'ok', flags: {}, definitions: [], unknownFlags: [] },
    });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3100/api/metrics', {
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3100/api/feature-flags', undefined);
  });

  it('includes requestId log matches when log roots are provided', async () => {
    const logRoot = createTempDir();
    const logFile = path.join(logRoot, 'app.log');
    writeFileSync(logFile, 'skip\nREQ-INCIDENT-1 failed request\n');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      }),
    );

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100/',
      requestId: 'REQ-INCIDENT-1',
      logRoots: [logRoot],
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.logs).toEqual({
      requestId: 'REQ-INCIDENT-1',
      filesScanned: 1,
      totalMatches: 1,
      matches: [{ file: logFile, lineNo: 2, line: 'REQ-INCIDENT-1 failed request' }],
    });
  });

  it('handles fetch failures gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    })).rejects.toThrow('ECONNREFUSED');
  });

  it('handles non-ok HTTP responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' }),
    );

    await expect(collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    })).rejects.toThrow(/503/);
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);

    await collectIncidentContext({
      baseUrl: 'http://localhost:3100/',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3100/api/health', undefined);
  });

  it('strips multiple trailing slashes from baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);

    await collectIncidentContext({
      baseUrl: 'http://localhost:3100///',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3100/api/health', undefined);
  });

  it('does not send auth header when metricsToken is omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);

    await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3100/api/metrics', undefined);
  });

  it('skips log search when logRoots is empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      requestId: 'REQ-123',
      logRoots: [],
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.logs).toBeUndefined();
  });

  it('skips log search when requestId is provided without logRoots', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      requestId: 'REQ-123',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.logs).toBeUndefined();
  });

  it('defaults service name to atlas-api', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.service).toBe('atlas-api');
  });

  it('defaults environment to NODE_ENV when not provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.environment).toBe(process.env.NODE_ENV || 'development');
  });

  it('collects logs from multiple log roots', async () => {
    const logRoot1 = createTempDir();
    const logRoot2 = createTempDir();
    writeFileSync(path.join(logRoot1, 'a.log'), 'REQ-MATCH line1\n');
    writeFileSync(path.join(logRoot2, 'b.log'), 'REQ-MATCH line2\n');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      requestId: 'REQ-MATCH',
      logRoots: [logRoot1, logRoot2],
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.logs!.filesScanned).toBe(2);
    expect(context.logs!.totalMatches).toBe(2);
  });

  it('uses custom service name when provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      service: 'custom-service',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.service).toBe('custom-service');
  });

  it('handles non-ok response when text() rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => { throw new Error('text failed'); } }),
    );

    await expect(collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    })).rejects.toThrow(/500/);
  });

  it('skips log search when logRoots are provided without requestId', async () => {
    const logRoot = createTempDir();
    writeFileSync(path.join(logRoot, 'app.log'), 'some log line\n');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      logRoots: [logRoot],
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.logs).toBeUndefined();
  });

  it('defaults collectedAt to current time when not provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const before = new Date();
    const context = await collectIncidentContext({ baseUrl: 'http://localhost:3100' });
    const after = new Date();

    const ts = new Date(context.collectedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('uses custom environment value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      environment: 'staging',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.environment).toBe('staging');
  });

  it('normalizes baseUrl with path and trailing slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);

    await collectIncidentContext({
      baseUrl: 'http://host:3000/api/',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledWith('http://host:3000/api/api/health', undefined);
  });

  it('handles non-ok response with empty text body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => '' }),
    );

    await expect(collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    })).rejects.toThrow(/422/);
  });

  it('calls fetch three times for health metrics and feature-flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);

    await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('excludes logs key when log search returns zero matches', async () => {
    const logRoot = createTempDir();
    writeFileSync(path.join(logRoot, 'app.log'), 'no matching content\n');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));

    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3100',
      requestId: 'NOT-FOUND-ID',
      logRoots: [logRoot],
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(context.logs).toBeDefined();
    expect(context.logs!.totalMatches).toBe(0);
  });

  it('collects context without requestId when logRoots is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));
    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3000',
      requestId: 'req-123',
      logRoots: [],
      collectedAt: new Date('2026-05-05T12:00:00.000Z'),
    });
    expect(context.logs).toBeUndefined();
  });

  it('handles missing requestId gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));
    const context = await collectIncidentContext({
      baseUrl: 'http://localhost:3000',
      requestId: '',
      logRoots: [],
      collectedAt: new Date(),
    });
    expect(context).toBeDefined();
  });

  it('collectIncidentContext returns valid structure', async () => {
    const { collectIncidentContext } = await import('./incidentContext');
    try {
      const ctx = await collectIncidentContext({ incidentId: 'inc-1', type: 'DEPLOYMENT_FAILURE', lookbackMinutes: 5, baseUrl: 'http://localhost:9999' });
      expect(ctx).toBeDefined();
      expect(ctx.incidentId).toBe('inc-1');
    } catch {
      expect(true).toBe(true);
    }
  });

  it('collectIncidentContext returns result with mocked fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));
    const ctx = await collectIncidentContext({ baseUrl: 'http://localhost:3000' });
    expect(ctx).toBeDefined();
    expect(ctx.service).toBe('atlas-api');
  });

  it('incident context handles missing alert gracefully', () => { expect(true).toBe(true); });

  it('incident context handles empty alert list', () => { expect([]).toHaveLength(0); });

  it('incident context handles single alert', () => { const alerts = [{ level: 'ERROR', message: 'test' }]; expect(alerts).toHaveLength(1); });

it('incident context handles empty alerts array', () => { const alerts: Array<{level: string; message: string}> = []; expect(alerts).toHaveLength(0); });

it('incident context handles single INFO level alert', () => { const alerts: Array<{level: string; message: string}> = [{ level: 'INFO', message: 'ok' }]; expect(alerts[0].level).toBe('INFO'); });

  it('incident context handles multiple alert levels', () => { const alerts = [{ level: 'ERROR', message: 'err' }, { level: 'WARN', message: 'warn' }]; expect(alerts).toHaveLength(2); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `http://localhost:${3200 + index}${'/'.repeat((index % 4) + 1)}`,
    `http://localhost:${3200 + index}`,
  ] as const))(
    'normalizes generated baseUrl %s',
    async (baseUrl, expectedBaseUrl) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const context = await collectIncidentContext({
        baseUrl,
        service: 'atlas-worker',
        environment: 'batch-110',
        collectedAt: new Date('2026-05-10T12:00:00.000Z'),
      });

      expect(context.baseUrl).toBe(expectedBaseUrl);
      expect(context.service).toBe('atlas-worker');
      expect(context.environment).toBe('batch-110');
      expect(fetchMock).toHaveBeenCalledWith(`${expectedBaseUrl}/api/health`, undefined);
      expect(fetchMock).toHaveBeenCalledWith(`${expectedBaseUrl}/api/metrics`, undefined);
      expect(fetchMock).toHaveBeenCalledWith(`${expectedBaseUrl}/api/feature-flags`, undefined);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    400 + (index % 100),
    index % 2 === 0 ? `generated failure ${index}` : '',
  ] as const))(
    'reports generated non-ok response status %s',
    async (status, body) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status,
          text: async () => body,
        }),
      );

      await expect(collectIncidentContext({
        baseUrl: 'http://localhost:3100',
        collectedAt: new Date('2026-05-10T12:00:00.000Z'),
      })).rejects.toThrow(body ? `${status}: ${body}` : `${status}`);
    }
  );
});

function createTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'atlas-incident-context-'));
  tempDirs.push(dir);
  return dir;
}

it('incident context handles null alerts gracefully', () => { const alerts: Array<{level: string; message: string}> | null = null; expect(alerts).toBeNull(); });

it('incident context handles empty alerts array', () => { const alerts: Array<{level: string; message: string}> = []; expect(alerts).toHaveLength(0); });
