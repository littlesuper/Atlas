export type QualityBlockerRegisterStatus = 'CLEAR' | 'ACTION_REQUIRED' | 'BLOCKED';
export type QualityBlockerAcceptanceStatus = 'ACCEPTED' | 'ACTION_REQUIRED';

export type QualityBlockerResolution = {
  mode: 'QUALITY_BLOCKER_RESOLUTION';
  status: 'RESOLVED' | 'ACTION_REQUIRED';
  generatedAt: string;
  resolutionPath: 'CLEARED' | 'ACCEPTED' | 'PENDING';
  nextCommand: string;
  explanation: string;
};

export function buildQualityBlockerResolution(input: {
  blockerRegisterStatus: QualityBlockerRegisterStatus;
  blockerAcceptanceStatus: QualityBlockerAcceptanceStatus;
  generatedAt?: Date;
}): QualityBlockerResolution {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();

  if (input.blockerRegisterStatus === 'CLEAR') {
    return {
      mode: 'QUALITY_BLOCKER_RESOLUTION',
      status: 'RESOLVED',
      generatedAt,
      resolutionPath: 'CLEARED',
      nextCommand: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
      explanation: 'All blockers are cleared; continue to evidence intake.',
    };
  }

  if (input.blockerAcceptanceStatus === 'ACCEPTED') {
    return {
      mode: 'QUALITY_BLOCKER_RESOLUTION',
      status: 'RESOLVED',
      generatedAt,
      resolutionPath: 'ACCEPTED',
      nextCommand: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
      explanation: 'Open blockers have complete acceptance records; continue to evidence intake.',
    };
  }

  return {
    mode: 'QUALITY_BLOCKER_RESOLUTION',
    status: 'ACTION_REQUIRED',
    generatedAt,
    resolutionPath: 'PENDING',
    nextCommand: 'npm run quality:blocker-acceptance --workspace=server -- --accept ...',
    explanation: 'Blockers are still open and no complete acceptance record exists.',
  };
}
