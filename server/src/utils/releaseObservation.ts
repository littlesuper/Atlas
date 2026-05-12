export type ReleaseObservationSample = {
  checkedAt: string;
  status: 'GO' | 'NO_GO';
  failedChecks: string[];
};

export type ReleaseObservationSummary = {
  generatedAt: string;
  windowMinutes: number;
  status: 'STABLE' | 'ATTENTION_REQUIRED' | 'NO_SAMPLES';
  totalSamples: number;
  failedSamples: number;
  firstFailureAt: string | null;
  latestStatus: 'GO' | 'NO_GO' | null;
  recommendation: string;
  samples: ReleaseObservationSample[];
};

export function summarizeReleaseObservation(options: {
  windowMinutes: number;
  samples: ReleaseObservationSample[];
  generatedAt?: Date;
}): ReleaseObservationSummary {
  const failedSamples = options.samples.filter((sample) => sample.status === 'NO_GO');
  const latestSample = options.samples[options.samples.length - 1];
  const status = options.samples.length === 0
    ? 'NO_SAMPLES'
    : failedSamples.length > 0
      ? 'ATTENTION_REQUIRED'
      : 'STABLE';

  return {
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    windowMinutes: options.windowMinutes,
    status,
    totalSamples: options.samples.length,
    failedSamples: failedSamples.length,
    firstFailureAt: failedSamples[0]?.checkedAt ?? null,
    latestStatus: latestSample?.status ?? null,
    recommendation: recommendationFor(status),
    samples: options.samples,
  };
}

function recommendationFor(status: ReleaseObservationSummary['status']): string {
  switch (status) {
    case 'STABLE':
      return 'Continue normal post-release monitoring until the observation window ends.';
    case 'ATTENTION_REQUIRED':
      return 'Start incident response, collect context, and prepare feature flag mitigation or rollback.';
    case 'NO_SAMPLES':
    default:
      return 'No release observation samples were collected; rerun release observation with at least one check.';
  }
}
