#!/usr/bin/env node

import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const VALID_STAGES = [5, 25, 50, 100];
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_MAX_HEALTH_MS = 1000;
const DEFAULT_MAX_ERROR_RATE = 0.01;
const DEFAULT_MAX_P95_MS = 1000;
const DEFAULT_MIN_SUCCESS_RATE = 0.99;

function usage() {
  console.log(`Atlas canary gate

Usage:
  node scripts/canary-gate.mjs --stage <5|25|50|100> [options]

Options:
  --base-url <url>              Base URL to check. Default: ${DEFAULT_BASE_URL}
  --metrics-file <path>         JSON file with errorRate, p95Ms, successRate, or healthMs.
  --max-health-ms <number>      Health endpoint latency threshold. Default: ${DEFAULT_MAX_HEALTH_MS}
  --max-error-rate <number>     Maximum acceptable error rate. Default: ${DEFAULT_MAX_ERROR_RATE}
  --max-p95-ms <number>         Maximum acceptable p95 latency in ms. Default: ${DEFAULT_MAX_P95_MS}
  --min-success-rate <number>   Minimum acceptable success rate. Default: ${DEFAULT_MIN_SUCCESS_RATE}
  --skip-health                 Skip the /api/health request. Use only for local dry-runs.
  --help                        Show this help.

Metrics file example:
  {"errorRate":0.001,"p95Ms":320,"successRate":0.999}
`);
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    maxHealthMs: DEFAULT_MAX_HEALTH_MS,
    maxErrorRate: DEFAULT_MAX_ERROR_RATE,
    maxP95Ms: DEFAULT_MAX_P95_MS,
    minSuccessRate: DEFAULT_MIN_SUCCESS_RATE,
    skipHealth: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--stage':
        options.stage = Number(next);
        index += 1;
        break;
      case '--base-url':
        options.baseUrl = next;
        index += 1;
        break;
      case '--metrics-file':
        options.metricsFile = next;
        index += 1;
        break;
      case '--max-health-ms':
        options.maxHealthMs = Number(next);
        index += 1;
        break;
      case '--max-error-rate':
        options.maxErrorRate = Number(next);
        index += 1;
        break;
      case '--max-p95-ms':
        options.maxP95Ms = Number(next);
        index += 1;
        break;
      case '--min-success-rate':
        options.minSuccessRate = Number(next);
        index += 1;
        break;
      case '--skip-health':
        options.skipHealth = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function readMetrics(filePath) {
  if (!filePath) {
    return {};
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Metrics file must contain a JSON object');
  }

  return parsed;
}

async function checkHealth(baseUrl) {
  const healthUrl = new URL('/api/health', baseUrl).toString();
  const started = performance.now();
  const response = await fetch(healthUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  const healthMs = Math.round(performance.now() - started);
  const body = await response.text();

  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    // A non-JSON health body is still useful in the failure output below.
  }

  return {
    healthMs,
    ok: response.ok && (!json || json.status === 'ok'),
    statusCode: response.status,
    status: json?.status,
    version: json?.version,
    body,
    url: healthUrl,
  };
}

function addGateResult(results, label, passed, detail) {
  results.push({ label, passed, detail });
}

function printResults(stage, baseUrl, results) {
  console.log(`Atlas canary gate: ${stage}%`);
  console.log(`Target: ${baseUrl}`);
  console.log('');

  for (const result of results) {
    const marker = result.passed ? 'PASS' : 'FAIL';
    console.log(`[${marker}] ${result.label}: ${result.detail}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    usage();
    return;
  }

  if (!VALID_STAGES.includes(options.stage)) {
    throw new Error(`--stage must be one of: ${VALID_STAGES.join(', ')}`);
  }

  requireNumber(options.maxHealthMs, '--max-health-ms');
  requireNumber(options.maxErrorRate, '--max-error-rate');
  requireNumber(options.maxP95Ms, '--max-p95-ms');
  requireNumber(options.minSuccessRate, '--min-success-rate');

  const metrics = readMetrics(options.metricsFile);
  const results = [];

  if (options.skipHealth) {
    addGateResult(results, 'health endpoint', true, 'skipped for local dry-run');
  } else {
    const health = await checkHealth(options.baseUrl);
    addGateResult(
      results,
      'health endpoint',
      health.ok,
      `${health.statusCode} status=${health.status ?? '<unknown>'} version=${
        health.version ?? '<unknown>'
      } (${health.healthMs}ms)`,
    );
    metrics.healthMs ??= health.healthMs;
  }

  if (metrics.healthMs !== undefined) {
    addGateResult(
      results,
      'health latency',
      Number(metrics.healthMs) <= options.maxHealthMs,
      `${metrics.healthMs}ms <= ${options.maxHealthMs}ms`,
    );
  }

  if (metrics.errorRate !== undefined) {
    addGateResult(
      results,
      'error rate',
      Number(metrics.errorRate) <= options.maxErrorRate,
      `${metrics.errorRate} <= ${options.maxErrorRate}`,
    );
  }

  if (metrics.p95Ms !== undefined) {
    addGateResult(
      results,
      'p95 latency',
      Number(metrics.p95Ms) <= options.maxP95Ms,
      `${metrics.p95Ms}ms <= ${options.maxP95Ms}ms`,
    );
  }

  if (metrics.successRate !== undefined) {
    addGateResult(
      results,
      'success rate',
      Number(metrics.successRate) >= options.minSuccessRate,
      `${metrics.successRate} >= ${options.minSuccessRate}`,
    );
  }

  printResults(options.stage, options.baseUrl, results);

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    console.log('');
    console.log('Canary gate failed. Do not advance to the next stage.');
    console.log('Rollback action: turn off the related Feature Flag first; if the issue is not isolated, run the rollback runbook.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Canary gate error: ${error.message}`);
  process.exitCode = 1;
});
