import { QualityClosureStepInput, buildDefaultQualityClosureSequence, buildQualityClosureSequence } from '../utils/qualityClosureSequence';

function parseArgs(args: string[]): QualityClosureStepInput[] {
  const steps: QualityClosureStepInput[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg !== '--step') {
      throw new Error(`Unknown argument: ${arg}`);
    }

    steps.push(parseStep(requireValue(arg, value)));
    index += 1;
  }

  return steps;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseStep(value: string): QualityClosureStepInput {
  const [name, command, status, expectedNextStatus, owner] = value.split('|').map((part) => part.trim());

  if (!name || !command || !status || !expectedNextStatus || !owner) {
    throw new Error('--step must use "name|command|status|expectedNextStatus|owner" format.');
  }

  if (!isStepStatus(status) || !isStepStatus(expectedNextStatus)) {
    throw new Error('--step status and expectedNextStatus are invalid.');
  }

  return {
    name,
    command,
    status,
    expectedNextStatus,
    owner,
  };
}

function isStepStatus(value: string): value is QualityClosureStepInput['status'] {
  return ['PENDING', 'ACTION_REQUIRED', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE', 'READY', 'RESOLVED'].includes(value);
}

function main(): void {
  const steps = parseArgs(process.argv.slice(2));
  const sequence = steps.length > 0
    ? buildQualityClosureSequence({ steps })
    : buildDefaultQualityClosureSequence();

  console.log(JSON.stringify(sequence, null, 2));
}

main();
