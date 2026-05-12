type HealthSnapshot = {
  status?: string;
  checks?: {
    database?: { status?: string };
  };
};

type MetricsSnapshot = {
  status?: string;
  alerts?: Array<{ id?: string; priority?: string }>;
};

type FeatureFlagsSnapshot = {
  status?: string;
  unknownFlags?: string[];
};

export type ReleaseReadinessCheck = {
  id: 'health_status' | 'database_health' | 'metrics_status' | 'active_alerts' | 'feature_flag_config';
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
};

export type ReleaseReadinessReport = {
  evaluatedAt: string;
  status: 'GO' | 'NO_GO';
  checks: ReleaseReadinessCheck[];
};

export function evaluateReleaseReadiness(options: {
  health: unknown;
  metrics: unknown;
  featureFlags?: unknown;
  evaluatedAt?: Date;
}): ReleaseReadinessReport {
  const health = asHealthSnapshot(options.health);
  const metrics = asMetricsSnapshot(options.metrics);
  const featureFlags = asFeatureFlagsSnapshot(options.featureFlags);
  const checks: ReleaseReadinessCheck[] = [
    evaluateHealthStatus(health),
    evaluateDatabaseHealth(health),
    evaluateMetricsStatus(metrics),
    evaluateActiveAlerts(metrics),
    evaluateFeatureFlagConfiguration(featureFlags),
  ];

  return {
    evaluatedAt: (options.evaluatedAt ?? new Date()).toISOString(),
    status: checks.some((check) => check.status === 'FAIL') ? 'NO_GO' : 'GO',
    checks,
  };
}

function evaluateFeatureFlagConfiguration(featureFlags: FeatureFlagsSnapshot): ReleaseReadinessCheck {
  const unknownFlags = Array.isArray(featureFlags.unknownFlags) ? featureFlags.unknownFlags : [];
  if (unknownFlags.length === 0) {
    return {
      id: 'feature_flag_config',
      status: 'PASS',
      message: 'Feature flag configuration has no unknown flags',
    };
  }

  return {
    id: 'feature_flag_config',
    status: 'FAIL',
    message: `Unknown feature flags configured: ${unknownFlags.join(', ')}`,
  };
}

function evaluateHealthStatus(health: HealthSnapshot): ReleaseReadinessCheck {
  if (health.status === 'ok') {
    return { id: 'health_status', status: 'PASS', message: 'Health endpoint status is ok' };
  }

  return {
    id: 'health_status',
    status: 'FAIL',
    message: `Health endpoint status is ${health.status ?? 'missing'}`,
  };
}

function evaluateDatabaseHealth(health: HealthSnapshot): ReleaseReadinessCheck {
  const databaseStatus = health.checks?.database?.status;
  if (!databaseStatus) {
    return {
      id: 'database_health',
      status: 'WARN',
      message: 'Database health check is not present',
    };
  }

  if (databaseStatus === 'ok') {
    return { id: 'database_health', status: 'PASS', message: 'Database health check is ok' };
  }

  return {
    id: 'database_health',
    status: 'FAIL',
    message: `Database health check is ${databaseStatus}`,
  };
}

function evaluateMetricsStatus(metrics: MetricsSnapshot): ReleaseReadinessCheck {
  if (metrics.status === 'ok') {
    return { id: 'metrics_status', status: 'PASS', message: 'Metrics endpoint status is ok' };
  }

  return {
    id: 'metrics_status',
    status: 'FAIL',
    message: `Metrics endpoint status is ${metrics.status ?? 'missing'}`,
  };
}

function evaluateActiveAlerts(metrics: MetricsSnapshot): ReleaseReadinessCheck {
  const alerts = Array.isArray(metrics.alerts) ? metrics.alerts : [];
  if (alerts.length === 0) {
    return { id: 'active_alerts', status: 'PASS', message: 'No active metric alerts' };
  }

  const alertIds = alerts.map((alert) => alert.id ?? 'unknown').join(', ');
  return {
    id: 'active_alerts',
    status: 'FAIL',
    message: `${alerts.length} active metric alert(s): ${alertIds}`,
  };
}

function asHealthSnapshot(value: unknown): HealthSnapshot {
  return isRecord(value) ? (value as HealthSnapshot) : {};
}

function asMetricsSnapshot(value: unknown): MetricsSnapshot {
  return isRecord(value) ? (value as MetricsSnapshot) : {};
}

function asFeatureFlagsSnapshot(value: unknown): FeatureFlagsSnapshot {
  return isRecord(value) ? (value as FeatureFlagsSnapshot) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
