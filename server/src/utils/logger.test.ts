import { describe, expect, it } from 'vitest';
import type pino from 'pino';
import { createLogger, REDACTED } from './logger';

function captureLogs() {
  const lines: string[] = [];
  const stream: pino.DestinationStream = {
    write: (line: string) => {
      lines.push(line);
    },
  };

  return { lines, stream };
}

describe('logger', () => {
  it('emits structured JSON with string level, timestamp, and message', () => {
    const { lines, stream } = captureLogs();
    const log = createLogger(stream, {
      level: 'info',
      isProduction: true,
      isTest: false,
      pretty: false,
    });

    log.info({ context: { action: 'health-check' } }, 'structured event');

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);

    expect(entry).toEqual(
      expect.objectContaining({
        level: 'info',
        message: 'structured event',
        context: { action: 'health-check' },
      })
    );
    expect(entry.timestamp).toEqual(expect.any(String));
  });

  it('redacts sensitive values from structured log payloads', () => {
    const { lines, stream } = captureLogs();
    const log = createLogger(stream, {
      level: 'info',
      isProduction: true,
      isTest: false,
      pretty: false,
    });

    log.info(
      {
        password: 'dummy-password-value', // pragma: allowlist secret
        token: 'access-token',
        refreshToken: 'refresh-token',
        headers: {
          authorization: 'Bearer access-token',
          cookie: 'sid=session-token',
        },
        query: {
          token: 'download-token',
        },
        context: {
          password: 'dummy-context-password', // pragma: allowlist secret
          token: 'context-token',
        },
      },
      'sensitive event'
    );

    const entry = JSON.parse(lines[0]);

    expect(entry.password).toBe(REDACTED);
    expect(entry.token).toBe(REDACTED);
    expect(entry.refreshToken).toBe(REDACTED);
    expect(entry.headers.authorization).toBe(REDACTED);
    expect(entry.headers.cookie).toBe(REDACTED);
    expect(entry.query.token).toBe(REDACTED);
    expect(entry.context.password).toBe(REDACTED);
    expect(entry.context.token).toBe(REDACTED);
    expect(JSON.stringify(entry)).not.toContain('dummy-password-value');
    expect(JSON.stringify(entry)).not.toContain('access-token');
    expect(JSON.stringify(entry)).not.toContain('download-token');
  });
});
