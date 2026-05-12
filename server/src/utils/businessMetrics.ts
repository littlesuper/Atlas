export type BusinessMetrics = {
  counters: Record<string, { count: number; lastOccurredAt: string | null }>;
};

export function createBusinessMetrics(): BusinessMetrics {
  return {
    counters: {},
  };
}

export function recordBusinessEvent(
  metrics: BusinessMetrics,
  event: string,
  occurredAt: Date = new Date(),
) {
  const current = metrics.counters[event] ?? { count: 0, lastOccurredAt: null };
  metrics.counters[event] = {
    count: current.count + 1,
    lastOccurredAt: occurredAt.toISOString(),
  };
}

export function snapshotBusinessMetrics(metrics: BusinessMetrics) {
  return {
    counters: { ...metrics.counters },
  };
}

export const businessMetrics = createBusinessMetrics();
