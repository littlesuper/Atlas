import { collectLogFiles, searchRequestIdInFiles, type LogSearchResult } from './logSearch';

export type IncidentContextOptions = {
  baseUrl: string;
  metricsToken?: string;
  service?: string;
  environment?: string;
  requestId?: string;
  logRoots?: string[];
  collectedAt?: Date;
};

export type IncidentContext = {
  collectedAt: string;
  service: string;
  environment: string;
  baseUrl: string;
  health: unknown;
  metrics: unknown;
  featureFlags: unknown;
  logs?: LogSearchResult;
};

export async function collectIncidentContext(
  options: IncidentContextOptions,
): Promise<IncidentContext> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const headers = options.metricsToken
    ? { Authorization: `Bearer ${options.metricsToken}` }
    : undefined;
  const [health, metrics, featureFlags] = await Promise.all([
    fetchJson(`${baseUrl}/api/health`),
    fetchJson(`${baseUrl}/api/metrics`, headers ? { headers } : undefined),
    fetchJson(`${baseUrl}/api/feature-flags`),
  ]);
  const logs =
    options.requestId && options.logRoots && options.logRoots.length > 0
      ? await searchRequestIdInFiles(options.requestId, collectLogFiles(options.logRoots))
      : undefined;

  return {
    collectedAt: (options.collectedAt ?? new Date()).toISOString(),
    service: options.service ?? 'atlas-api',
    environment: options.environment ?? process.env.NODE_ENV ?? 'development',
    baseUrl,
    health,
    metrics,
    featureFlags,
    ...(logs ? { logs } : {}),
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(
      `Incident context fetch failed for ${url} with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
    );
  }

  return response.json();
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}
