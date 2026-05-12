import {
  QualityBlockerAcceptanceStatus,
  QualityBlockerRegisterStatus,
  buildQualityBlockerResolution,
} from '../utils/qualityBlockerResolution';

function parseArgs(args: string[]): {
  blockerRegisterStatus: QualityBlockerRegisterStatus;
  blockerAcceptanceStatus: QualityBlockerAcceptanceStatus;
} {
  let blockerRegisterStatus: QualityBlockerRegisterStatus = 'ACTION_REQUIRED';
  let blockerAcceptanceStatus: QualityBlockerAcceptanceStatus = 'ACTION_REQUIRED';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--blocker-register-status') {
      blockerRegisterStatus = parseRegisterStatus(requireValue(arg, value));
      index += 1;
      continue;
    }

    if (arg === '--blocker-acceptance-status') {
      blockerAcceptanceStatus = parseAcceptanceStatus(requireValue(arg, value));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    blockerRegisterStatus,
    blockerAcceptanceStatus,
  };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseRegisterStatus(value: string): QualityBlockerRegisterStatus {
  if (value === 'CLEAR' || value === 'ACTION_REQUIRED' || value === 'BLOCKED') {
    return value;
  }

  throw new Error('--blocker-register-status must be CLEAR, ACTION_REQUIRED or BLOCKED.');
}

function parseAcceptanceStatus(value: string): QualityBlockerAcceptanceStatus {
  if (value === 'ACCEPTED' || value === 'ACTION_REQUIRED') {
    return value;
  }

  throw new Error('--blocker-acceptance-status must be ACCEPTED or ACTION_REQUIRED.');
}

function main(): void {
  const resolution = buildQualityBlockerResolution(parseArgs(process.argv.slice(2)));

  console.log(JSON.stringify(resolution, null, 2));

  if (resolution.status !== 'RESOLVED') {
    process.exit(1);
  }
}

main();
