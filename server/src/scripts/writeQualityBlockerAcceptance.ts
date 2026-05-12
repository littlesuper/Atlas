import { QualityBlockerAcceptanceInput, buildQualityBlockerAcceptance } from '../utils/qualityBlockerAcceptance';

const defaultRequiredItems = ['质量回顾会实会确认', '分支保护和 PR 审查规则', 'rebase/merge 策略'];

function parseArgs(args: string[]): {
  requiredItems: string[];
  acceptances: QualityBlockerAcceptanceInput[];
} {
  const requiredItems: string[] = [];
  const acceptances: QualityBlockerAcceptanceInput[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--required') {
      requiredItems.push(requireValue(arg, value));
      index += 1;
      continue;
    }

    if (arg === '--accept') {
      acceptances.push(parseAcceptance(requireValue(arg, value)));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    requiredItems: requiredItems.length > 0 ? requiredItems : defaultRequiredItems,
    acceptances,
  };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseAcceptance(value: string): QualityBlockerAcceptanceInput {
  const [item, acceptedBy, acceptedAt, rationale, expiresAt, evidenceRef] = value.split('|').map((part) => part.trim());

  if (!item || !acceptedBy || !acceptedAt || !rationale || !expiresAt || !evidenceRef) {
    throw new Error('--accept must use "item|acceptedBy|acceptedAt|rationale|expiresAt|evidenceRef" format.');
  }

  return {
    item,
    acceptedBy,
    acceptedAt,
    rationale,
    expiresAt,
    evidenceRef,
  };
}

function main(): void {
  const acceptance = buildQualityBlockerAcceptance(parseArgs(process.argv.slice(2)));

  console.log(JSON.stringify(acceptance, null, 2));

  if (acceptance.status !== 'ACCEPTED') {
    process.exit(1);
  }
}

main();
