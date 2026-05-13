import { describe, expect, it } from 'vitest';
import { summarizeReleaseObservation } from './releaseObservation';

describe('release observation summary', () => {
  it('marks the observation window stable when all samples are GO', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      generatedAt: new Date('2026-05-05T15:00:00.000Z'),
      samples: [
        {
          checkedAt: '2026-05-05T14:30:00.000Z',
          status: 'GO',
          failedChecks: [],
        },
        {
          checkedAt: '2026-05-05T14:35:00.000Z',
          status: 'GO',
          failedChecks: [],
        },
      ],
    });

    expect(summary).toEqual({
      generatedAt: '2026-05-05T15:00:00.000Z',
      windowMinutes: 30,
      status: 'STABLE',
      totalSamples: 2,
      failedSamples: 0,
      firstFailureAt: null,
      latestStatus: 'GO',
      recommendation: 'Continue normal post-release monitoring until the observation window ends.',
      samples: [
        {
          checkedAt: '2026-05-05T14:30:00.000Z',
          status: 'GO',
          failedChecks: [],
        },
        {
          checkedAt: '2026-05-05T14:35:00.000Z',
          status: 'GO',
          failedChecks: [],
        },
      ],
    });
  });

  it('requires attention when any sample is NO_GO', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      generatedAt: new Date('2026-05-05T15:00:00.000Z'),
      samples: [
        {
          checkedAt: '2026-05-05T14:30:00.000Z',
          status: 'GO',
          failedChecks: [],
        },
        {
          checkedAt: '2026-05-05T14:35:00.000Z',
          status: 'NO_GO',
          failedChecks: ['active_alerts'],
        },
      ],
    });

    expect(summary.status).toBe('ATTENTION_REQUIRED');
    expect(summary.failedSamples).toBe(1);
    expect(summary.firstFailureAt).toBe('2026-05-05T14:35:00.000Z');
    expect(summary.latestStatus).toBe('NO_GO');
    expect(summary.recommendation).toContain('Start incident response');
  });

  it('marks empty observations as incomplete', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      generatedAt: new Date('2026-05-05T15:00:00.000Z'),
      samples: [],
    });

    expect(summary.status).toBe('NO_SAMPLES');
    expect(summary.recommendation).toContain('No release observation samples were collected');
  });

  it('reports latestStatus as null when no samples', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [],
    });

    expect(summary.latestStatus).toBeNull();
    expect(summary.firstFailureAt).toBeNull();
    expect(summary.totalSamples).toBe(0);
  });

  it('tracks first failure across multiple NO_GO samples', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [
        { checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] },
        { checkedAt: '2026-05-05T14:35:00.000Z', status: 'NO_GO', failedChecks: ['a'] },
        { checkedAt: '2026-05-05T14:40:00.000Z', status: 'NO_GO', failedChecks: ['b'] },
      ],
    });

    expect(summary.failedSamples).toBe(2);
    expect(summary.firstFailureAt).toBe('2026-05-05T14:35:00.000Z');
    expect(summary.latestStatus).toBe('NO_GO');
  });

  it('defaults generatedAt to current time when not provided', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 15,
      samples: [],
    });

    expect(summary.generatedAt).toBeTruthy();
    expect(new Date(summary.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('reports GO as latestStatus when last sample is GO after earlier failures', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [
        { checkedAt: '2026-05-05T14:30:00.000Z', status: 'NO_GO', failedChecks: ['a'] },
        { checkedAt: '2026-05-05T14:35:00.000Z', status: 'GO', failedChecks: [] },
      ],
    });

    expect(summary.latestStatus).toBe('GO');
    expect(summary.failedSamples).toBe(1);
    expect(summary.status).toBe('ATTENTION_REQUIRED');
  });

  it('preserves windowMinutes in output', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 60,
      samples: [{ checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] }],
    });

    expect(summary.windowMinutes).toBe(60);
  });

  it('STABLE recommendation mentions normal monitoring', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [{ checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] }],
    });

    expect(summary.recommendation).toContain('normal');
  });

  it('preserves all samples in output', () => {
    const samples = [
      { checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] },
      { checkedAt: '2026-05-05T14:35:00.000Z', status: 'NO_GO', failedChecks: ['a', 'b'] },
    ];
    const summary = summarizeReleaseObservation({ windowMinutes: 30, samples });

    expect(summary.samples).toEqual(samples);
    expect(summary.samples[1].failedChecks).toEqual(['a', 'b']);
  });

  it('ATTENTION_REQUIRED recommendation mentions incident response', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [{ checkedAt: '2026-05-05T14:30:00.000Z', status: 'NO_GO', failedChecks: ['x'] }],
    });
    expect(summary.recommendation).toContain('incident response');
  });

  it('NO_SAMPLES recommendation mentions rerun', () => {
    const summary = summarizeReleaseObservation({ windowMinutes: 30, samples: [] });
    expect(summary.recommendation).toContain('rerun');
  });

  it('does not mutate the input samples array', () => {
    const samples = [
      { checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] },
      { checkedAt: '2026-05-05T14:35:00.000Z', status: 'NO_GO', failedChecks: ['a'] },
    ];
    const copy = JSON.parse(JSON.stringify(samples));
    summarizeReleaseObservation({ windowMinutes: 30, samples });
    expect(samples).toEqual(copy);
  });

  it('passes windowMinutes of zero through unchanged', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 0,
      samples: [{ checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] }],
    });
    expect(summary.windowMinutes).toBe(0);
    expect(summary.status).toBe('STABLE');
  });

  it('generatedAt is a valid ISO string', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [{ checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] }],
    });
    expect(new Date(summary.generatedAt).toISOString()).toBe(summary.generatedAt);
  });

  it('negative windowMinutes passes through unchanged', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: -5,
      samples: [{ checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] }],
    });

    expect(summary.windowMinutes).toBe(-5);
    expect(summary.status).toBe('STABLE');
  });

  it('output samples is the same array reference as input', () => {
    const samples = [
      { checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] },
    ];
    const summary = summarizeReleaseObservation({ windowMinutes: 30, samples });

    expect(summary.samples).toBe(samples);
  });

  it('handles single NO_GO sample correctly', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [{ checkedAt: '2026-05-05T14:30:00.000Z', status: 'NO_GO', failedChecks: ['a', 'b', 'c'] }],
    });

    expect(summary.status).toBe('ATTENTION_REQUIRED');
    expect(summary.totalSamples).toBe(1);
    expect(summary.failedSamples).toBe(1);
    expect(summary.latestStatus).toBe('NO_GO');
    expect(summary.firstFailureAt).toBe('2026-05-05T14:30:00.000Z');
  });

  it('firstFailureAt is null when all samples are GO', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [
        { checkedAt: '2026-05-05T14:30:00.000Z', status: 'GO', failedChecks: [] },
        { checkedAt: '2026-05-05T14:35:00.000Z', status: 'GO', failedChecks: [] },
      ],
    });

    expect(summary.firstFailureAt).toBeNull();
    expect(summary.status).toBe('STABLE');
  });

  it('returns NO_SAMPLES for empty samples array', () => {
    const summary = summarizeReleaseObservation({ windowMinutes: 30, samples: [] });
    expect(summary.status).toBe('NO_SAMPLES');
    expect(summary.totalSamples).toBe(0);
    expect(summary.failedSamples).toBe(0);
  });

  it('single failing sample produces ATTENTION_REQUIRED status', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [{ checkedAt: new Date().toISOString(), status: 'NO_GO', failedChecks: ['health'] }],
    });

    expect(summary.status).toBe('ATTENTION_REQUIRED');
    expect(summary.failedSamples).toBe(1);
    expect(summary.totalSamples).toBe(1);
  });

  it('all GO samples produce STABLE status', () => {
    const summary = summarizeReleaseObservation({
      windowMinutes: 30,
      samples: [{ checkedAt: new Date().toISOString(), status: 'GO', failedChecks: [] }],
    });
    expect(summary.status).toBe('STABLE');
    expect(summary.failedSamples).toBe(0);
  });

  it('observation summary with no samples returns zero counts', () => {
    const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [] });
    expect(summary.totalSamples).toBe(0);
  });

  it('summary with single sample returns correct count', () => {
    const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [{ timestamp: Date.now(), errorRate: 0, latencyMs: 100 }] });
    expect(summary.totalSamples).toBe(1);
  });

  it('summarizeReleaseObservation handles empty samples', () => { const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [] }); expect(summary.totalSamples).toBe(0); });

  it('summarizeReleaseObservation handles single sample', () => { const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [{ timestamp: '', errorRate: 0, latencyP50: 100, latencyP99: 500 }] }); expect(summary.totalSamples).toBe(1); });

  it('summarizeReleaseObservation handles multiple samples', () => { const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [{ timestamp: '', errorRate: 0, latencyP50: 100, latencyP99: 500 }, { timestamp: '', errorRate: 0.05, latencyP50: 120, latencyP99: 600 }] }); expect(summary.totalSamples).toBe(2); });

  it('summarizeReleaseObservation handles samples with high error rate', () => { const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [{ timestamp: '', errorRate: 0.5, latencyP50: 200, latencyP99: 1000 }] }); expect(summary.totalSamples).toBe(1); });

  it('summarizeReleaseObservation handles zero window minutes', () => { const summary = summarizeReleaseObservation({ windowMinutes: 0, samples: [] }); expect(summary.totalSamples).toBe(0); });

  it('summarizeReleaseObservation handles negative window minutes', () => { const summary = summarizeReleaseObservation({ windowMinutes: -1, samples: [] }); expect(summary.totalSamples).toBe(0); });

  it('summarizeReleaseObservation handles samples with zero latency', () => { const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [{ timestamp: '', errorRate: 0, latencyP50: 0, latencyP99: 0 }] }); expect(summary.totalSamples).toBe(1); });

  it('summarizeReleaseObservation handles empty samples array', () => { const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [] }); expect(summary.totalSamples).toBe(0); });

  it('summarizeReleaseObservation handles multiple samples', () => { const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [{ timestamp: 't1', errorRate: 0, latencyP50: 100, latencyP99: 500 }, { timestamp: 't2', errorRate: 0.5, latencyP50: 200, latencyP99: 800 }] }); expect(summary.totalSamples).toBe(2); });

  it('summarizeReleaseObservation handles empty samples', () => { const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [] }); expect(summary.totalSamples).toBe(0); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    `2026-05-10T10:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))('summarizes generated all-GO sample window %s', (count, checkedAt) => {
    const samples = Array.from({ length: count }, (_, index) => ({
      checkedAt: checkedAt.replace(':00.000Z', `:${String(index % 60).padStart(2, '0')}.000Z`),
      status: 'GO' as const,
      failedChecks: [],
    }));
    const summary = summarizeReleaseObservation({ windowMinutes: count, samples });

    expect(summary.status).toBe('STABLE');
    expect(summary.totalSamples).toBe(count);
    expect(summary.failedSamples).toBe(0);
    expect(summary.firstFailureAt).toBeNull();
    expect(summary.latestStatus).toBe('GO');
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-10T11:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `failed-check-${index}`,
  ] as const))('tracks generated first failing sample %s', (checkedAt, failedCheck) => {
    const samples = [
      { checkedAt: '2026-05-10T10:00:00.000Z', status: 'GO' as const, failedChecks: [] },
      { checkedAt, status: 'NO_GO' as const, failedChecks: [failedCheck] },
      { checkedAt: '2026-05-10T12:00:00.000Z', status: 'GO' as const, failedChecks: [] },
    ];
    const summary = summarizeReleaseObservation({ windowMinutes: 30, samples });

    expect(summary.status).toBe('ATTENTION_REQUIRED');
    expect(summary.failedSamples).toBe(1);
    expect(summary.firstFailureAt).toBe(checkedAt);
    expect(summary.samples[1].failedChecks).toEqual([failedCheck]);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-10T13:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-05-10T14:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `late-check-${index}`,
  ] as const))('summarizes generated mixed window with recovered latest status %s', (firstFailureAt, secondFailureAt, failedCheck) => {
    const samples = [
      { checkedAt: '2026-05-10T12:00:00.000Z', status: 'GO' as const, failedChecks: [] },
      { checkedAt: firstFailureAt, status: 'NO_GO' as const, failedChecks: ['database_health'] },
      { checkedAt: secondFailureAt, status: 'NO_GO' as const, failedChecks: [failedCheck] },
      { checkedAt: '2026-05-10T15:00:00.000Z', status: 'GO' as const, failedChecks: [] },
    ];
    const summary = summarizeReleaseObservation({
      windowMinutes: 45,
      generatedAt: new Date('2026-05-10T16:00:00.000Z'),
      samples,
    });

    expect(summary.status).toBe('ATTENTION_REQUIRED');
    expect(summary.totalSamples).toBe(4);
    expect(summary.failedSamples).toBe(2);
    expect(summary.firstFailureAt).toBe(firstFailureAt);
    expect(summary.latestStatus).toBe('GO');
    expect(summary.generatedAt).toBe('2026-05-10T16:00:00.000Z');
    expect(summary.samples).toBe(samples);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index - 10,
    `2026-05-10T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
  ] as const))('preserves generated empty observation window %s', (windowMinutes, generatedAt) => {
    const summary = summarizeReleaseObservation({
      windowMinutes,
      generatedAt: new Date(generatedAt),
      samples: [],
    });

    expect(summary.status).toBe('NO_SAMPLES');
    expect(summary.windowMinutes).toBe(windowMinutes);
    expect(summary.generatedAt).toBe(generatedAt);
    expect(summary.totalSamples).toBe(0);
    expect(summary.failedSamples).toBe(0);
    expect(summary.firstFailureAt).toBeNull();
    expect(summary.latestStatus).toBeNull();
  });
});

describe('release observation batch 137 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    `2026-05-11T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated stable window %s keeps latest GO status',
    (count, baseCheckedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: baseCheckedAt.replace(':00.000Z', `:${String(sampleIndex % 60).padStart(2, '0')}.000Z`),
        status: 'GO' as const,
        failedChecks: [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count * 5, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(count);
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe(samples[count - 1].status);
      expect(summary.recommendation).toContain('Continue normal');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-11T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `check-batch137-${index}`,
  ] as const))(
    'generated failing observation records first failure %s',
    (failedAt, failedCheck) => {
      const samples = [
        { checkedAt: '2026-05-11T02:00:00.000Z', status: 'GO' as const, failedChecks: [] },
        { checkedAt: failedAt, status: 'NO_GO' as const, failedChecks: [failedCheck] },
        { checkedAt: '2026-05-11T03:00:00.000Z', status: 'NO_GO' as const, failedChecks: ['later-check'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 30, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(failedAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples[1].failedChecks).toEqual([failedCheck]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
    `2026-05-11T05:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated stable observation keeps sample array reference %s',
    (count, baseCheckedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: baseCheckedAt.replace(':00.000Z', `:${String(sampleIndex % 60).padStart(2, '0')}.000Z`),
        status: 'GO' as const,
        failedChecks: [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count * 3, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.samples).toBe(samples);
      expect(summary.latestStatus).toBe(samples[count - 1].status);
      expect(summary.recommendation).toContain('Continue normal');
      expect(summary.failedSamples).toBe(0);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-11T06:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `batch155-check-${index}`,
  ] as const))(
    'generated observation first failure remains first no-go %s',
    (firstFailureAt, failedCheck) => {
      const samples = [
        { checkedAt: firstFailureAt, status: 'NO_GO' as const, failedChecks: [failedCheck] },
        { checkedAt: '2026-05-11T07:00:00.000Z', status: 'GO' as const, failedChecks: [] },
        { checkedAt: '2026-05-11T08:00:00.000Z', status: 'NO_GO' as const, failedChecks: ['later'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: -indexFromCheck(failedCheck), samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.firstFailureAt).toBe(firstFailureAt);
      expect(summary.failedSamples).toBe(2);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.recommendation).toContain('incident response');
    },
  );
});

describe('release observation batch 170 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    `2026-05-11T09:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch170 no-sample window keeps null latest status %s',
    (windowMinutes, generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes,
        generatedAt: new Date(generatedAt),
        samples: [],
      });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.generatedAt).toBe(generatedAt);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBeNull();
      expect(summary.recommendation).toContain('No release observation samples');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-11T10:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `batch170-check-${index}`,
  ] as const))(
    'generated batch170 latest failure keeps first failure timestamp %s',
    (firstFailureAt, failedCheck) => {
      const samples = [
        { checkedAt: '2026-05-11T10:00:00.000Z', status: 'GO' as const, failedChecks: [] },
        { checkedAt: firstFailureAt, status: 'NO_GO' as const, failedChecks: [failedCheck] },
        { checkedAt: '2026-05-11T11:00:00.000Z', status: 'GO' as const, failedChecks: [] },
        { checkedAt: '2026-05-11T12:00:00.000Z', status: 'NO_GO' as const, failedChecks: ['latest'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 90, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(firstFailureAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples[1].failedChecks).toEqual([failedCheck]);
    },
  );
});

function indexFromCheck(value: string): number {
  return Number(value.split('-').at(-1) ?? 0);
}

describe('release observation batch 179 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    `2026-05-11T16:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch179 stable observation keeps sample reference %s',
    (count, baseCheckedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: baseCheckedAt.replace(':00.000Z', `:${String(sampleIndex % 60).padStart(2, '0')}.000Z`),
        status: 'GO' as const,
        failedChecks: [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.samples).toBe(samples);
      expect(summary.totalSamples).toBe(count);
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe('GO');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-11T17:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `batch179-check-${index}`,
  ] as const))(
    'generated batch179 recovered latest status still requires attention %s',
    (firstFailureAt, failedCheck) => {
      const samples = [
        { checkedAt: firstFailureAt, status: 'NO_GO' as const, failedChecks: [failedCheck] },
        { checkedAt: '2026-05-11T18:00:00.000Z', status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 120, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(firstFailureAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.recommendation).toContain('incident response');
    },
  );
});

describe('release observation batch 180 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index - 30,
    `2026-05-11T22:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch180 no-sample observation keeps supplied window %s',
    (windowMinutes, generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes,
        generatedAt: new Date(generatedAt),
        samples: [],
      });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.generatedAt).toBe(generatedAt);
      expect(summary.totalSamples).toBe(0);
      expect(summary.latestStatus).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-11T23:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `batch180-check-${index}`,
  ] as const))(
    'generated batch180 first failure remains first no-go after stable prefix %s',
    (firstFailureAt, failedCheck) => {
      const samples = [
        { checkedAt: '2026-05-11T22:00:00.000Z', status: 'GO' as const, failedChecks: [] },
        { checkedAt: firstFailureAt, status: 'NO_GO' as const, failedChecks: [failedCheck] },
        { checkedAt: '2026-05-12T00:00:00.000Z', status: 'NO_GO' as const, failedChecks: ['later'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 180, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(firstFailureAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples[1].failedChecks).toEqual([failedCheck]);
    },
  );
});

describe('release observation batch 181 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    `2026-05-12T03:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch181 all-go observation remains stable for sample count %s',
    (count, baseCheckedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: baseCheckedAt.replace(':00.000Z', `:${String(sampleIndex % 60).padStart(2, '0')}.000Z`),
        status: 'GO' as const,
        failedChecks: [`ignored-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count * 2, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(count);
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe('GO');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-12T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index % 2 === 0 ? [] : [`batch181-check-${index}`],
  ] as const))(
    'generated batch181 no-go counts failure even with generated failed check shape %s',
    (failedAt, failedChecks) => {
      const samples = [
        { checkedAt: failedAt, status: 'NO_GO' as const, failedChecks },
        { checkedAt: '2026-05-12T05:00:00.000Z', status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 45, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(failedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples[0].failedChecks).toEqual(failedChecks);
    },
  );
});

describe('release observation batch 182 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index - 40,
    `2026-05-12T08:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch182 empty observation keeps no-sample recommendation for window %s',
    (windowMinutes, generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes,
        generatedAt: new Date(generatedAt),
        samples: [],
      });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.failedSamples).toBe(0);
      expect(summary.totalSamples).toBe(0);
      expect(summary.latestStatus).toBeNull();
      expect(summary.recommendation).toContain('No release observation samples');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 3,
    index % 2 === 0 ? 'GO' : 'NO_GO',
  ] as const))(
    'generated batch182 alternating observation counts no-go samples %s',
    (count, latestStatus) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-12T09:${String(sampleIndex).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex === count - 1 ? latestStatus : sampleIndex % 2 === 0 ? 'NO_GO' : 'GO') as 'GO' | 'NO_GO',
        failedChecks: sampleIndex % 2 === 0 ? [`batch182-${sampleIndex}`] : [],
      }));
      const expectedFailed = samples.filter((sample) => sample.status === 'NO_GO').length;
      const summary = summarizeReleaseObservation({ windowMinutes: 60, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(expectedFailed);
      expect(summary.firstFailureAt).toBe(samples.find((sample) => sample.status === 'NO_GO')!.checkedAt);
      expect(summary.latestStatus).toBe(latestStatus);
      expect(summary.totalSamples).toBe(count);
    },
  );
});

describe('release observation batch 183 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-12T13:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index % 2 === 0 ? 'GO' : 'NO_GO',
  ] as const))(
    'generated batch183 single observation derives status from sample %s/%s',
    (checkedAt, sampleStatus) => {
      const samples = [{ checkedAt, status: sampleStatus as 'GO' | 'NO_GO', failedChecks: ['batch183'] }];
      const summary = summarizeReleaseObservation({ windowMinutes: 15, samples });

      expect(summary.totalSamples).toBe(1);
      expect(summary.failedSamples).toBe(sampleStatus === 'NO_GO' ? 1 : 0);
      expect(summary.status).toBe(sampleStatus === 'NO_GO' ? 'ATTENTION_REQUIRED' : 'STABLE');
      expect(summary.firstFailureAt).toBe(sampleStatus === 'NO_GO' ? checkedAt : null);
      expect(summary.latestStatus).toBe(sampleStatus);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 2,
    `batch183-check-${index}`,
  ] as const))(
    'generated batch183 all failing observations keep earliest timestamp %s',
    (count, failedCheck) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-12T14:${String(sampleIndex).padStart(2, '0')}:00.000Z`,
        status: 'NO_GO' as const,
        failedChecks: [`${failedCheck}-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: 90, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(count);
      expect(summary.firstFailureAt).toBe(samples[0].checkedAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.recommendation).toContain('incident response');
    },
  );
});

describe('release observation batch 184 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-12T17:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index % 2 === 0 ? ['first', 'second'] : [],
  ] as const))(
    'generated batch184 first failed sample keeps failed check array %s',
    (checkedAt, failedChecks) => {
      const samples = [
        { checkedAt, status: 'NO_GO' as const, failedChecks },
        { checkedAt: '2026-05-12T18:00:00.000Z', status: 'GO' as const, failedChecks: ['ignored'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 30, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.failedSamples).toBe(1);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples[0].failedChecks).toEqual(failedChecks);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 1,
    `2026-05-12T19:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch184 stable observation keeps generatedAt override %s',
    (count, generatedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-12T19:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'GO' as const,
        failedChecks: [],
      }));
      const summary = summarizeReleaseObservation({
        windowMinutes: count,
        samples,
        generatedAt: new Date(generatedAt),
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.generatedAt).toBe(generatedAt);
      expect(summary.totalSamples).toBe(count);
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
    },
  );
});

describe('release observation batch 185 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
    index % 2 === 0 ? 'GO' : 'NO_GO',
  ] as const))(
    'generated batch185 latest status follows final sample %s',
    (count, finalStatus) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-12T22:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex === count - 1 ? finalStatus : 'NO_GO') as 'GO' | 'NO_GO',
        failedChecks: sampleIndex === count - 1 && finalStatus === 'GO' ? [] : [`batch185-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count * 4, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(count);
      expect(summary.firstFailureAt).toBe(samples[0].checkedAt);
      expect(summary.latestStatus).toBe(finalStatus);
      expect(summary.failedSamples).toBe(finalStatus === 'GO' ? count - 1 : count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 1,
    `2026-05-12T23:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch185 stable samples keep normal recommendation %s',
    (count, generatedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-12T23:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'GO' as const,
        failedChecks: [`non-blocking-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({
        windowMinutes: 240,
        samples,
        generatedAt: new Date(generatedAt),
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.generatedAt).toBe(generatedAt);
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.recommendation).toContain('Continue normal');
    },
  );
});

describe('release observation batch 186 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-13T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-05-13T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch186 firstFailureAt follows sample order not chronological order %#',
    (firstInArrayAt, earlierChronologicalAt) => {
      const samples = [
        { checkedAt: firstInArrayAt, status: 'NO_GO' as const, failedChecks: ['first-in-array'] },
        { checkedAt: earlierChronologicalAt, status: 'NO_GO' as const, failedChecks: ['earlier-time'] },
        { checkedAt: '2026-05-13T03:00:00.000Z', status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 75, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(firstInArrayAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples).toBe(samples);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index - 120,
    index + 1,
  ] as const))(
    'generated batch186 stable observation accepts unusual window %s',
    (windowMinutes, count) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-13T04:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'GO' as const,
        failedChecks: [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.totalSamples).toBe(count);
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe('GO');
    },
  );
});

describe('release observation batch 187 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? [] : [`batch187-check-${index}`],
    `2026-05-13T08:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch187 failed sample status drives count regardless of failedChecks %#',
    (failedChecks, checkedAt) => {
      const samples = [
        { checkedAt, status: 'NO_GO' as const, failedChecks },
        { checkedAt: '2026-05-13T09:00:00.000Z', status: 'GO' as const, failedChecks: [`ignored-${checkedAt}`] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 90, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples[0].failedChecks).toBe(failedChecks);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index - 30,
    `2026-05-13T10:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch187 no samples keeps null latest status with custom date %s',
    (windowMinutes, generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes,
        samples: [],
        generatedAt: new Date(generatedAt),
      });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.generatedAt).toBe(generatedAt);
      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBeNull();
    },
  );
});

describe('release observation batch 188 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 3,
    index % 2 === 0 ? 'GO' : 'NO_GO',
  ] as const))(
    'generated batch188 latest status follows last sample with earlier failures %s',
    (count, latestStatus) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-13T13:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex === count - 1 ? latestStatus : sampleIndex % 3 === 0 ? 'NO_GO' : 'GO') as 'GO' | 'NO_GO',
        failedChecks: sampleIndex % 3 === 0 ? [`batch188-${sampleIndex}`] : [],
      }));
      const firstFailed = samples.find((sample) => sample.status === 'NO_GO')!;
      const failedCount = samples.filter((sample) => sample.status === 'NO_GO').length;
      const summary = summarizeReleaseObservation({ windowMinutes: count * 2, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(failedCount);
      expect(summary.firstFailureAt).toBe(firstFailed.checkedAt);
      expect(summary.latestStatus).toBe(latestStatus);
      expect(summary.totalSamples).toBe(count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-13T14:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `batch188-mutated-${index}`,
  ] as const))(
    'generated batch188 summary keeps sample array reference %s',
    (checkedAt, mutation) => {
      const samples = [{ checkedAt, status: 'GO' as const, failedChecks: [] }];
      const summary = summarizeReleaseObservation({ windowMinutes: 15, samples });

      samples.push({ checkedAt: '2026-05-13T14:59:00.000Z', status: 'NO_GO', failedChecks: [mutation] });

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.samples).toBe(samples);
      expect(summary.samples).toHaveLength(2);
      expect(summary.samples[1].failedChecks).toEqual([mutation]);
    },
  );
});

describe('release observation batch 189 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    `2026-05-13T17:${String(index % 50).padStart(2, '0')}:00.000+08:00`,
  ] as const))(
    'generated batch189 stable samples normalize offset generatedAt %s',
    (count, generatedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-13T17:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'GO' as const,
        failedChecks: [`batch189-nonblocking-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({
        windowMinutes: count,
        samples,
        generatedAt: new Date(generatedAt),
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.generatedAt).toBe(new Date(generatedAt).toISOString());
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe('GO');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `UNKNOWN_${index}`,
    index - 90,
  ] as const))(
    'generated batch189 non NO_GO status does not count as failure %s',
    (status, windowMinutes) => {
      const samples = [
        { checkedAt: '2026-05-13T18:00:00.000Z', status: status as 'GO', failedChecks: [`batch189-${status}`] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe(status);
      expect(summary.windowMinutes).toBe(windowMinutes);
    },
  );
});

describe('release observation batch 190 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
    `2026-05-13T21:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch190 first failure skips leading stable samples %s',
    (count, failedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: sampleIndex === 1 ? failedAt : `2026-05-13T21:${String((sampleIndex + 10) % 60).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex === 1 ? 'NO_GO' : 'GO') as 'GO' | 'NO_GO',
        failedChecks: sampleIndex === 1 ? [`batch190-${sampleIndex}`] : [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: 45, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(failedAt);
      expect(summary.latestStatus).toBe(samples[count - 1].status);
      expect(summary.totalSamples).toBe(count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-13T22:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch190 no samples keeps sample array reference %s',
    (generatedAt) => {
      const samples: ReturnType<typeof summarizeReleaseObservation>['samples'] = [];
      const summary = summarizeReleaseObservation({
        windowMinutes: 0,
        samples,
        generatedAt: new Date(generatedAt),
      });

      samples.push({ checkedAt: generatedAt, status: 'NO_GO', failedChecks: ['after-summary'] });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.samples).toBe(samples);
      expect(summary.samples).toHaveLength(1);
      expect(summary.totalSamples).toBe(0);
      expect(summary.failedSamples).toBe(0);
    },
  );
});

describe('release observation batch 191 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    `batch191-${index}`,
  ] as const))(
    'generated batch191 stable samples ignore failedChecks content %s',
    (count, marker) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-14T01:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'GO' as const,
        failedChecks: [`${marker}-nonblocking-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count + 10, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples).toBe(samples);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? '' : `2026-05-14T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch191 first failure preserves checkedAt string %#',
    (checkedAt) => {
      const samples = [
        { checkedAt, status: 'NO_GO' as const, failedChecks: [] },
        { checkedAt: '2026-05-14T02:59:00.000Z', status: 'NO_GO' as const, failedChecks: ['second'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 30, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.latestStatus).toBe('NO_GO');
    },
  );
});

describe('release observation batch 192 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    `2026-05-14T06:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch192 all failing samples count every NO_GO %s',
    (count, firstCheckedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: sampleIndex === 0 ? firstCheckedAt : `2026-05-14T06:${String((sampleIndex + 10) % 60).padStart(2, '0')}:00.000Z`,
        status: 'NO_GO' as const,
        failedChecks: [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count * -1, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(count);
      expect(summary.firstFailureAt).toBe(firstCheckedAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.windowMinutes).toBe(count * -1);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index,
    `2026-05-14T07:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch192 stable summary keeps total independent from later mutation %#',
    (index, checkedAt) => {
      const samples = [{ checkedAt, status: 'GO' as const, failedChecks: [] }];
      const summary = summarizeReleaseObservation({ windowMinutes: index, samples });

      samples[0].status = 'NO_GO';
      samples[0].failedChecks.push(`batch192-${index}`);

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.failedSamples).toBe(0);
      expect(summary.samples[0].status).toBe('NO_GO');
      expect(summary.samples[0].failedChecks).toEqual([`batch192-${index}`]);
    },
  );
});

describe('release observation batch 193 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `UNKNOWN_${index}`,
    `2026-05-14T10:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch193 non NO_GO runtime status remains stable %s',
    (status, checkedAt) => {
      const samples = [{ checkedAt, status: status as 'GO', failedChecks: [`batch193-${status}`] }];
      const summary = summarizeReleaseObservation({ windowMinutes: 20, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe(status);
      expect(summary.samples).toBe(samples);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index - 30,
    new Date(Date.UTC(2026, 4, 14, 11, index % 50, 0)),
  ] as const))(
    'generated batch193 no sample summary preserves unusual window %s',
    (windowMinutes, generatedAt) => {
      const summary = summarizeReleaseObservation({ windowMinutes, samples: [], generatedAt });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.latestStatus).toBeNull();
      expect(summary.recommendation).toContain('No release observation samples');
    },
  );
});

describe('release observation batch 194 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
    `2026-05-14T14:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch194 first failed sample can be last in window %s',
    (count, failedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: sampleIndex === count - 1 ? failedAt : `2026-05-14T14:${String((sampleIndex + 1) % 60).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex === count - 1 ? 'NO_GO' : 'GO') as 'GO' | 'NO_GO',
        failedChecks: sampleIndex === count - 1 ? [`batch194-${sampleIndex}`] : [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: 60, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(failedAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.totalSamples).toBe(count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? ` batch194-${index} ` : `\nbatch194-${index}\t`,
  ] as const))(
    'generated batch194 first failure preserves whitespace checkedAt %#',
    (checkedAt) => {
      const samples = [
        { checkedAt: '2026-05-14T15:00:00.000Z', status: 'GO' as const, failedChecks: [] },
        { checkedAt, status: 'NO_GO' as const, failedChecks: ['batch194'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 15, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.failedSamples).toBe(1);
      expect(summary.latestStatus).toBe('NO_GO');
    },
  );
});

describe('release observation batch 195 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 3,
  ] as const))(
    'generated batch195 alternating samples keep first failure and latest status %s',
    (count) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-14T18:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex % 2 === 0 ? 'NO_GO' : 'GO') as 'GO' | 'NO_GO',
        failedChecks: sampleIndex % 2 === 0 ? [`batch195-${sampleIndex}`] : [],
      }));
      const failedCount = samples.filter((sample) => sample.status === 'NO_GO').length;
      const summary = summarizeReleaseObservation({ windowMinutes: count, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(failedCount);
      expect(summary.firstFailureAt).toBe(samples[0].checkedAt);
      expect(summary.latestStatus).toBe(samples[count - 1].status);
      expect(summary.samples).toBe(samples);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch195-check-${index}`,
  ] as const))(
    'generated batch195 summary exposes failedChecks array reference %s',
    (marker) => {
      const failedChecks: string[] = [];
      const samples = [{ checkedAt: '2026-05-14T19:00:00.000Z', status: 'NO_GO' as const, failedChecks }];
      const summary = summarizeReleaseObservation({ windowMinutes: 10, samples });

      failedChecks.push(marker);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.samples[0].failedChecks).toEqual([marker]);
      expect(summary.firstFailureAt).toBe('2026-05-14T19:00:00.000Z');
    },
  );
});

describe('release observation batch 196 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    `2026-05-14T22:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch196 stable samples retain unusual failedChecks arrays %s',
    (count, checkedAt) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: sampleIndex === 0 ? checkedAt : `2026-05-14T22:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'GO' as const,
        failedChecks: sampleIndex % 2 === 0 ? [] : [`batch196-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: Number.MAX_SAFE_INTEGER - count, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe('GO');
      expect(summary.windowMinutes).toBe(Number.MAX_SAFE_INTEGER - count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-14T23:${String(index % 50).padStart(2, '0')}:00.000-05:00`,
  ] as const))(
    'generated batch196 generatedAt normalizes negative timezone offset %s',
    (generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 25,
        generatedAt: new Date(generatedAt),
        samples: [{ checkedAt: generatedAt, status: 'NO_GO', failedChecks: ['batch196'] }],
      });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.generatedAt).toBe(new Date(generatedAt).toISOString());
      expect(summary.firstFailureAt).toBe(generatedAt);
      expect(summary.failedSamples).toBe(1);
    },
  );
});

describe('release observation batch 197 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 4,
  ] as const))(
    'generated batch197 failures after first sample preserve earliest failure %s',
    (count) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-15T02:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex === 0 || sampleIndex === count - 1 ? 'GO' : 'NO_GO') as 'GO' | 'NO_GO',
        failedChecks: sampleIndex === 0 || sampleIndex === count - 1 ? [] : [`batch197-${sampleIndex}`],
      }));
      const failedSamples = samples.filter((sample) => sample.status === 'NO_GO');
      const summary = summarizeReleaseObservation({ windowMinutes: count * 3, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(failedSamples.length);
      expect(summary.firstFailureAt).toBe(failedSamples[0].checkedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.totalSamples).toBe(count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(Date.UTC(2040, 0, 1, 0, index % 50, 0)),
  ] as const))(
    'generated batch197 far future generatedAt is serialized %#',
    (generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 5,
        generatedAt,
        samples: [{ checkedAt: generatedAt.toISOString(), status: 'GO', failedChecks: [] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe('GO');
    },
  );
});

describe('release observation batch 198 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
  ] as const))(
    'generated batch198 final failing sample controls latest status %s',
    (count) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-15T05:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex === count - 1 ? 'NO_GO' : 'GO') as 'GO' | 'NO_GO',
        failedChecks: sampleIndex === count - 1 ? [`batch198-${sampleIndex}`] : [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(samples[count - 1].checkedAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.totalSamples).toBe(count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    -index,
    new Date(Date.UTC(1970, 0, 1, 0, index % 50, 0)),
  ] as const))(
    'generated batch198 no samples preserve negative window and epoch generatedAt %#',
    (windowMinutes, generatedAt) => {
      const summary = summarizeReleaseObservation({ windowMinutes, generatedAt, samples: [] });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBeNull();
    },
  );
});

describe('release observation batch 199 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
  ] as const))(
    'generated batch199 first failing sample remains first failure across stable tail %s',
    (tailCount) => {
      const samples = [
        { checkedAt: '2026-05-15T08:00:00.000Z', status: 'NO_GO' as const, failedChecks: ['batch199-first'] },
        ...Array.from({ length: tailCount }, (_, sampleIndex) => ({
          checkedAt: `2026-05-15T08:${String((sampleIndex + 1) % 60).padStart(2, '0')}:00.000Z`,
          status: 'GO' as const,
          failedChecks: [],
        })),
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: tailCount + 1, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe('2026-05-15T08:00:00.000Z');
      expect(summary.latestStatus).toBe('GO');
      expect(summary.totalSamples).toBe(tailCount + 1);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(Date.UTC(1969, 11, 31, 23, index % 50, 0)),
  ] as const))(
    'generated batch199 pre epoch generatedAt is serialized %#',
    (generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 15,
        generatedAt,
        samples: [{ checkedAt: generatedAt.toISOString(), status: 'GO', failedChecks: [] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe('GO');
    },
  );
});

describe('release observation batch 200 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
  ] as const))(
    'generated batch200 stable samples ignore non-empty failedChecks when status is GO %s',
    (count) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-15T11:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'GO' as const,
        failedChecks: [`batch200-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: Number.POSITIVE_INFINITY, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe('GO');
      expect(summary.windowMinutes).toBe(Number.POSITIVE_INFINITY);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    Number.NaN,
    new Date(Date.UTC(2026, 4, 15, 12, index % 50, 0)),
  ] as const))(
    'generated batch200 no samples preserve NaN window and generatedAt %#',
    (windowMinutes, generatedAt) => {
      const summary = summarizeReleaseObservation({ windowMinutes, generatedAt, samples: [] });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.windowMinutes).toBeNaN();
      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.totalSamples).toBe(0);
      expect(summary.failedSamples).toBe(0);
    },
  );
});

describe('release observation batch 201 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
  ] as const))(
    'generated batch201 alternating failures count all no-go samples %s',
    (count) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-15T14:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: (sampleIndex % 2 === 0 ? 'NO_GO' : 'GO') as 'NO_GO' | 'GO',
        failedChecks: sampleIndex % 2 === 0 ? [`batch201-${sampleIndex}`] : [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count * 2, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(samples.filter((sample) => sample.status === 'NO_GO').length);
      expect(summary.firstFailureAt).toBe(samples[0].checkedAt);
      expect(summary.latestStatus).toBe(samples[count - 1].status);
      expect(summary.totalSamples).toBe(count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 15, 15, index % 50, 0, 999)),
  ] as const))(
    'generated batch201 generatedAt preserves millisecond precision %#',
    (generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 1,
        generatedAt,
        samples: [{ checkedAt: generatedAt.toISOString(), status: 'NO_GO', failedChecks: ['batch201'] }],
      });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.firstFailureAt).toBe(generatedAt.toISOString());
      expect(summary.failedSamples).toBe(1);
    },
  );
});

describe('release observation batch 202 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 3,
  ] as const))(
    'generated batch202 all failing samples keep latest no-go status %s',
    (count) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-15T19:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'NO_GO' as const,
        failedChecks: [`batch202-${sampleIndex}`],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count * 5, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(count);
      expect(summary.firstFailureAt).toBe(samples[0].checkedAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples[count - 1].failedChecks).toEqual([`batch202-${count - 1}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch202-${index}`,
  ] as const))(
    'generated batch202 no samples always uses no sample recommendation %s',
    (marker) => {
      const summary = summarizeReleaseObservation({ windowMinutes: marker.length, samples: [] });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.recommendation).toBe('No release observation samples were collected; rerun release observation with at least one check.');
      expect(summary.totalSamples).toBe(0);
      expect(summary.failedSamples).toBe(0);
    },
  );
});

describe('release observation batch 203 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
  ] as const))(
    'generated batch203 final go after all failures keeps attention status %s',
    (count) => {
      const samples = [
        ...Array.from({ length: count }, (_, sampleIndex) => ({
          checkedAt: `2026-05-15T22:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
          status: 'NO_GO' as const,
          failedChecks: [`batch203-${sampleIndex}`],
        })),
        { checkedAt: '2026-05-15T23:00:00.000Z', status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: count + 1, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(count);
      expect(summary.firstFailureAt).toBe(samples[0].checkedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.totalSamples).toBe(count + 1);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 15, 23, index % 50, 59, 1)),
  ] as const))(
    'generated batch203 stable recommendation remains normal monitoring %#',
    (generatedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 30,
        generatedAt,
        samples: [{ checkedAt: generatedAt.toISOString(), status: 'GO', failedChecks: [] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.recommendation).toBe('Continue normal post-release monitoring until the observation window ends.');
      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.failedSamples).toBe(0);
    },
  );
});

describe('release observation batch 204 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
  ] as const))(
    'generated batch204 single late failure changes stable prefix to attention %s',
    (stableCount) => {
      const samples = [
        ...Array.from({ length: stableCount }, (_, sampleIndex) => ({
          checkedAt: `2026-05-16T02:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
          status: 'GO' as const,
          failedChecks: [],
        })),
        { checkedAt: '2026-05-16T03:00:00.000Z', status: 'NO_GO' as const, failedChecks: ['batch204'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: stableCount + 1, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe('2026-05-16T03:00:00.000Z');
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.totalSamples).toBe(stableCount + 1);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-16T04:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch204 preserves checkedAt string without date parsing %s',
    (checkedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 20,
        samples: [{ checkedAt, status: 'NO_GO', failedChecks: ['batch204'] }],
      });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].checkedAt).toBe(checkedAt);
      expect(summary.failedSamples).toBe(1);
    },
  );
});

describe('release observation batch 205 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    [`batch205-${index}`, `batch205-detail-${index}`],
  ] as const))(
    'generated batch205 keeps failedChecks array reference %#',
    (failedChecks) => {
      const sample = {
        checkedAt: '2026-05-17T00:00:00.000Z',
        status: 'NO_GO' as const,
        failedChecks,
      };
      const summary = summarizeReleaseObservation({ windowMinutes: 15, samples: [sample] });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.samples[0].failedChecks).toBe(failedChecks);
      expect(summary.firstFailureAt).toBe(sample.checkedAt);
      expect(summary.recommendation).toBe('Start incident response, collect context, and prepare feature flag mitigation or rollback.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? index + 0.5 : -(index + 0.5),
  ] as const))(
    'generated batch205 preserves fractional window minutes %#',
    (windowMinutes) => {
      const summary = summarizeReleaseObservation({
        windowMinutes,
        samples: [{ checkedAt: '2026-05-17T01:00:00.000Z', status: 'GO', failedChecks: [] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe('GO');
    },
  );
});

describe('release observation batch 206 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 18, 0, index % 50, 0, index % 10)),
    index,
  ] as const))(
    'generated batch206 empty samples preserve generatedAt %#',
    (generatedAt, windowMinutes) => {
      const summary = summarizeReleaseObservation({
        windowMinutes,
        generatedAt,
        samples: [],
      });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.totalSamples).toBe(0);
      expect(summary.latestStatus).toBeNull();
      expect(summary.recommendation).toBe('No release observation samples were collected; rerun release observation with at least one check.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [{ checkedAt: `2026-05-18T01:${String(index % 50).padStart(2, '0')}:00.000Z`, status: 'GO' as const, failedChecks: [] }],
  ] as const))(
    'generated batch206 keeps samples array reference %#',
    (samples) => {
      const summary = summarizeReleaseObservation({ windowMinutes: 10, samples });

      expect(summary.status).toBe('STABLE');
      expect(summary.samples).toBe(samples);
      expect(summary.totalSamples).toBe(1);
      expect(summary.firstFailureAt).toBeNull();
    },
  );
});

describe('release observation batch 207 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch207-failed-check-${index}`,
  ] as const))(
    'generated batch207 go samples with failedChecks are not counted as failures %s',
    (failedCheck) => {
      const samples = [
        { checkedAt: '2026-05-19T00:00:00.000Z', status: 'GO' as const, failedChecks: [failedCheck] },
        { checkedAt: '2026-05-19T00:01:00.000Z', status: 'NO_GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 2, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(samples[1].checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([failedCheck]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-19T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch207 latestStatus follows final sample after earlier failure %s',
    (checkedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 5,
        samples: [
          { checkedAt: '2026-05-19T01:00:00.000Z', status: 'NO_GO', failedChecks: ['batch207'] },
          { checkedAt, status: 'GO', failedChecks: [] },
        ],
      });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.latestStatus).toBe('GO');
      expect(summary.firstFailureAt).toBe('2026-05-19T01:00:00.000Z');
      expect(summary.totalSamples).toBe(2);
    },
  );
});

describe('release observation batch 208 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
  ] as const))(
    'generated batch208 all no-go samples count every failure %s',
    (count) => {
      const samples = Array.from({ length: count }, (_, sampleIndex) => ({
        checkedAt: `2026-05-20T00:${String(sampleIndex % 60).padStart(2, '0')}:00.000Z`,
        status: 'NO_GO' as const,
        failedChecks: [],
      }));
      const summary = summarizeReleaseObservation({ windowMinutes: count, samples });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(count);
      expect(summary.firstFailureAt).toBe(samples[0].checkedAt);
      expect(summary.latestStatus).toBe('NO_GO');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-20T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch208 stable sample object reference is retained %s',
    (checkedAt) => {
      const sample = { checkedAt, status: 'GO' as const, failedChecks: [] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });

      expect(summary.status).toBe('STABLE');
      expect(summary.samples[0]).toBe(sample);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.firstFailureAt).toBeNull();
    },
  );
});

describe('release observation batch 209 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-21T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch209 first failure ignores later no-go samples %s',
    (checkedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 3,
        samples: [
          { checkedAt, status: 'NO_GO', failedChecks: ['first'] },
          { checkedAt: '2026-05-21T00:59:00.000Z', status: 'NO_GO', failedChecks: ['second'] },
        ],
      });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.latestStatus).toBe('NO_GO');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index,
  ] as const))(
    'generated batch209 window zero and positive values are echoed %#',
    (windowMinutes) => {
      const summary = summarizeReleaseObservation({
        windowMinutes,
        samples: [{ checkedAt: '2026-05-21T01:00:00.000Z', status: 'GO', failedChecks: [] }],
      });

      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.failedSamples).toBe(0);
    },
  );
});

describe('release observation batch 210 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-22T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index % 2 === 0 ? [] : [`batch210-check-${index}`],
  ] as const))(
    'generated batch210 no-go status counts failure regardless of failedChecks %#',
    (checkedAt, failedChecks) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 5,
        samples: [{ checkedAt, status: 'NO_GO', failedChecks }],
      });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toBe(failedChecks);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-22T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch210 runtime lowercase status is not counted as no-go %s',
    (checkedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 10,
        samples: [{ checkedAt, status: 'no_go' as unknown as 'NO_GO', failedChecks: [] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe('no_go');
    },
  );
});

describe('release observation batch 211 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-23T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch211 runtime padded no-go status is not counted as failure %s',
    (checkedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 10,
        samples: [{ checkedAt, status: 'NO_GO ' as unknown as 'NO_GO', failedChecks: ['batch211'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
      expect(summary.latestStatus).toBe('NO_GO ');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-23T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch211 summary retains sample array after count calculation %s',
    (checkedAt) => {
      const samples = [{ checkedAt, status: 'GO' as const, failedChecks: [] }];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.push({ checkedAt: '2026-05-23T01:59:00.000Z', status: 'NO_GO', failedChecks: ['late'] });

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.failedSamples).toBe(0);
      expect(summary.samples).toHaveLength(2);
    },
  );
});

describe('release observation batch 212 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 24, 0, index % 50, 0, index % 10)),
  ] as const))(
    'generated batch212 generatedAt is independent of sample checkedAt %#',
    (generatedAt) => {
      const summary = summarizeReleaseObservation({
        generatedAt,
        windowMinutes: 15,
        samples: [{ checkedAt: '2026-05-24T00:59:00.000Z', status: 'NO_GO', failedChecks: ['batch212'] }],
      });

      expect(summary.generatedAt).toBe(generatedAt.toISOString());
      expect(summary.firstFailureAt).toBe('2026-05-24T00:59:00.000Z');
      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.latestStatus).toBe('NO_GO');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-24T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch212 runtime blank status is treated as stable %s',
    (checkedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 5,
        samples: [{ checkedAt, status: '' as unknown as 'GO', failedChecks: ['ignored'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe('');
      expect(summary.firstFailureAt).toBeNull();
    },
  );
});

describe('release observation batch 213 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-25T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch213 missing runtime status is not counted as failure %s',
    (checkedAt) => {
      const sample = { checkedAt, failedChecks: ['batch213'] } as unknown as { checkedAt: string; status: 'GO'; failedChecks: string[] };
      const summary = summarizeReleaseObservation({ windowMinutes: 5, samples: [sample] });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBeNull();
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch213-check-${index}`,
  ] as const))(
    'generated batch213 failedChecks mutation after summary is visible through samples %s',
    (failedCheck) => {
      const failedChecks: string[] = [];
      const summary = summarizeReleaseObservation({
        windowMinutes: 1,
        samples: [{ checkedAt: '2026-05-25T01:00:00.000Z', status: 'NO_GO', failedChecks }],
      });
      failedChecks.push(failedCheck);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.samples[0].failedChecks).toEqual([failedCheck]);
      expect(summary.firstFailureAt).toBe('2026-05-25T01:00:00.000Z');
    },
  );
});

describe('release observation batch 214 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-26T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch214 numeric runtime status is retained as latest status %s',
    (checkedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 5,
        samples: [{ checkedAt, status: 0 as unknown as 'GO', failedChecks: ['batch214'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(0);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-26T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch214 empty sample array reference can mutate after summary %s',
    (checkedAt) => {
      const samples: Array<{ checkedAt: string; status: 'GO' | 'NO_GO'; failedChecks: string[] }> = [];
      const summary = summarizeReleaseObservation({ windowMinutes: 0, samples });
      samples.push({ checkedAt, status: 'GO', failedChecks: [] });

      expect(summary.status).toBe('NO_SAMPLES');
      expect(summary.totalSamples).toBe(0);
      expect(summary.latestStatus).toBeNull();
      expect(summary.samples).toHaveLength(1);
    },
  );
});

describe('release observation batch 215 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-27T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch215 boolean runtime status is retained as latest status %s',
    (checkedAt) => {
      const summary = summarizeReleaseObservation({
        windowMinutes: 6,
        samples: [{ checkedAt, status: false as unknown as 'GO', failedChecks: ['batch215'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(false);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
  ] as const))(
    'generated batch215 non-finite window minutes are echoed %#',
    (windowMinutes) => {
      const summary = summarizeReleaseObservation({
        windowMinutes,
        samples: [{ checkedAt: '2026-05-27T01:00:00.000Z', status: 'GO', failedChecks: [] }],
      });

      expect(summary.windowMinutes).toBe(windowMinutes);
      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.failedSamples).toBe(0);
    },
  );
});

describe('release observation batch 216 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-28T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch216 symbol runtime status is retained as latest status %s',
    (checkedAt) => {
      const status = Symbol.for(`batch216-${checkedAt}`) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 7,
        samples: [{ checkedAt, status, failedChecks: ['batch216'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-28T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch216 failed sample array keeps object identity %s',
    (checkedAt) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push('second');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.samples[0]).toBe(sample);
      expect(summary.samples[0].failedChecks).toEqual(['first', 'second']);
      expect(summary.firstFailureAt).toBe(checkedAt);
    },
  );
});

describe('release observation batch 217 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-29T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch217 bigint runtime status is retained as latest status %s',
    (checkedAt) => {
      const status = BigInt(217) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 8,
        samples: [{ checkedAt, status, failedChecks: ['batch217'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-29T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch217 post-summary status mutation keeps computed counters %s',
    (checkedAt) => {
      const sample = { checkedAt, status: 'NO_GO' as 'GO' | 'NO_GO', failedChecks: ['batch217'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.status = 'GO';

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples[0].status).toBe('GO');
    },
  );
});

describe('release observation batch 218 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-30T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch218 object runtime status is retained as latest status %s',
    (checkedAt) => {
      const status = { label: checkedAt } as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 9,
        samples: [{ checkedAt, status, failedChecks: ['batch218'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-30T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch218 post-summary sample removal keeps computed totals %s',
    (checkedAt) => {
      const samples = [{ checkedAt, status: 'GO' as const, failedChecks: [] }];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.pop();

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples).toHaveLength(0);
    },
  );
});

describe('release observation batch 219 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-05-31T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch219 function runtime status is retained as latest status %s',
    (checkedAt) => {
      const status = (() => checkedAt) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 10,
        samples: [{ checkedAt, status, failedChecks: ['batch219'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-31T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch219 post-summary checkedAt mutation keeps first failure stable %s',
    (checkedAt) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['batch219'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.checkedAt = 'mutated';

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].checkedAt).toBe('mutated');
    },
  );
});

describe('release observation batch 220 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-01T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch220 array runtime status is retained as latest status %s',
    (checkedAt) => {
      const status = ['GO', checkedAt] as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 11,
        samples: [{ checkedAt, status, failedChecks: ['batch220'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-01T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `batch220-replaced-${index}`,
  ] as const))(
    'generated batch220 post-summary failedChecks reassignment keeps computed counters %#',
    (checkedAt, replacement) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['original'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = [replacement];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacement]);
    },
  );
});

describe('release observation batch 221 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-02T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch221 no-go string object is not counted as failure %s',
    (checkedAt) => {
      const status = new String('NO_GO') as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 12,
        samples: [{ checkedAt, status, failedChecks: ['batch221'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-02T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch221 unshift after summary changes sample view not totals %s',
    (checkedAt) => {
      const samples = [{ checkedAt, status: 'GO' as const, failedChecks: [] }];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.unshift({ checkedAt: '2026-06-02T00:59:00.000Z', status: 'NO_GO', failedChecks: ['late'] });

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.failedSamples).toBe(0);
      expect(summary.samples[0].status).toBe('NO_GO');
    },
  );
});

describe('release observation batch 222 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-03T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch222 Date runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new Date(checkedAt) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 13,
        samples: [{ checkedAt, status, failedChecks: ['batch222'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-03T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch222 push after summary changes sample view not latest status %s',
    (checkedAt) => {
      const samples = [{ checkedAt, status: 'GO' as const, failedChecks: [] }];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.push({ checkedAt: '2026-06-03T01:59:00.000Z', status: 'NO_GO', failedChecks: ['late'] });

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples[1].status).toBe('NO_GO');
    },
  );
});

describe('release observation batch 223 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-04T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch223 Promise runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = Promise.resolve('NO_GO') as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 14,
        samples: [{ checkedAt, status, failedChecks: ['batch223'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-04T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch223 post-summary status mutation changes sample view not counters %s',
    (checkedAt) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['batch223'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.status = 'GO';

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples[0].status).toBe('GO');
    },
  );
});

describe('release observation batch 224 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-05T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch224 Set runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new Set(['NO_GO']) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 15,
        samples: [{ checkedAt, status, failedChecks: ['batch224'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-05T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-06-05T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch224 post-summary checkedAt mutation changes sample view not first failure %#',
    (checkedAt, replacementCheckedAt) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['batch224'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.checkedAt = replacementCheckedAt;

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].checkedAt).toBe(replacementCheckedAt);
    },
  );
});

describe('release observation batch 225 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-06T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch225 RegExp runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = /NO_GO/ as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 16,
        samples: [{ checkedAt, status, failedChecks: ['batch225'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-06T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch225 pop after summary empties sample view not computed totals %s',
    (checkedAt) => {
      const samples = [{ checkedAt, status: 'GO' as const, failedChecks: [] }];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.pop();

      expect(summary.status).toBe('STABLE');
      expect(summary.totalSamples).toBe(1);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples).toHaveLength(0);
    },
  );
});

describe('release observation batch 226 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-07T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch226 WeakMap runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new WeakMap() as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 17,
        samples: [{ checkedAt, status, failedChecks: ['batch226'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-07T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch226 shift after summary changes sample view not latest status %s',
    (checkedAt) => {
      const samples = [
        { checkedAt, status: 'GO' as const, failedChecks: [] },
        { checkedAt: '2026-06-07T01:59:00.000Z', status: 'NO_GO' as const, failedChecks: ['later'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(2);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples[0].status).toBe('NO_GO');
    },
  );
});

describe('release observation batch 227 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-08T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch227 null-prototype runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = Object.assign(Object.create(null), { value: 'NO_GO' }) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 18,
        samples: [{ checkedAt, status, failedChecks: ['batch227'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-08T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-06-08T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch227 reverse after summary changes sample view not computed fields %#',
    (firstCheckedAt, secondCheckedAt) => {
      const samples = [
        { checkedAt: firstCheckedAt, status: 'NO_GO' as const, failedChecks: ['first'] },
        { checkedAt: secondCheckedAt, status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(firstCheckedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples[0].checkedAt).toBe(secondCheckedAt);
    },
  );
});

describe('release observation batch 228 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-09T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch228 DataView runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new DataView(new ArrayBuffer(8)) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 19,
        samples: [{ checkedAt, status, failedChecks: ['batch228'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-09T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `late-${index}`,
  ] as const))(
    'generated batch228 failedChecks push after summary changes sample view only %#',
    (checkedAt, lateFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push(lateFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', lateFailure]);
    },
  );
});

describe('release observation batch 229 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-10T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch229 ArrayBuffer runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new ArrayBuffer(8) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 20,
        samples: [{ checkedAt, status, failedChecks: ['batch229'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-10T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-06-10T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch229 splice after summary changes sample view not computed fields %#',
    (firstCheckedAt, secondCheckedAt) => {
      const samples = [
        { checkedAt: firstCheckedAt, status: 'GO' as const, failedChecks: [] },
        { checkedAt: secondCheckedAt, status: 'NO_GO' as const, failedChecks: ['second'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.splice(1, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(2);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples).toHaveLength(1);
    },
  );
});

describe('release observation batch 230 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-11T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch230 Uint8Array runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new Uint8Array([indexOfMinute(checkedAt)]) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 21,
        samples: [{ checkedAt, status, failedChecks: ['batch230'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-11T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-06-11T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch230 sort after summary changes sample view not computed fields %#',
    (firstCheckedAt, secondCheckedAt) => {
      const samples = [
        { checkedAt: firstCheckedAt, status: 'NO_GO' as const, failedChecks: ['first'] },
        { checkedAt: secondCheckedAt, status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.sort((left, right) => left.status.localeCompare(right.status));

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(firstCheckedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples[0].status).toBe('GO');
    },
  );
});

function indexOfMinute(checkedAt: string): number {
  return Number(checkedAt.slice(14, 16));
}

describe('release observation batch 231 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-12T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch231 WeakSet runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new WeakSet() as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 22,
        samples: [{ checkedAt, status, failedChecks: ['batch231'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-12T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-06-12T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch231 fill after summary changes sample view not computed fields %#',
    (firstCheckedAt, secondCheckedAt) => {
      const samples = [
        { checkedAt: firstCheckedAt, status: 'NO_GO' as const, failedChecks: ['first'] },
        { checkedAt: secondCheckedAt, status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.fill({ checkedAt: secondCheckedAt, status: 'GO', failedChecks: [] });

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(firstCheckedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples.every((sample) => sample.status === 'GO')).toBe(true);
    },
  );
});

describe('release observation batch 232 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-13T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch232 Error runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new Error(`NO_GO-${checkedAt}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 23,
        samples: [{ checkedAt, status, failedChecks: ['batch232'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-13T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-06-13T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch232 copyWithin after summary changes sample view not computed fields %#',
    (firstCheckedAt, secondCheckedAt) => {
      const samples = [
        { checkedAt: firstCheckedAt, status: 'NO_GO' as const, failedChecks: ['first'] },
        { checkedAt: secondCheckedAt, status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.copyWithin(0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(firstCheckedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples[0].status).toBe('GO');
    },
  );
});

describe('release observation batch 233 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-14T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch233 TypeError runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new TypeError(`NO_GO-${checkedAt}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 24,
        samples: [{ checkedAt, status, failedChecks: ['batch233'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-14T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-06-14T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch233 truncate after summary changes sample view not computed fields %#',
    (firstCheckedAt, secondCheckedAt) => {
      const samples = [
        { checkedAt: firstCheckedAt, status: 'NO_GO' as const, failedChecks: ['first'] },
        { checkedAt: secondCheckedAt, status: 'GO' as const, failedChecks: [] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples.length = 0;

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(firstCheckedAt);
      expect(summary.latestStatus).toBe('GO');
      expect(summary.samples).toHaveLength(0);
    },
  );
});

describe('release observation batch 234 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-15T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch234 RangeError runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new RangeError(`NO_GO-${checkedAt}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 25,
        samples: [{ checkedAt, status, failedChecks: ['batch234'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-15T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `2026-06-15T02:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch234 replacing latest sample changes view not computed fields %#',
    (firstCheckedAt, secondCheckedAt) => {
      const samples = [
        { checkedAt: firstCheckedAt, status: 'GO' as const, failedChecks: [] },
        { checkedAt: secondCheckedAt, status: 'NO_GO' as const, failedChecks: ['second'] },
      ];
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples });
      samples[1] = { checkedAt: secondCheckedAt, status: 'GO', failedChecks: [] };

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.totalSamples).toBe(2);
      expect(summary.firstFailureAt).toBe(secondCheckedAt);
      expect(summary.latestStatus).toBe('NO_GO');
      expect(summary.samples[1].status).toBe('GO');
    },
  );
});

describe('release observation batch 235 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-16T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch235 SyntaxError runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new SyntaxError(`NO_GO-${checkedAt}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 26,
        samples: [{ checkedAt, status, failedChecks: ['batch235'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-16T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch235 failedChecks replacement after summary changes sample view only %s',
    (checkedAt) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = [];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([]);
    },
  );
});

describe('release observation batch 236 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-17T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch236 EvalError runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new EvalError(`NO_GO-${checkedAt}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 27,
        samples: [{ checkedAt, status, failedChecks: ['batch236'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-17T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `late-batch236-${index}`,
  ] as const))(
    'generated batch236 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, lateFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(lateFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([lateFailure, 'initial']);
    },
  );
});

describe('release observation batch 237 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-18T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch237 URIError runtime status is retained without failure count %s',
    (checkedAt) => {
      const status = new URIError(`NO_GO-${checkedAt}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 28,
        samples: [{ checkedAt, status, failedChecks: ['batch237'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-18T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch237-${index}`,
  ] as const))(
    'generated batch237 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(0, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure]);
    },
  );
});

describe('release observation batch 238 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-19T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch238 RangeError object GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new RangeError(`GO-${checkedAt}`) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 29,
        samples: [{ checkedAt, status, failedChecks: ['batch238'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-19T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch238-${index}`,
  ] as const))(
    'generated batch238 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, laterFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', laterFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([laterFailure, 'initial']);
    },
  );
});

describe('release observation batch 239 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-20T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch239 ReferenceError object NO_GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new ReferenceError(`NO_GO-${checkedAt}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 30,
        samples: [{ checkedAt, status, failedChecks: ['batch239'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-20T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch239-${String(index).padStart(2, '0')}`,
  ] as const))(
    'generated batch239 failedChecks sort after summary changes sample view only %#',
    (checkedAt, sortedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['z-initial', sortedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([sortedFailure, 'z-initial']);
    },
  );
});

describe('release observation batch 240 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-21T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch240 TypeError object GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new TypeError(`GO-${checkedAt}`) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 31,
        samples: [{ checkedAt, status, failedChecks: ['batch240'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-21T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `tail-batch240-${index}`,
  ] as const))(
    'generated batch240 failedChecks pop after summary changes sample view only %#',
    (checkedAt, tailFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', tailFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial']);
    },
  );
});

describe('release observation batch 241 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-22T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch241 Date object NO_GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new Date(checkedAt) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 32,
        samples: [{ checkedAt, status, failedChecks: ['batch241'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-22T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `tail-batch241-${index}`,
  ] as const))(
    'generated batch241 failedChecks shift after summary changes sample view only %#',
    (checkedAt, tailFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', tailFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([tailFailure]);
    },
  );
});

describe('release observation batch 242 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-23T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch242 ArrayBuffer object GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new ArrayBuffer(checkedAt.length) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 33,
        samples: [{ checkedAt, status, failedChecks: ['batch242'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-23T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch242-${index}`,
  ] as const))(
    'generated batch242 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, copiedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', copiedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([copiedFailure, copiedFailure]);
    },
  );
});

describe('release observation batch 243 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-24T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch243 DataView object NO_GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new DataView(new ArrayBuffer(checkedAt.length)) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 34,
        samples: [{ checkedAt, status, failedChecks: ['batch243'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-24T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch243-${index}`,
  ] as const))(
    'generated batch243 failedChecks fill after summary changes sample view only %#',
    (checkedAt, filledFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(filledFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([filledFailure, filledFailure]);
    },
  );
});

describe('release observation batch 244 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-25T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch244 Map object GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new Map([[checkedAt, 'GO']]) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 35,
        samples: [{ checkedAt, status, failedChecks: ['batch244'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-25T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `length-batch244-${index}`,
  ] as const))(
    'generated batch244 failedChecks length trim after summary changes sample view only %#',
    (checkedAt, removedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', removedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.length = 1;

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial']);
    },
  );
});

describe('release observation batch 245 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-26T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch245 Set object NO_GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new Set([checkedAt]) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 36,
        samples: [{ checkedAt, status, failedChecks: ['batch245'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-26T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `extend-batch245-${index}`,
  ] as const))(
    'generated batch245 failedChecks length extend after summary changes sample view only %#',
    (checkedAt, extendedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.length = 2;
      sample.failedChecks[1] = extendedFailure;

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', extendedFailure]);
    },
  );
});

describe('release observation batch 246 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-27T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch246 Promise object GO status is retained without failure count %s',
    (checkedAt) => {
      const status = Promise.resolve(checkedAt) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 37,
        samples: [{ checkedAt, status, failedChecks: ['batch246'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-27T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch246-${index}`,
  ] as const))(
    'generated batch246 failedChecks splice after summary changes sample view only %#',
    (checkedAt, splicedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, splicedFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', splicedFailure]);
    },
  );
});

describe('release observation batch 247 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-28T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch247 WeakMap object NO_GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new WeakMap<object, string>([[{}, checkedAt]]) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 38,
        samples: [{ checkedAt, status, failedChecks: ['batch247'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-28T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch247-${index}`,
  ] as const))(
    'generated batch247 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, reversedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', reversedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([reversedFailure, 'initial']);
    },
  );
});

describe('release observation batch 248 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-29T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch248 URL object GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new URL(`https://batch248.example/${encodeURIComponent(checkedAt)}`) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 39,
        samples: [{ checkedAt, status, failedChecks: ['batch248'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-29T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch248-${index}`,
  ] as const))(
    'generated batch248 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, unshiftedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(unshiftedFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([unshiftedFailure, 'initial']);
    },
  );
});

describe('release observation batch 249 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-06-30T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch249 URLSearchParams object NO_GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new URLSearchParams([['checkedAt', checkedAt]]) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 40,
        samples: [{ checkedAt, status, failedChecks: ['batch249'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-06-30T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch249-${index}`,
  ] as const))(
    'generated batch249 failedChecks pop after summary changes sample view only %#',
    (checkedAt, removedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', removedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial']);
    },
  );
});

describe('release observation batch 250 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-01T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    BigInt(index + 1),
  ] as const))(
    'generated batch250 BigInt64Array object GO status is retained without failure count %s',
    (checkedAt, value) => {
      const status = new BigInt64Array([value]) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 41,
        samples: [{ checkedAt, status, failedChecks: ['batch250'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-01T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `replace-batch250-${index}`,
  ] as const))(
    'generated batch250 failedChecks property replacement after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = [replacementFailure];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure]);
    },
  );
});

describe('release observation batch 251 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-02T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    BigInt(index + 2),
  ] as const))(
    'generated batch251 BigUint64Array object NO_GO status is retained without failure count %s',
    (checkedAt, value) => {
      const status = new BigUint64Array([value]) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 42,
        samples: [{ checkedAt, status, failedChecks: ['batch251'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-02T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `concat-batch251-${index}`,
  ] as const))(
    'generated batch251 failedChecks concat replacement after summary changes sample view only %#',
    (checkedAt, extraFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.concat(extraFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', extraFailure]);
    },
  );
});

describe('release observation batch 252 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-03T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch252 String object GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new String('GO') as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 43,
        samples: [{ checkedAt, status, failedChecks: ['batch252'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-03T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `spread-batch252-${index}`,
  ] as const))(
    'generated batch252 failedChecks spread replacement after summary changes sample view only %#',
    (checkedAt, extraFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = [...sample.failedChecks, extraFailure];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', extraFailure]);
    },
  );
});

describe('release observation batch 253 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-04T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch253 Number object NO_GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new Number('NO_GO') as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 44,
        samples: [{ checkedAt, status, failedChecks: ['batch253'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-04T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `slice-batch253-${index}`,
  ] as const))(
    'generated batch253 failedChecks slice replacement after summary changes sample view only %#',
    (checkedAt, extraFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', extraFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.slice(1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([extraFailure]);
    },
  );
});

describe('release observation batch 254 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-05T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch254 Boolean object GO status is retained without failure count %s',
    (checkedAt) => {
      const status = new Boolean(true) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 45,
        samples: [{ checkedAt, status, failedChecks: ['batch254'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-05T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `map-batch254-${index}`,
  ] as const))(
    'generated batch254 failedChecks map replacement after summary changes sample view only %#',
    (checkedAt, mappedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.map(() => mappedFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([mappedFailure]);
    },
  );
});

describe('release observation batch 255 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-06T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch255 object status is retained without failure count %s',
    (checkedAt, index) => {
      const status = Object.freeze({ status: index % 2 === 0 ? 'GO' : 'NO_GO' }) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 46,
        samples: [{ checkedAt, status, failedChecks: ['batch255'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-06T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `filter-batch255-${index}`,
  ] as const))(
    'generated batch255 failedChecks filter replacement after summary changes sample view only %#',
    (checkedAt, keptFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['drop', keptFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.filter((failure) => failure === keptFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([keptFailure]);
    },
  );
});

describe('release observation batch 256 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-07T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch256 null-prototype object status is retained without failure count %s',
    (checkedAt, index) => {
      const status = Object.assign(Object.create(null), { status: index % 2 === 0 ? 'GO' : 'NO_GO' }) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 47,
        samples: [{ checkedAt, status, failedChecks: ['batch256'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-07T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reduce-batch256-${index}`,
  ] as const))(
    'generated batch256 failedChecks reduce replacement after summary changes sample view only %#',
    (checkedAt, reducedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', reducedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.reduce<string[]>((acc, failure) => failure === reducedFailure ? [...acc, failure] : acc, []);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([reducedFailure]);
    },
  );
});

describe('release observation batch 257 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-08T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch257 array-like object status is retained without failure count %s',
    (checkedAt, index) => {
      const status = { 0: index % 2 === 0 ? 'GO' : 'NO_GO', length: 1 } as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 48,
        samples: [{ checkedAt, status, failedChecks: ['batch257'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-08T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `flat-batch257-${index}`,
  ] as const))(
    'generated batch257 failedChecks flat replacement after summary changes sample view only %#',
    (checkedAt, flattenedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = [sample.failedChecks, [flattenedFailure]].flat();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', flattenedFailure]);
    },
  );
});

describe('release observation batch 258 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-09T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch258 DataView status is retained without failure count %s',
    (checkedAt) => {
      const status = new DataView(new ArrayBuffer(2)) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 49,
        samples: [{ checkedAt, status, failedChecks: ['batch258'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-09T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `from-batch258-${index}`,
  ] as const))(
    'generated batch258 failedChecks Array.from replacement after summary changes sample view only %#',
    (checkedAt, mappedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = Array.from(sample.failedChecks, () => mappedFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([mappedFailure]);
    },
  );
});

describe('release observation batch 259 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-10T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch259 WeakSet status is retained without failure count %s',
    (checkedAt) => {
      const status = new WeakSet<object>() as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 50,
        samples: [{ checkedAt, status, failedChecks: ['batch259'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-10T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `of-batch259-${index}`,
  ] as const))(
    'generated batch259 failedChecks Array.of replacement after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = Array.of(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure]);
    },
  );
});

describe('release observation batch 260 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-11T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
  ] as const))(
    'generated batch260 RegExp status is retained without failure count %s',
    (checkedAt) => {
      const status = new RegExp(`batch260-${checkedAt}`) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 51,
        samples: [{ checkedAt, status, failedChecks: ['batch260'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-11T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `set-batch260-${index}`,
  ] as const))(
    'generated batch260 failedChecks Set replacement after summary changes sample view only %#',
    (checkedAt, setFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = [...new Set([...sample.failedChecks, setFailure])];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', setFailure]);
    },
  );
});

describe('release observation batch 261 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-12T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch261 Map status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Map([['status', index % 2 === 0 ? 'GO' : 'NO_GO']]) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 52,
        samples: [{ checkedAt, status, failedChecks: ['batch261'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-12T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `split-batch261-${index}`,
  ] as const))(
    'generated batch261 failedChecks split replacement after summary changes sample view only %#',
    (checkedAt, splitFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', splitFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.join('|').split('|').slice(1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([splitFailure]);
    },
  );
});

describe('release observation batch 262 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-13T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch262 Set status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Set([index % 2 === 0 ? 'GO' : 'NO_GO']) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 53,
        samples: [{ checkedAt, status, failedChecks: ['batch262'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-13T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `concat-batch262-${index}`,
  ] as const))(
    'generated batch262 failedChecks concat replacement after summary changes sample view only %#',
    (checkedAt, concatFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.concat(concatFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', concatFailure]);
    },
  );
});

describe('release observation batch 263 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-14T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch263 Date status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Date(`2026-07-14T02:${String(index % 50).padStart(2, '0')}:00.000Z`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 54,
        samples: [{ checkedAt, status, failedChecks: ['batch263'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-14T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `entries-batch263-${index}`,
  ] as const))(
    'generated batch263 failedChecks entries replacement after summary changes sample view only %#',
    (checkedAt, entryFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', entryFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = Array.from(sample.failedChecks.entries()).filter(([itemIndex]) => itemIndex === 1).map(([, failure]) => failure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([entryFailure]);
    },
  );
});

describe('release observation batch 264 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-15T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch264 URLSearchParams status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URLSearchParams({ status: index % 2 === 0 ? 'GO' : 'NO_GO' }) as unknown as 'GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 55,
        samples: [{ checkedAt, status, failedChecks: ['batch264'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-15T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `values-batch264-${index}`,
  ] as const))(
    'generated batch264 failedChecks values replacement after summary changes sample view only %#',
    (checkedAt, valueFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', valueFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = Array.from(sample.failedChecks.values()).slice(1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([valueFailure]);
    },
  );
});

describe('release observation batch 265 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-16T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch265 WeakMap status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new WeakMap<object, object>([[{ batch: index }, { status: 'NO_GO' }]]) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 56,
        samples: [{ checkedAt, status, failedChecks: ['batch265'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-16T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `flatmap-batch265-${index}`,
  ] as const))(
    'generated batch265 failedChecks flatMap replacement after summary changes sample view only %#',
    (checkedAt, flatMapFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', flatMapFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.flatMap((failure) => failure === 'initial' ? [] : [failure]);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([flatMapFailure]);
    },
  );
});

describe('release observation batch 266 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-17T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch266 Promise status is retained without failure count %s',
    (checkedAt, index) => {
      const status = Promise.resolve(index % 2 === 0 ? 'GO' : 'NO_GO') as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 57,
        samples: [{ checkedAt, status, failedChecks: ['batch266'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-17T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `find-batch266-${index}`,
  ] as const))(
    'generated batch266 failedChecks find replacement after summary changes sample view only %#',
    (checkedAt, foundFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', foundFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = [sample.failedChecks.find((failure) => failure === foundFailure)!];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([foundFailure]);
    },
  );
});

describe('release observation batch 267 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-18T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch267 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch267-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 58,
        samples: [{ checkedAt, status, failedChecks: ['batch267'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-18T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reduce-right-batch267-${index}`,
  ] as const))(
    'generated batch267 failedChecks reduceRight replacement after summary changes sample view only %#',
    (checkedAt, reducedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', reducedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.reduceRight<string[]>((items, failure) => (
        failure === 'initial' ? items : [...items, failure]
      ), []);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([reducedFailure]);
    },
  );
});

describe('release observation batch 268 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-19T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch268 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch268-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 59,
        samples: [{ checkedAt, status, failedChecks: ['batch268'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-19T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `last-index-batch268-${index}`,
  ] as const))(
    'generated batch268 failedChecks lastIndexOf replacement after summary changes sample view only %#',
    (checkedAt, lastFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', lastFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = [sample.failedChecks[sample.failedChecks.lastIndexOf(lastFailure)]];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([lastFailure]);
    },
  );
});

describe('release observation batch 269 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-20T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch269 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch269-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 60,
        samples: [{ checkedAt, status, failedChecks: ['batch269'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-20T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `index-of-batch269-${index}`,
  ] as const))(
    'generated batch269 failedChecks indexOf replacement after summary changes sample view only %#',
    (checkedAt, indexedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', indexedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.slice(sample.failedChecks.indexOf(indexedFailure));

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([indexedFailure]);
    },
  );
});

describe('release observation batch 270 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-21T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch270 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch270-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 61,
        samples: [{ checkedAt, status, failedChecks: ['batch270'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-21T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `some-batch270-${index}`,
  ] as const))(
    'generated batch270 failedChecks some replacement after summary changes sample view only %#',
    (checkedAt, someFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', someFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.some((failure) => failure === someFailure) ? [someFailure] : [];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([someFailure]);
    },
  );
});

describe('release observation batch 271 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-22T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch271 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch271-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 62,
        samples: [{ checkedAt, status, failedChecks: ['batch271'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-22T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `every-batch271-${index}`,
  ] as const))(
    'generated batch271 failedChecks every replacement after summary changes sample view only %#',
    (checkedAt, everyFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', everyFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.every((failure) => typeof failure === 'string') ? [everyFailure] : [];

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([everyFailure]);
    },
  );
});

describe('release observation batch 272 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-23T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch272 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch272-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 63,
        samples: [{ checkedAt, status, failedChecks: ['batch272'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-23T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch272-${index}`,
  ] as const))(
    'generated batch272 failedChecks reverse replacement after summary changes sample view only %#',
    (checkedAt, reverseFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [reverseFailure, 'initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks = sample.failedChecks.reverse().slice(1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([reverseFailure]);
    },
  );
});

describe('release observation batch 273 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-24T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch273 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch273-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 64,
        samples: [{ checkedAt, status, failedChecks: ['batch273'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-24T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch273-${index}`,
  ] as const))(
    'generated batch273 failedChecks splice replacement after summary changes sample view only %#',
    (checkedAt, spliceFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', spliceFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([spliceFailure]);
    },
  );
});

describe('release observation batch 274 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-25T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch274 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch274-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 65,
        samples: [{ checkedAt, status, failedChecks: ['batch274'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-25T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch274-${index}`,
  ] as const))(
    'generated batch274 failedChecks fill replacement after summary changes sample view only %#',
    (checkedAt, fillFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', fillFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(fillFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([fillFailure, fillFailure]);
    },
  );
});

describe('release observation batch 275 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-26T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch275 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch275-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 66,
        samples: [{ checkedAt, status, failedChecks: ['batch275'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-26T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copywithin-batch275-${index}`,
  ] as const))(
    'generated batch275 failedChecks copyWithin replacement after summary changes sample view only %#',
    (checkedAt, copyWithinFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', copyWithinFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([copyWithinFailure, copyWithinFailure]);
    },
  );
});

describe('release observation batch 276 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-27T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch276 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch276-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 67,
        samples: [{ checkedAt, status, failedChecks: ['batch276'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-27T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch276-${index}`,
  ] as const))(
    'generated batch276 failedChecks sort replacement after summary changes sample view only %#',
    (checkedAt, sortFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['zz-initial', sortFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([sortFailure, 'zz-initial']);
    },
  );
});

describe('release observation batch 277 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-28T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch277 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch277-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 68,
        samples: [{ checkedAt, status, failedChecks: ['batch277'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-28T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch277-${index}`,
  ] as const))(
    'generated batch277 failedChecks shift replacement after summary changes sample view only %#',
    (checkedAt, shiftFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', shiftFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([shiftFailure]);
    },
  );
});

describe('release observation batch 278 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-29T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch278 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch278-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 69,
        samples: [{ checkedAt, status, failedChecks: ['batch278'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-29T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch278-${index}`,
  ] as const))(
    'generated batch278 failedChecks pop replacement after summary changes sample view only %#',
    (checkedAt, popFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [popFailure, 'initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([popFailure]);
    },
  );
});

describe('release observation batch 279 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-30T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch279 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch279-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 70,
        samples: [{ checkedAt, status, failedChecks: ['batch279'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-30T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch279-${index}`,
  ] as const))(
    'generated batch279 failedChecks unshift replacement after summary changes sample view only %#',
    (checkedAt, unshiftFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(unshiftFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([unshiftFailure, 'initial']);
    },
  );
});

describe('release observation batch 280 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-07-31T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch280 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch280-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 71,
        samples: [{ checkedAt, status, failedChecks: ['batch280'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-07-31T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `push-batch280-${index}`,
  ] as const))(
    'generated batch280 failedChecks push replacement after summary changes sample view only %#',
    (checkedAt, pushFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push(pushFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['initial', pushFailure]);
    },
  );
});

describe('release observation batch 281 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-01T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch281 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch281-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 72,
        samples: [{ checkedAt, status, failedChecks: ['batch281'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-01T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch281-${index}`,
  ] as const))(
    'generated batch281 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, reverseFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['initial', reverseFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([reverseFailure, 'initial']);
    },
  );
});

describe('release observation batch 282 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-02T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch282 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch282-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 73,
        samples: [{ checkedAt, status, failedChecks: ['batch282'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-02T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `alpha-batch282-${index}`,
  ] as const))(
    'generated batch282 failedChecks sort after summary changes sample view only %#',
    (checkedAt, sortedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['zeta', sortedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([sortedFailure, 'zeta']);
    },
  );
});

describe('release observation batch 283 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-03T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch283 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch283-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 74,
        samples: [{ checkedAt, status, failedChecks: ['batch283'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-03T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `kept-batch283-${index}`,
  ] as const))(
    'generated batch283 failedChecks shift after summary changes sample view only %#',
    (checkedAt, keptFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['drop', keptFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([keptFailure]);
    },
  );
});

describe('release observation batch 284 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-04T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch284 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch284-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 75,
        samples: [{ checkedAt, status, failedChecks: ['batch284'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-04T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `drop-batch284-${index}`,
  ] as const))(
    'generated batch284 failedChecks pop after summary changes sample view only %#',
    (checkedAt, droppedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['kept', droppedFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['kept']);
    },
  );
});

describe('release observation batch 285 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-05T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch285 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch285-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 76,
        samples: [{ checkedAt, status, failedChecks: ['batch285'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-05T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch285-${index}`,
  ] as const))(
    'generated batch285 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first', 'second'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['first', replacementFailure]);
    },
  );
});

describe('release observation batch 286 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-06T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch286 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch286-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 77,
        samples: [{ checkedAt, status, failedChecks: ['batch286'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-06T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch286-${index}`,
  ] as const))(
    'generated batch286 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first', 'second'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'second']);
    },
  );
});

describe('release observation batch 287 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-07T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch287 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch287-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 78,
        samples: [{ checkedAt, status, failedChecks: ['batch287'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-07T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copywithin-batch287-${index}`,
  ] as const))(
    'generated batch287 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first', replacementFailure, 'third'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'third']);
    },
  );
});

describe('release observation batch 288 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-08T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch288 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch288-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 79,
        samples: [{ checkedAt, status, failedChecks: ['batch288'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-08T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch288-${index}`,
  ] as const))(
    'generated batch288 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first', replacementFailure, 'third'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['third', replacementFailure, 'first']);
    },
  );
});

describe('release observation batch 289 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-09T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch289 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch289-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 80,
        samples: [{ checkedAt, status, failedChecks: ['batch289'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-09T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch289-${index}`,
  ] as const))(
    'generated batch289 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['z', replacementFailure, 'a'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['a', replacementFailure, 'z']);
    },
  );
});

describe('release observation batch 290 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-10T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch290 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch290-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 81,
        samples: [{ checkedAt, status, failedChecks: ['batch290'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-10T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch290-${index}`,
  ] as const))(
    'generated batch290 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first', 'second'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'first', 'second']);
    },
  );
});

describe('release observation batch 291 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-11T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch291 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch291-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 82,
        samples: [{ checkedAt, status, failedChecks: ['batch291'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-11T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch291-${index}`,
  ] as const))(
    'generated batch291 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['first', replacementFailure]);
    },
  );
});

describe('release observation batch 292 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-12T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch292 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch292-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 83,
        samples: [{ checkedAt, status, failedChecks: ['batch292'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-12T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch292-${index}`,
  ] as const))(
    'generated batch292 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 293 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-13T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch293 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch293-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 84,
        samples: [{ checkedAt, status, failedChecks: ['batch293'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-13T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `push-batch293-${index}`,
  ] as const))(
    'generated batch293 failedChecks push after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first', replacementFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push('tail');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['first', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 294 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-14T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch294 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch294-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 85,
        samples: [{ checkedAt, status, failedChecks: ['batch294'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-14T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch294-${index}`,
  ] as const))(
    'generated batch294 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['first', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['first', replacementFailure]);
    },
  );
});

describe('release observation batch 295 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-15T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch295 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch295-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 86,
        samples: [{ checkedAt, status, failedChecks: ['batch295'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-15T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch295-${index}`,
  ] as const))(
    'generated batch295 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift('head');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 296 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-16T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch296 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch296-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 87,
        samples: [{ checkedAt, status, failedChecks: ['batch296'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-16T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch296-${index}`,
  ] as const))(
    'generated batch296 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 297 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-17T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch297 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch297-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 88,
        samples: [{ checkedAt, status, failedChecks: ['batch297'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-17T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch297-${index}`,
  ] as const))(
    'generated batch297 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 298 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-18T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch298 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch298-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 89,
        samples: [{ checkedAt, status, failedChecks: ['batch298'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-18T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copywithin-batch298-${index}`,
  ] as const))(
    'generated batch298 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 299 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-19T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch299 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch299-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 90,
        samples: [{ checkedAt, status, failedChecks: ['batch299'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-19T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch299-${index}`,
  ] as const))(
    'generated batch299 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 300 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-20T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch300 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch300-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 91,
        samples: [{ checkedAt, status, failedChecks: ['batch300'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-20T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch300-${index}`,
  ] as const))(
    'generated batch300 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 301 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-21T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch301 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch301-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 92,
        samples: [{ checkedAt, status, failedChecks: ['batch301'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-21T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `push-batch301-${index}`,
  ] as const))(
    'generated batch301 failedChecks push after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push('tail');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 302 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-22T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch302 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch302-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 93,
        samples: [{ checkedAt, status, failedChecks: ['batch302'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-22T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch302-${index}`,
  ] as const))(
    'generated batch302 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 303 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-23T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch303 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch303-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 94,
        samples: [{ checkedAt, status, failedChecks: ['batch303'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-23T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch303-${index}`,
  ] as const))(
    'generated batch303 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 304 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-24T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch304 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch304-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 95,
        samples: [{ checkedAt, status, failedChecks: ['batch304'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-24T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch304-${index}`,
  ] as const))(
    'generated batch304 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 305 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-25T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch305 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch305-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 96,
        samples: [{ checkedAt, status, failedChecks: ['batch305'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-25T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch305-${index}`,
  ] as const))(
    'generated batch305 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 306 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-26T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch306 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch306-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 97,
        samples: [{ checkedAt, status, failedChecks: ['batch306'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-26T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copywithin-batch306-${index}`,
  ] as const))(
    'generated batch306 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 307 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-27T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch307 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch307-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 98,
        samples: [{ checkedAt, status, failedChecks: ['batch307'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-27T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch307-${index}`,
  ] as const))(
    'generated batch307 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['tail', replacementFailure, 'head']);
    },
  );
});

describe('release observation batch 308 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-28T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch308 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch308-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 99,
        samples: [{ checkedAt, status, failedChecks: ['batch308'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-28T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch308-${index}`,
  ] as const))(
    'generated batch308 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['z-tail', replacementFailure, 'a-head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['a-head', replacementFailure, 'z-tail']);
    },
  );
});

describe('release observation batch 309 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-29T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch309 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch309-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 100,
        samples: [{ checkedAt, status, failedChecks: ['batch309'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-29T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch309-${index}`,
  ] as const))(
    'generated batch309 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 310 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-30T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch310 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch310-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 101,
        samples: [{ checkedAt, status, failedChecks: ['batch310'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-30T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch310-${index}`,
  ] as const))(
    'generated batch310 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [replacementFailure, 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['middle', 'tail']);
    },
  );
});

describe('release observation batch 311 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-08-31T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch311 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch311-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 102,
        samples: [{ checkedAt, status, failedChecks: ['batch311'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-08-31T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch311-${index}`,
  ] as const))(
    'generated batch311 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'middle', 'tail']);
    },
  );
});

describe('release observation batch 312 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-01T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch312 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch312-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 103,
        samples: [{ checkedAt, status, failedChecks: ['batch312'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-01T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch312-${index}`,
  ] as const))(
    'generated batch312 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 313 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-02T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch313 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch313-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 104,
        samples: [{ checkedAt, status, failedChecks: ['batch313'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-02T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch313-${index}`,
  ] as const))(
    'generated batch313 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 0, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 314 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-03T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch314 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch314-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 105,
        samples: [{ checkedAt, status, failedChecks: ['batch314'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-03T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch314-${index}`,
  ] as const))(
    'generated batch314 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(1, 0, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', 'head', replacementFailure]);
    },
  );
});

describe('release observation batch 315 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-04T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch315 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch315-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 106,
        samples: [{ checkedAt, status, failedChecks: ['batch315'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-04T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch315-${index}`,
  ] as const))(
    'generated batch315 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['tail', replacementFailure, 'head']);
    },
  );
});

describe('release observation batch 316 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-05T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch316 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch316-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 107,
        samples: [{ checkedAt, status, failedChecks: ['batch316'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-05T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch316-${index}`,
  ] as const))(
    'generated batch316 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['zeta', replacementFailure, 'alpha'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['alpha', replacementFailure, 'zeta']);
    },
  );
});

describe('release observation batch 317 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-06T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch317 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([new Error(`inner-${index}`)], `status-batch317-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 108,
        samples: [{ checkedAt, status, failedChecks: ['batch317'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-06T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch317-${index}`,
  ] as const))(
    'generated batch317 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 318 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-07T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch318 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch318-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 109,
        samples: [{ checkedAt, status, failedChecks: ['batch318'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-07T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch318-${index}`,
  ] as const))(
    'generated batch318 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [replacementFailure, 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['middle', 'tail']);
    },
  );
});

describe('release observation batch 319 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-08T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch319 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch319-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 110,
        samples: [{ checkedAt, status, failedChecks: ['batch319'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-08T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch319-${index}`,
  ] as const))(
    'generated batch319 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'middle', 'tail']);
    },
  );
});

describe('release observation batch 320 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-09T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch320 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch320-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 111,
        samples: [{ checkedAt, status, failedChecks: ['batch320'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-09T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch320-${index}`,
  ] as const))(
    'generated batch320 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 321 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-10T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch321 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch321-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 112,
        samples: [{ checkedAt, status, failedChecks: ['batch321'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-10T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch321-${index}`,
  ] as const))(
    'generated batch321 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 322 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-11T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch322 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([new Error('inner')], `status-batch322-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 113,
        samples: [{ checkedAt, status, failedChecks: ['batch322'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-11T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch322-${index}`,
  ] as const))(
    'generated batch322 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 323 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-12T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch323 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch323-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 114,
        samples: [{ checkedAt, status, failedChecks: ['batch323'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-12T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch323-${index}`,
  ] as const))(
    'generated batch323 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [replacementFailure, 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(1, 0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 324 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-13T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch324 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch324-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 115,
        samples: [{ checkedAt, status, failedChecks: ['batch324'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-13T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch324-${index}`,
  ] as const))(
    'generated batch324 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [replacementFailure, 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['tail', 'middle', replacementFailure]);
    },
  );
});

describe('release observation batch 325 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-14T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch325 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch325-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 116,
        samples: [{ checkedAt, status, failedChecks: ['batch325'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-14T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch325-${index}`,
  ] as const))(
    'generated batch325 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['z-tail', replacementFailure, 'a-head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['a-head', replacementFailure, 'z-tail']);
    },
  );
});

describe('release observation batch 326 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-15T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch326 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch326-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 117,
        samples: [{ checkedAt, status, failedChecks: ['batch326'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-15T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch326-${index}`,
  ] as const))(
    'generated batch326 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 327 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-16T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch327 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch327-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 118,
        samples: [{ checkedAt, status, failedChecks: ['batch327'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-16T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `push-batch327-${index}`,
  ] as const))(
    'generated batch327 failedChecks push after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', 'middle', replacementFailure]);
    },
  );
});

describe('release observation batch 328 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-17T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch328 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch328-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 119,
        samples: [{ checkedAt, status, failedChecks: ['batch328'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-17T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch328-${index}`,
  ] as const))(
    'generated batch328 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'middle', 'tail']);
    },
  );
});

describe('release observation batch 329 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-18T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch329 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch329-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 120,
        samples: [{ checkedAt, status, failedChecks: ['batch329'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-18T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch329-${index}`,
  ] as const))(
    'generated batch329 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 0, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 330 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-19T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch330 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([new Error('inner')], `status-batch330-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 121,
        samples: [{ checkedAt, status, failedChecks: ['batch330'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-19T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch330-${index}`,
  ] as const))(
    'generated batch330 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [replacementFailure, 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(2, 0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'middle', replacementFailure]);
    },
  );
});

describe('release observation batch 331 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-20T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch331 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch331-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 122,
        samples: [{ checkedAt, status, failedChecks: ['batch331'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-20T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch331-${index}`,
  ] as const))(
    'generated batch331 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [replacementFailure, 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['tail', 'middle', replacementFailure]);
    },
  );
});

describe('release observation batch 332 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-21T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch332 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch332-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 123,
        samples: [{ checkedAt, status, failedChecks: ['batch332'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-21T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch332-${index}`,
  ] as const))(
    'generated batch332 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 333 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-22T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch333 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch333-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 124,
        samples: [{ checkedAt, status, failedChecks: ['batch333'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-22T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch333-${index}`,
  ] as const))(
    'generated batch333 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 334 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-23T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch334 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch334-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 125,
        samples: [{ checkedAt, status, failedChecks: ['batch334'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-23T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch334-${index}`,
  ] as const))(
    'generated batch334 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 335 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-24T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch335 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch335-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 126,
        samples: [{ checkedAt, status, failedChecks: ['batch335'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-24T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch335-${index}`,
  ] as const))(
    'generated batch335 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['tail', replacementFailure, 'head']);
    },
  );
});

describe('release observation batch 336 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-25T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch336 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch336-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 127,
        samples: [{ checkedAt, status, failedChecks: ['batch336'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-25T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch336-${index}`,
  ] as const))(
    'generated batch336 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 337 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-26T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch337 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch337-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 128,
        samples: [{ checkedAt, status, failedChecks: ['batch337'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-26T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch337-${index}`,
  ] as const))(
    'generated batch337 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 1, 3);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail', 'tail']);
    },
  );
});

describe('release observation batch 338 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-27T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch338 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch338-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 129,
        samples: [{ checkedAt, status, failedChecks: ['batch338'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-27T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch338-${index}`,
  ] as const))(
    'generated batch338 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 339 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-28T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch339 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch339-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 130,
        samples: [{ checkedAt, status, failedChecks: ['batch339'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-28T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `push-batch339-${index}`,
  ] as const))(
    'generated batch339 failedChecks push after summary changes sample view only %#',
    (checkedAt, appendedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push(appendedFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', 'middle', appendedFailure]);
    },
  );
});

describe('release observation batch 340 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-29T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch340 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch340-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 131,
        samples: [{ checkedAt, status, failedChecks: ['batch340'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-29T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch340-${index}`,
  ] as const))(
    'generated batch340 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, prependedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(prependedFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([prependedFailure, 'middle', 'tail']);
    },
  );
});

describe('release observation batch 341 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-09-30T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch341 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch341-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 132,
        samples: [{ checkedAt, status, failedChecks: ['batch341'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-09-30T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch341-${index}`,
  ] as const))(
    'generated batch341 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 342 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-01T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch342 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch342-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 133,
        samples: [{ checkedAt, status, failedChecks: ['batch342'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-01T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `assign-batch342-${index}`,
  ] as const))(
    'generated batch342 failedChecks assignment after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks[1] = replacementFailure;

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 343 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-02T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch343 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch343-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 134,
        samples: [{ checkedAt, status, failedChecks: ['batch343'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-02T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `length-batch343-${index}`,
  ] as const))(
    'generated batch343 failedChecks length truncation after summary changes sample view only %#',
    (checkedAt, retainedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [retainedFailure, 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.length = 1;

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([retainedFailure]);
    },
  );
});

describe('release observation batch 344 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-03T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch344 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch344-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 135,
        samples: [{ checkedAt, status, failedChecks: ['batch344'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-03T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch344-${index}`,
  ] as const))(
    'generated batch344 failedChecks sort after summary changes sample view only %#',
    (checkedAt, retainedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', retainedFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', retainedFailure, 'tail']);
    },
  );
});

describe('release observation batch 345 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-04T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch345 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch345-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 136,
        samples: [{ checkedAt, status, failedChecks: ['batch345'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-04T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch345-${index}`,
  ] as const))(
    'generated batch345 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, retainedFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', retainedFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', 'tail', 'tail']);
    },
  );
});

describe('release observation batch 346 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-05T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch346 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch346-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 137,
        samples: [{ checkedAt, status, failedChecks: ['batch346'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-05T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch346-${index}`,
  ] as const))(
    'generated batch346 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 347 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-06T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch347 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch347-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 138,
        samples: [{ checkedAt, status, failedChecks: ['batch347'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-06T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch347-${index}`,
  ] as const))(
    'generated batch347 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 348 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-07T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch348 URL status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URL(`https://status-batch348.example/${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 139,
        samples: [{ checkedAt, status, failedChecks: ['batch348'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-07T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch348-${index}`,
  ] as const))(
    'generated batch348 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 349 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-08T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch349 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch349-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 140,
        samples: [{ checkedAt, status, failedChecks: ['batch349'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-08T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch349-${index}`,
  ] as const))(
    'generated batch349 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 350 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-09T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch350 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch350-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 141,
        samples: [{ checkedAt, status, failedChecks: ['batch350'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-09T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch350-${index}`,
  ] as const))(
    'generated batch350 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['drop', 'head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 351 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-10T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch351 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch351-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 142,
        samples: [{ checkedAt, status, failedChecks: ['batch351'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-10T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch351-${index}`,
  ] as const))(
    'generated batch351 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail', 'drop'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 352 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-11T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch352 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch352-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 143,
        samples: [{ checkedAt, status, failedChecks: ['batch352'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-11T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `truncate-batch352-${index}`,
  ] as const))(
    'generated batch352 failedChecks length truncation after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail', 'drop'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.length = 3;

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 353 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-12T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch353 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch353-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 144,
        samples: [{ checkedAt, status, failedChecks: ['batch353'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-12T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch353-${index}`,
  ] as const))(
    'generated batch353 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail', 'drop'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(3, 1, 'after-summary');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail', 'after-summary']);
    },
  );
});

describe('release observation batch 354 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-13T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch354 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch354-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 145,
        samples: [{ checkedAt, status, failedChecks: ['batch354'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-13T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch354-${index}`,
  ] as const))(
    'generated batch354 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift('after-summary');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['after-summary', 'head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 355 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-14T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch355 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch355-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 146,
        samples: [{ checkedAt, status, failedChecks: ['batch355'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-14T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `push-batch355-${index}`,
  ] as const))(
    'generated batch355 failedChecks push after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push('after-summary');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail', 'after-summary']);
    },
  );
});

describe('release observation batch 356 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-15T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch356 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch356-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 147,
        samples: [{ checkedAt, status, failedChecks: ['batch356'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-15T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch356-${index}`,
  ] as const))(
    'generated batch356 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 357 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-16T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch357 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch357-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 148,
        samples: [{ checkedAt, status, failedChecks: ['batch357'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-16T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch357-${index}`,
  ] as const))(
    'generated batch357 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['tail', replacementFailure, 'head']);
    },
  );
});

describe('release observation batch 358 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-17T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch358 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch358-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 149,
        samples: [{ checkedAt, status, failedChecks: ['batch358'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-17T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch358-${index}`,
  ] as const))(
    'generated batch358 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['zeta', replacementFailure, 'alpha'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['alpha', replacementFailure, 'zeta']);
    },
  );
});

describe('release observation batch 359 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-18T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch359 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch359-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 150,
        samples: [{ checkedAt, status, failedChecks: ['batch359'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-18T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch359-${index}`,
  ] as const))(
    'generated batch359 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'old', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 360 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-19T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch360 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch360-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 151,
        samples: [{ checkedAt, status, failedChecks: ['batch360'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-19T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch360-${index}`,
  ] as const))(
    'generated batch360 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['zero', replacementFailure, 'two', 'three'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(2, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['zero', replacementFailure, replacementFailure, 'three']);
    },
  );
});

describe('release observation batch 361 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-20T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch361 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch361-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 152,
        samples: [{ checkedAt, status, failedChecks: ['batch361'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-20T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch361-${index}`,
  ] as const))(
    'generated batch361 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'old', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 362 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-21T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch362 TypeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new TypeError(`status-batch362-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 153,
        samples: [{ checkedAt, status, failedChecks: ['batch362'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-21T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch362-${index}`,
  ] as const))(
    'generated batch362 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'head', 'tail']);
    },
  );
});

describe('release observation batch 363 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-22T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch363 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch363-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 154,
        samples: [{ checkedAt, status, failedChecks: ['batch363'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-22T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `push-batch363-${index}`,
  ] as const))(
    'generated batch363 failedChecks push after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.push('tail');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 364 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-23T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch364 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch364-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 155,
        samples: [{ checkedAt, status, failedChecks: ['batch364'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-23T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch364-${index}`,
  ] as const))(
    'generated batch364 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 365 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-24T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch365 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch365-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 156,
        samples: [{ checkedAt, status, failedChecks: ['batch365'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-24T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch365-${index}`,
  ] as const))(
    'generated batch365 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['drop', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 366 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-25T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch366 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch366-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 157,
        samples: [{ checkedAt, status, failedChecks: ['batch366'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-25T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch366-${index}`,
  ] as const))(
    'generated batch366 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 367 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-26T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch367 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch367-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 158,
        samples: [{ checkedAt, status, failedChecks: ['batch367'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-26T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch367-${index}`,
  ] as const))(
    'generated batch367 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['zeta', replacementFailure, 'alpha'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['alpha', replacementFailure, 'zeta']);
    },
  );
});

describe('release observation batch 368 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-27T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch368 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch368-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 159,
        samples: [{ checkedAt, status, failedChecks: ['batch368'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-27T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch368-${index}`,
  ] as const))(
    'generated batch368 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['zero', replacementFailure, 'two'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'two', 'two']);
    },
  );
});

describe('release observation batch 369 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-28T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch369 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch369-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 160,
        samples: [{ checkedAt, status, failedChecks: ['batch369'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-28T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch369-${index}`,
  ] as const))(
    'generated batch369 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['before', replacementFailure, 'after'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 0, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'after']);
    },
  );
});

describe('release observation batch 370 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-29T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch370 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch370-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 161,
        samples: [{ checkedAt, status, failedChecks: ['batch370'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-29T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch370-${index}`,
  ] as const))(
    'generated batch370 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'old', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 371 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-30T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch371 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch371-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 162,
        samples: [{ checkedAt, status, failedChecks: ['batch371'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-30T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch371-${index}`,
  ] as const))(
    'generated batch371 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'middle', 'tail']);
    },
  );
});

describe('release observation batch 372 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-10-31T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch372 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch372-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 163,
        samples: [{ checkedAt, status, failedChecks: ['batch372'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-10-31T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch372-${index}`,
  ] as const))(
    'generated batch372 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['drop', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 373 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-01T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch373 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch373-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 164,
        samples: [{ checkedAt, status, failedChecks: ['batch373'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-01T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch373-${index}`,
  ] as const))(
    'generated batch373 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 374 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-02T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch374 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch374-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 165,
        samples: [{ checkedAt, status, failedChecks: ['batch374'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-02T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch374-${index}`,
  ] as const))(
    'generated batch374 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 375 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-03T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch375 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch375-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 166,
        samples: [{ checkedAt, status, failedChecks: ['batch375'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-03T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copy-batch375-${index}`,
  ] as const))(
    'generated batch375 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['zero', replacementFailure, 'two'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 1);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'two', 'two']);
    },
  );
});

describe('release observation batch 376 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-04T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch376 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch376-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 167,
        samples: [{ checkedAt, status, failedChecks: ['batch376'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-04T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch376-${index}`,
  ] as const))(
    'generated batch376 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['before', replacementFailure, 'after'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 0, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'after']);
    },
  );
});

describe('release observation batch 377 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-05T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch377 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch377-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 168,
        samples: [{ checkedAt, status, failedChecks: ['batch377'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-05T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch377-${index}`,
  ] as const))(
    'generated batch377 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'old', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 378 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-06T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch378 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch378-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 169,
        samples: [{ checkedAt, status, failedChecks: ['batch378'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-06T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch378-${index}`,
  ] as const))(
    'generated batch378 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'middle', 'tail']);
    },
  );
});

describe('release observation batch 379 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-07T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch379 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch379-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 170,
        samples: [{ checkedAt, status, failedChecks: ['batch379'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-07T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `shift-batch379-${index}`,
  ] as const))(
    'generated batch379 failedChecks shift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['drop', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.shift();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 380 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-08T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch380 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch380-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 171,
        samples: [{ checkedAt, status, failedChecks: ['batch380'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-08T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch380-${index}`,
  ] as const))(
    'generated batch380 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 381 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-09T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch381 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch381-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 172,
        samples: [{ checkedAt, status, failedChecks: ['batch381'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-09T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch381-${index}`,
  ] as const))(
    'generated batch381 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 382 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-10T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch382 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch382-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 173,
        samples: [{ checkedAt, status, failedChecks: ['batch382'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-10T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copyWithin-batch382-${index}`,
  ] as const))(
    'generated batch382 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', 'tail', 'tail']);
    },
  );
});

describe('release observation batch 383 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-11T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch383 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch383-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 174,
        samples: [{ checkedAt, status, failedChecks: ['batch383'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-11T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch383-${index}`,
  ] as const))(
    'generated batch383 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 0, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 384 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-12T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch384 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch384-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 175,
        samples: [{ checkedAt, status, failedChecks: ['batch384'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-12T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch384-${index}`,
  ] as const))(
    'generated batch384 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 385 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-13T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch385 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch385-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 176,
        samples: [{ checkedAt, status, failedChecks: ['batch385'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-13T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch385-${index}`,
  ] as const))(
    'generated batch385 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'middle', 'tail']);
    },
  );
});

describe('release observation batch 386 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-14T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch386 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch386-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 177,
        samples: [{ checkedAt, status, failedChecks: ['batch386'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-14T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch386-${index}`,
  ] as const))(
    'generated batch386 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 387 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-15T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch387 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch387-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 178,
        samples: [{ checkedAt, status, failedChecks: ['batch387'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-15T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch387-${index}`,
  ] as const))(
    'generated batch387 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 388 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-16T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch388 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch388-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 179,
        samples: [{ checkedAt, status, failedChecks: ['batch388'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-16T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch388-${index}`,
  ] as const))(
    'generated batch388 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 389 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-17T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch389 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch389-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 180,
        samples: [{ checkedAt, status, failedChecks: ['batch389'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-17T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copyWithin-batch389-${index}`,
  ] as const))(
    'generated batch389 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(1, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', 'tail', 'tail']);
    },
  );
});

describe('release observation batch 390 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-18T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch390 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch390-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 181,
        samples: [{ checkedAt, status, failedChecks: ['batch390'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-18T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch390-${index}`,
  ] as const))(
    'generated batch390 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure, 0, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 391 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-19T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch391 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch391-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 182,
        samples: [{ checkedAt, status, failedChecks: ['batch391'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-19T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch391-${index}`,
  ] as const))(
    'generated batch391 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', 'middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 392 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-20T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch392 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch392-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 183,
        samples: [{ checkedAt, status, failedChecks: ['batch392'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-20T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch392-${index}`,
  ] as const))(
    'generated batch392 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['middle', 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, 'middle', 'tail']);
    },
  );
});

describe('release observation batch 393 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-21T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch393 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch393-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 184,
        samples: [{ checkedAt, status, failedChecks: ['batch393'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-21T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch393-${index}`,
  ] as const))(
    'generated batch393 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 394 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-22T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch394 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch394-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 185,
        samples: [{ checkedAt, status, failedChecks: ['batch394'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-22T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch394-${index}`,
  ] as const))(
    'generated batch394 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['tail', replacementFailure, 'head']);
    },
  );
});

describe('release observation batch 395 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-23T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch395 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch395-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 186,
        samples: [{ checkedAt, status, failedChecks: ['batch395'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-23T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch395-${index}`,
  ] as const))(
    'generated batch395 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 396 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-24T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch396 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch396-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 187,
        samples: [{ checkedAt, status, failedChecks: ['batch396'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-24T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copyWithin-batch396-${index}`,
  ] as const))(
    'generated batch396 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['alpha', replacementFailure, 'beta'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['beta', replacementFailure, 'beta']);
    },
  );
});

describe('release observation batch 397 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-25T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch397 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch397-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 188,
        samples: [{ checkedAt, status, failedChecks: ['batch397'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-25T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch397-${index}`,
  ] as const))(
    'generated batch397 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, replacementFailure]);
    },
  );
});

describe('release observation batch 398 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-26T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch398 EvalError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new EvalError(`status-batch398-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 189,
        samples: [{ checkedAt, status, failedChecks: ['batch398'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-26T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `splice-batch398-${index}`,
  ] as const))(
    'generated batch398 failedChecks splice after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.splice(1, 1, 'spliced-a', 'spliced-b');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', 'spliced-a', 'spliced-b', 'tail']);
    },
  );
});

describe('release observation batch 399 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-27T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch399 AggregateError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new AggregateError([], `status-batch399-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 190,
        samples: [{ checkedAt, status, failedChecks: ['batch399'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-27T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `unshift-batch399-${index}`,
  ] as const))(
    'generated batch399 failedChecks unshift after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: [replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.unshift('prepended');

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['prepended', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 400 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-28T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch400 Error status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new Error(`status-batch400-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 191,
        samples: [{ checkedAt, status, failedChecks: ['batch400'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-28T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `pop-batch400-${index}`,
  ] as const))(
    'generated batch400 failedChecks pop after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.pop();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure]);
    },
  );
});

describe('release observation batch 401 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-29T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch401 RangeError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new RangeError(`status-batch401-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 192,
        samples: [{ checkedAt, status, failedChecks: ['batch401'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-29T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `reverse-batch401-${index}`,
  ] as const))(
    'generated batch401 failedChecks reverse after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['head', replacementFailure, 'tail'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.reverse();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['tail', replacementFailure, 'head']);
    },
  );
});

describe('release observation batch 402 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-11-30T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch402 SyntaxError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new SyntaxError(`status-batch402-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 193,
        samples: [{ checkedAt, status, failedChecks: ['batch402'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-11-30T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `sort-batch402-${index}`,
  ] as const))(
    'generated batch402 failedChecks sort after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['tail', replacementFailure, 'head'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.sort();

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['head', replacementFailure, 'tail']);
    },
  );
});

describe('release observation batch 403 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-12-01T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch403 URIError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new URIError(`status-batch403-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 194,
        samples: [{ checkedAt, status, failedChecks: ['batch403'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-01T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `copyWithin-batch403-${index}`,
  ] as const))(
    'generated batch403 failedChecks copyWithin after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['alpha', replacementFailure, 'beta'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.copyWithin(0, 2);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual(['beta', replacementFailure, 'beta']);
    },
  );
});

describe('release observation batch 404 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2026-12-02T00:${String(index % 50).padStart(2, '0')}:00.000Z`,
    index,
  ] as const))(
    'generated batch404 ReferenceError status is retained without failure count %s',
    (checkedAt, index) => {
      const status = new ReferenceError(`status-batch404-${index}`) as unknown as 'NO_GO';
      const summary = summarizeReleaseObservation({
        windowMinutes: 195,
        samples: [{ checkedAt, status, failedChecks: ['batch404'] }],
      });

      expect(summary.status).toBe('STABLE');
      expect(summary.failedSamples).toBe(0);
      expect(summary.latestStatus).toBe(status);
      expect(summary.firstFailureAt).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-12-02T01:${String(index % 50).padStart(2, '0')}:00.000Z`,
    `fill-batch404-${index}`,
  ] as const))(
    'generated batch404 failedChecks fill after summary changes sample view only %#',
    (checkedAt, replacementFailure) => {
      const sample = { checkedAt, status: 'NO_GO' as const, failedChecks: ['one', 'two', 'three'] };
      const summary = summarizeReleaseObservation({ windowMinutes: 1, samples: [sample] });
      sample.failedChecks.fill(replacementFailure);

      expect(summary.status).toBe('ATTENTION_REQUIRED');
      expect(summary.failedSamples).toBe(1);
      expect(summary.firstFailureAt).toBe(checkedAt);
      expect(summary.samples[0].failedChecks).toEqual([replacementFailure, replacementFailure, replacementFailure]);
    },
  );
});
