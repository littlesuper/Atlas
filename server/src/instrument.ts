import * as Sentry from '@sentry/node';
import path from 'path';
import { readFileSync } from 'fs';

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

const getVersion = (): string => {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
};

const toSampleRate = (value: string | undefined): number => {
  if (!value) return DEFAULT_TRACES_SAMPLE_RATE;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_TRACES_SAMPLE_RATE;
  }
  return parsed;
};

const dsn = process.env.SENTRY_DSN;

if (dsn && process.env.NODE_ENV !== 'test' && !Sentry.isInitialized()) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || `atlas@${getVersion()}`,
    tracesSampleRate: toSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
  });
}
