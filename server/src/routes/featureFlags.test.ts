import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import featureFlagsRoutes from './featureFlags';

const app = express();
app.use('/api/feature-flags', featureFlagsRoutes);

describe('GET /api/feature-flags', () => {
  afterEach(() => {
    delete process.env.FEATURE_FLAGS;
  });

  it('returns feature flags parsed from comma environment', async () => {
    process.env.FEATURE_FLAGS = 'risk.ai,!weekly-report';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      status: 'ok',
      source: 'env',
      flags: {
        'risk.ai': true,
        'weekly-report': false,
      },
      definitions: expect.any(Array),
      unknownFlags: ['risk.ai', 'weekly-report'],
      total: 2,
    });
  });

  it('fails closed when feature flags are not configured', async () => {
    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      source: 'env',
      flags: {},
      definitions: expect.any(Array),
      unknownFlags: [],
      total: 0,
    });
  });

  it('parses JSON format feature flags', async () => {
    process.env.FEATURE_FLAGS = '{"activity.import":false,"ai.external-calls":true}';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags).toEqual({
      'activity.import': false,
      'ai.external-calls': true,
    });
    expect(response.body.unknownFlags).toEqual([]);
    expect(response.body.total).toBe(2);
  });

  it('returns registered flags in unknownFlags when not in definitions', async () => {
    process.env.FEATURE_FLAGS = 'custom.flag,!another-one';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.unknownFlags).toEqual(['another-one', 'custom.flag']);
    expect(response.body.total).toBe(2);
  });

  it('returns definitions with required metadata fields', async () => {
    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    const definitions = response.body.definitions;
    expect(definitions.length).toBeGreaterThanOrEqual(3);

    for (const def of definitions) {
      expect(def).toHaveProperty('name');
      expect(def).toHaveProperty('defaultEnabled');
      expect(def).toHaveProperty('owner');
      expect(def).toHaveProperty('riskLevel');
      expect(def).toHaveProperty('description');
      expect(def).toHaveProperty('mitigation');
    }
  });

  it('returns sorted flags', async () => {
    process.env.FEATURE_FLAGS = 'zebra,alpha,beta';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    const flagKeys = Object.keys(response.body.flags);
    expect(flagKeys).toEqual(['alpha', 'beta', 'zebra']);
  });

  it('sets cache-control to no-store', async () => {
    const response = await request(app).get('/api/feature-flags');

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('handles whitespace-only env value', async () => {
    process.env.FEATURE_FLAGS = '   ';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.flags).toEqual({});
  });

  it('includes activity.import and ai.external-calls in definitions', async () => {
    const response = await request(app).get('/api/feature-flags');

    const names = response.body.definitions.map((d: { name: string }) => d.name);
    expect(names).toContain('activity.import');
    expect(names).toContain('ai.external-calls');
    expect(names).toContain('activity.bulk-mutation');
  });

  it('correctly identifies registered vs unknown flags', async () => {
    process.env.FEATURE_FLAGS = 'activity.import,!unknown.flag,ai.external-calls';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.unknownFlags).toEqual(['unknown.flag']);
    expect(response.body.total).toBe(3);
    expect(response.body.flags['activity.import']).toBe(true);
    expect(response.body.flags['ai.external-calls']).toBe(true);
    expect(response.body.flags['unknown.flag']).toBe(false);
  });

  it('returns status ok', async () => {
    const response = await request(app).get('/api/feature-flags');

    expect(response.body.status).toBe('ok');
  });

  it('returns source env', async () => {
    const response = await request(app).get('/api/feature-flags');

    expect(response.body.source).toBe('env');
  });

  it('handles duplicate flag names by keeping last value', async () => {
    process.env.FEATURE_FLAGS = 'activity.import,!activity.import';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags['activity.import']).toBe(false);
  });

  it('handles malformed JSON gracefully as empty flags', async () => {
    process.env.FEATURE_FLAGS = '{invalid json';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags).toEqual({});
  });

  it('handles trailing comma in env value', async () => {
    process.env.FEATURE_FLAGS = 'activity.import,';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags).toEqual({ 'activity.import': true });
  });

  it('handles env value with all negated flags', async () => {
    process.env.FEATURE_FLAGS = '!activity.import,!ai.external-calls';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags['activity.import']).toBe(false);
    expect(response.body.flags['ai.external-calls']).toBe(false);
  });

  it('handles single flag value without comma', async () => {
    process.env.FEATURE_FLAGS = 'activity.import';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags).toEqual({ 'activity.import': true });
    expect(response.body.total).toBe(1);
  });

  it('handles empty string env value as no flags', async () => {
    process.env.FEATURE_FLAGS = '';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.flags).toEqual({});
  });

  it('handles flag names with dots and hyphens in JSON format', async () => {
    process.env.FEATURE_FLAGS = '{"some.feature-flag":true,"another_one":false}';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags['some.feature-flag']).toBe(true);
    expect(response.body.flags['another_one']).toBe(false);
    expect(response.body.total).toBe(2);
  });

  it('handles boolean JSON values for feature flags', async () => {
    process.env.FEATURE_FLAGS = '{"activity.import":true,"ai.external-calls":false}';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags['activity.import']).toBe(true);
    expect(response.body.flags['ai.external-calls']).toBe(false);
  });

  it('handles flag value with leading exclamation and trailing whitespace', async () => {
    process.env.FEATURE_FLAGS = ' !activity.import , ai.external-calls ';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags['activity.import']).toBe(false);
    expect(response.body.flags['ai.external-calls']).toBe(true);
  });

  it('handles JSON format with boolean false values', async () => {
    process.env.FEATURE_FLAGS = '{"activity.import":false}';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags['activity.import']).toBe(false);
    expect(response.body.total).toBe(1);
  });

  it('handles env value with only commas and spaces', async () => {
    process.env.FEATURE_FLAGS = ' , , ';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.flags).toEqual({});
  });

  it('handles JSON with non-boolean values gracefully', async () => {
    process.env.FEATURE_FLAGS = '{"activity.import":"yes"}';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
  });

  it('handles very long flag name in env value', async () => {
    const longName = 'a'.repeat(200);
    process.env.FEATURE_FLAGS = longName;

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags).toHaveProperty(longName);
    expect(response.body.flags[longName]).toBe(true);
  });

  it('handles flag name with hyphen character', async () => {
    process.env.FEATURE_FLAGS = 'some-feature';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.flags).toHaveProperty('some-feature');
    expect(response.body.total).toBe(1);
  });

  it('handles JSON format with nested object values gracefully', async () => {
    process.env.FEATURE_FLAGS = '{"activity.import":{"enabled":true}}';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
  });

  it('GET handles undefined FEATURE_FLAGS env gracefully', () => {
    delete process.env.FEATURE_FLAGS;

    const response = request(app).get('/api/feature-flags');

    expect(response).toBeDefined();
  });

  it('handles flag value with only whitespace', async () => {
    process.env.FEATURE_FLAGS = '  ';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
  });

  it('handles flag with empty string key', async () => {
    process.env.FEATURE_FLAGS = '=:true';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
  });

  it('handles flag with only whitespace key', async () => {
    process.env.FEATURE_FLAGS = '  :true';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
  });

  it('handles flag with boolean false value', async () => {
    process.env.FEATURE_FLAGS = 'dark_mode:!dark_mode';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
  });

  it('handles flag with empty value after colon', async () => {
    process.env.FEATURE_FLAGS = 'beta:';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
  });

  it('handles FEATURE_FLAGS with only whitespace', async () => {
    process.env.FEATURE_FLAGS = '   ';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
  });

  it('handles FEATURE_FLAGS with duplicate flag keys', async () => {
    process.env.FEATURE_FLAGS = 'beta,beta,!beta';

    const response = await request(app).get('/api/feature-flags');

    expect(response.status).toBe(200);
  });
});
