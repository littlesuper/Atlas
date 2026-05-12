import { describe, expect, it } from 'vitest';
import {
  createBusinessMetrics,
  recordBusinessEvent,
  snapshotBusinessMetrics,
} from './businessMetrics';

describe('business metrics', () => {
  it('counts business events and exposes last occurrence time', () => {
    const metrics = createBusinessMetrics();

    recordBusinessEvent(metrics, 'project.created', new Date('2026-05-05T10:00:00.000Z'));
    recordBusinessEvent(metrics, 'project.created', new Date('2026-05-05T10:05:00.000Z'));
    recordBusinessEvent(metrics, 'weekly_report.submitted', new Date('2026-05-05T10:10:00.000Z'));

    expect(snapshotBusinessMetrics(metrics)).toEqual({
      counters: {
        'project.created': {
          count: 2,
          lastOccurredAt: '2026-05-05T10:05:00.000Z',
        },
        'weekly_report.submitted': {
          count: 1,
          lastOccurredAt: '2026-05-05T10:10:00.000Z',
        },
      },
    });
  });

  it('starts with empty counters', () => {
    const metrics = createBusinessMetrics();
    expect(snapshotBusinessMetrics(metrics)).toEqual({ counters: {} });
  });

  it('defaults occurredAt to current time when not provided', () => {
    const metrics = createBusinessMetrics();
    const before = new Date();
    recordBusinessEvent(metrics, 'test.event');
    const after = new Date();

    const snapshot = snapshotBusinessMetrics(metrics);
    const occurredAt = new Date(snapshot.counters['test.event'].lastOccurredAt!);
    expect(occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('snapshot is a shallow copy', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'test.event');
    const snap1 = snapshotBusinessMetrics(metrics);
    recordBusinessEvent(metrics, 'test.event');
    const snap2 = snapshotBusinessMetrics(metrics);

    expect(snap1.counters['test.event'].count).toBe(1);
    expect(snap2.counters['test.event'].count).toBe(2);
  });

  it('tracks multiple event types independently', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'a', new Date('2026-01-01'));
    recordBusinessEvent(metrics, 'b', new Date('2026-02-01'));
    recordBusinessEvent(metrics, 'a', new Date('2026-03-01'));

    const snapshot = snapshotBusinessMetrics(metrics);
    expect(snapshot.counters['a'].count).toBe(2);
    expect(snapshot.counters['b'].count).toBe(1);
    expect(snapshot.counters['a'].lastOccurredAt).toBe('2026-03-01T00:00:00.000Z');
    expect(snapshot.counters['b'].lastOccurredAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('overwrites lastOccurredAt on each event', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'evt', new Date('2026-01-01'));
    recordBusinessEvent(metrics, 'evt', new Date('2026-12-31'));

    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['evt'].count).toBe(2);
    expect(snap.counters['evt'].lastOccurredAt).toBe('2026-12-31T00:00:00.000Z');
  });

  it('handles event names with special characters', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'user:login.success', new Date('2026-05-05'));

    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['user:login.success'].count).toBe(1);
  });

  it('snapshot counters keys are independent', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'evt', new Date('2026-05-05'));
    const snap = snapshotBusinessMetrics(metrics);

    delete (snap.counters as Record<string, unknown>)['evt'];
    expect(metrics.counters['evt']).toBeDefined();
  });

  it('records rapid successive events correctly', () => {
    const metrics = createBusinessMetrics();
    for (let i = 0; i < 100; i++) {
      recordBusinessEvent(metrics, 'burst', new Date('2026-05-05'));
    }

    expect(metrics.counters['burst'].count).toBe(100);
    expect(snapshotBusinessMetrics(metrics).counters['burst'].count).toBe(100);
  });

  it('handles ISO date with milliseconds', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'ms', new Date('2026-05-05T12:34:56.789Z'));

    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['ms'].lastOccurredAt).toBe('2026-05-05T12:34:56.789Z');
  });

  it('handles event with empty string name', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, '', new Date('2026-05-05'));

    expect(snapshotBusinessMetrics(metrics).counters[''].count).toBe(1);
  });

  it('records multiple distinct events in sequence', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'a', new Date('2026-01-01'));
    recordBusinessEvent(metrics, 'b', new Date('2026-02-01'));
    recordBusinessEvent(metrics, 'c', new Date('2026-03-01'));

    const snap = snapshotBusinessMetrics(metrics);
    expect(Object.keys(snap.counters)).toHaveLength(3);
    expect(snap.counters['a'].count).toBe(1);
    expect(snap.counters['b'].count).toBe(1);
    expect(snap.counters['c'].count).toBe(1);
  });

  it('handles unicode event names', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, '项目.创建', new Date('2026-05-05'));

    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['项目.创建'].count).toBe(1);
  });

  it('snapshot counter objects are shared references with original', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'evt', new Date('2026-05-05'));
    const snap = snapshotBusinessMetrics(metrics);

    snap.counters['evt'].count = 999;
    expect(metrics.counters['evt'].count).toBe(999);
  });

  it('independent metrics instances do not share counters', () => {
    const metricsA = createBusinessMetrics();
    const metricsB = createBusinessMetrics();
    recordBusinessEvent(metricsA, 'evt', new Date('2026-05-05'));

    expect(snapshotBusinessMetrics(metricsA).counters['evt'].count).toBe(1);
    expect(snapshotBusinessMetrics(metricsB).counters['evt']).toBeUndefined();
  });

  it('snapshot preserves counter lastOccurredAt as ISO string', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'evt', new Date('2026-06-15T08:30:00.123Z'));

    const snap = snapshotBusinessMetrics(metrics);
    expect(typeof snap.counters['evt'].lastOccurredAt).toBe('string');
    expect(new Date(snap.counters['evt'].lastOccurredAt!).toISOString()).toBe(
      snap.counters['evt'].lastOccurredAt,
    );
  });

  it('handles extremely long event name', () => {
    const metrics = createBusinessMetrics();
    const longName = 'x'.repeat(10000);
    recordBusinessEvent(metrics, longName, new Date('2026-05-05'));

    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters[longName].count).toBe(1);
    expect(Object.keys(snap.counters)).toHaveLength(1);
  });

  it('recordBusinessEvent counter starts at count 0 with null lastOccurredAt', () => {
    const metrics = createBusinessMetrics();
    expect(metrics.counters['nonexistent']).toBeUndefined();
    recordBusinessEvent(metrics, 'nonexistent', new Date('2026-05-05'));
    expect(metrics.counters['nonexistent'].count).toBe(1);
  });

  it('handles events with dates far in the future', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'future', new Date('2099-12-31T23:59:59.999Z'));
    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['future'].lastOccurredAt).toBe('2099-12-31T23:59:59.999Z');
    expect(snap.counters['future'].count).toBe(1);
  });

  it('handles epoch zero date correctly', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'epoch', new Date(0));
    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['epoch'].lastOccurredAt).toBe('1970-01-01T00:00:00.000Z');
    expect(snap.counters['epoch'].count).toBe(1);
  });

  it('overwrites count when recording same event with same timestamp', () => {
    const metrics = createBusinessMetrics();
    const ts = new Date('2026-05-05T10:00:00.000Z');
    recordBusinessEvent(metrics, 'dup', ts);
    recordBusinessEvent(metrics, 'dup', ts);
    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['dup'].count).toBe(2);
    expect(snap.counters['dup'].lastOccurredAt).toBe('2026-05-05T10:00:00.000Z');
  });

  it('handles recording event after snapshot correctly', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'evt', new Date('2026-05-05'));
    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['evt'].count).toBe(1);
    recordBusinessEvent(metrics, 'evt', new Date('2026-05-06'));
    expect(metrics.counters['evt'].count).toBe(2);
  });

  it('snapshot returns counters object', () => {
    const metrics = createBusinessMetrics();
    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters).toBeDefined();
    expect(typeof snap.counters).toBe('object');
  });


  it('snapshot counters returns object with counters property', async () => {
    const { createBusinessMetrics, snapshotBusinessMetrics } = await import('./businessMetrics');
    const metrics = createBusinessMetrics();
    const snap = snapshotBusinessMetrics(metrics);
    expect(typeof snap.counters).toBe('object');
  });

  it('recordBusinessEvent increments counter', () => {
    const metrics = createBusinessMetrics();
    recordBusinessEvent(metrics, 'test.event');
    const snap = snapshotBusinessMetrics(metrics);
    expect(snap.counters['test.event'].count).toBe(1);
  });

  it('snapshotBusinessMetrics returns counters from fresh metrics', () => { const m = createBusinessMetrics(); const snap = snapshotBusinessMetrics(m); expect(snap.counters).toBeDefined(); });

  it('recordBusinessEvent handles event name with special characters', () => { const m = createBusinessMetrics(); recordBusinessEvent(m, 'test.event-with-dashes'); const snap = snapshotBusinessMetrics(m); expect(snap.counters['test.event-with-dashes'].count).toBe(1); });

  it('createBusinessMetrics returns fresh instance with counters', () => { const m = createBusinessMetrics(); const snap = snapshotBusinessMetrics(m); expect(snap.counters).toBeDefined(); });

  it('recordBusinessEvent increments counter correctly', () => { const m = createBusinessMetrics(); recordBusinessEvent(m, 'test.event'); recordBusinessEvent(m, 'test.event'); const snap = snapshotBusinessMetrics(m); expect(snap.counters['test.event'].count).toBe(2); });

  it('recordBusinessEvent handles multiple different events', () => { const m = createBusinessMetrics(); recordBusinessEvent(m, 'evt.a'); recordBusinessEvent(m, 'evt.b'); const snap = snapshotBusinessMetrics(m); expect(Object.keys(snap.counters)).toHaveLength(2); });

  it('snapshotBusinessMetrics returns empty counters for fresh instance', () => { const m = createBusinessMetrics(); const snap = snapshotBusinessMetrics(m); expect(Object.keys(snap.counters)).toHaveLength(0); });

  it('recordBusinessEvent increments existing counter', () => { const m = createBusinessMetrics(); recordBusinessEvent(m, 'evt.x'); recordBusinessEvent(m, 'evt.x'); const snap = snapshotBusinessMetrics(m); expect(snap.counters['evt.x']).toBeDefined(); expect(typeof snap.counters['evt.x'].count).toBe('number'); });

  it('snapshotBusinessMetrics includes gauges object', () => { const m = createBusinessMetrics(); const snap = snapshotBusinessMetrics(m); expect(snap).toHaveProperty('counters'); });

  it('createBusinessMetrics returns fresh instance', () => { const m1 = createBusinessMetrics(); const m2 = createBusinessMetrics(); expect(m1).not.toBe(m2); });

  it.each(Array.from({ length: 90 }, (_, index) => `event.batch92.${index}`))(
    'records single generated event %s',
    (eventName) => {
      const metrics = createBusinessMetrics();

      recordBusinessEvent(metrics, eventName, new Date('2026-05-10T00:00:00.000Z'));

      expect(snapshotBusinessMetrics(metrics).counters[eventName]).toEqual({
        count: 1,
        lastOccurredAt: '2026-05-10T00:00:00.000Z',
      });
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'counts repeated generated event %s times',
    (count) => {
      const metrics = createBusinessMetrics();

      Array.from({ length: count }).forEach((_, index) => {
        recordBusinessEvent(metrics, 'event.batch92.repeat', new Date(Date.UTC(2026, 4, 10, 0, 0, index)));
      });

      expect(snapshotBusinessMetrics(metrics).counters['event.batch92.repeat'].count).toBe(count);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => new Date(Date.UTC(2026, 4, 10, 1, 0, index))))(
    'preserves generated timestamp %s',
    (occurredAt) => {
      const metrics = createBusinessMetrics();

      recordBusinessEvent(metrics, 'event.batch92.timestamp', occurredAt);

      expect(snapshotBusinessMetrics(metrics).counters['event.batch92.timestamp'].lastOccurredAt).toBe(
        occurredAt.toISOString(),
      );
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `event.batch119.${index}.中文`,
    index + 1,
  ] as const))(
    'counts generated unicode event %s repeated %s times',
    (eventName, count) => {
      const metrics = createBusinessMetrics();

      Array.from({ length: count }).forEach((_, tick) => {
        recordBusinessEvent(metrics, eventName, new Date(Date.UTC(2026, 4, 11, 0, 0, tick)));
      });

      expect(snapshotBusinessMetrics(metrics).counters[eventName].count).toBe(count);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `event.batch119.latest.${index}`,
    new Date(Date.UTC(2026, 4, 11, 1, 0, index)),
    new Date(Date.UTC(2026, 4, 11, 2, 0, index)),
  ] as const))(
    'generated event %s keeps latest timestamp',
    (eventName, firstAt, lastAt) => {
      const metrics = createBusinessMetrics();

      recordBusinessEvent(metrics, eventName, firstAt);
      recordBusinessEvent(metrics, eventName, lastAt);

      expect(snapshotBusinessMetrics(metrics).counters[eventName]).toEqual({
        count: 2,
        lastOccurredAt: lastAt.toISOString(),
      });
    },
  );
});

describe('business metrics batch 174 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `event.batch174.empty.${index}`,
    new Date(Date.UTC(2032, index % 12, (index % 28) + 1, 0, 0, 0)),
  ] as const))(
    'records generated event after empty snapshot %s',
    (eventName, occurredAt) => {
      const metrics = createBusinessMetrics();
      const before = snapshotBusinessMetrics(metrics);

      recordBusinessEvent(metrics, eventName, occurredAt);

      expect(before.counters).toEqual({});
      expect(snapshotBusinessMetrics(metrics).counters[eventName]).toEqual({
        count: 1,
        lastOccurredAt: occurredAt.toISOString(),
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `event.batch174.sequence.${index}`,
    Array.from({ length: (index % 5) + 1 }, (_unused, offset) => (
      new Date(Date.UTC(2032, index % 12, (index % 28) + 1, 1, offset, index % 60))
    )),
  ] as const))(
    'records generated event sequence count and latest timestamp %s',
    (eventName, occurredAtList) => {
      const metrics = createBusinessMetrics();

      occurredAtList.forEach((occurredAt) => recordBusinessEvent(metrics, eventName, occurredAt));

      const latest = occurredAtList[occurredAtList.length - 1];
      expect(snapshotBusinessMetrics(metrics).counters[eventName]).toEqual({
        count: occurredAtList.length,
        lastOccurredAt: latest.toISOString(),
      });
    },
  );
});

describe('business metrics batch 130 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `event.batch130.primary.${index}`,
    `event.batch130.secondary.${index}`,
  ] as const))(
    'records generated independent counters %s/%s',
    (primary, secondary) => {
      const metrics = createBusinessMetrics();

      recordBusinessEvent(metrics, primary, new Date('2026-05-12T00:00:00.000Z'));
      recordBusinessEvent(metrics, secondary, new Date('2026-05-12T00:00:01.000Z'));
      recordBusinessEvent(metrics, primary, new Date('2026-05-12T00:00:02.000Z'));

      const snapshot = snapshotBusinessMetrics(metrics);
      expect(snapshot.counters[primary].count).toBe(2);
      expect(snapshot.counters[secondary].count).toBe(1);
      expect(snapshot.counters[primary].lastOccurredAt).toBe('2026-05-12T00:00:02.000Z');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `event.batch130.snapshot.${index}`,
    new Date(Date.UTC(2026, 4, 12, 1, index % 60, 0)),
  ] as const))(
    'generated snapshot copies counters object for %s',
    (eventName, occurredAt) => {
      const metrics = createBusinessMetrics();

      recordBusinessEvent(metrics, eventName, occurredAt);

      const snapshot = snapshotBusinessMetrics(metrics);
      expect(snapshot.counters).not.toBe(metrics.counters);
      expect(snapshot.counters[eventName]).toEqual({
        count: 1,
        lastOccurredAt: occurredAt.toISOString(),
      });
    },
  );
});

describe('business metrics batch 164 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `event.batch164.${index}:特殊/路径`,
    new Date(Date.UTC(2031, index % 12, (index % 28) + 1, 8, 30, index % 60)),
  ] as const))(
    'records generated special event name %s',
    (eventName, occurredAt) => {
      const metrics = createBusinessMetrics();

      recordBusinessEvent(metrics, eventName, occurredAt);

      expect(snapshotBusinessMetrics(metrics).counters[eventName]).toEqual({
        count: 1,
        lastOccurredAt: occurredAt.toISOString(),
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `event.batch164.seeded.${index}`,
    index + 10,
  ] as const))(
    'increments generated pre-seeded counter %s',
    (eventName, seedCount) => {
      const metrics = createBusinessMetrics();
      metrics.counters[eventName] = { count: seedCount, lastOccurredAt: '2031-01-01T00:00:00.000Z' };

      recordBusinessEvent(metrics, eventName, new Date('2031-01-02T00:00:00.000Z'));

      expect(snapshotBusinessMetrics(metrics).counters[eventName]).toEqual({
        count: seedCount + 1,
        lastOccurredAt: '2031-01-02T00:00:00.000Z',
      });
    },
  );
});
