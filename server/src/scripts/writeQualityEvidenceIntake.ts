import { TeamConfirmation } from '../utils/teamConfirmationRegister';
import { buildQualityEvidenceIntake } from '../utils/qualityEvidenceIntake';

const defaultRequiredTopics = ['质量回顾会实会确认', '分支保护和 PR 审查规则', 'rebase/merge 策略'];

function parseArgs(args: string[]): {
  requiredTopics: string[];
  confirmations: TeamConfirmation[];
} {
  const requiredTopics: string[] = [];
  const confirmations: TeamConfirmation[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--required') {
      requiredTopics.push(requireValue(arg, value));
      index += 1;
      continue;
    }

    if (arg === '--confirm') {
      confirmations.push(parseConfirmation(requireValue(arg, value)));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    requiredTopics: requiredTopics.length > 0 ? requiredTopics : defaultRequiredTopics,
    confirmations,
  };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseConfirmation(value: string): TeamConfirmation {
  const [topic, owner, confirmedAt, decision, evidenceRef] = value.split('|').map((item) => item.trim());

  if (!topic || !owner || !confirmedAt || !decision) {
    throw new Error('--confirm must use "topic|owner|confirmedAt|decision|evidenceRef" format.');
  }

  return {
    topic,
    owner,
    confirmedAt,
    decision,
    evidenceRef: evidenceRef ?? '',
  };
}

function main(): void {
  const intake = buildQualityEvidenceIntake(parseArgs(process.argv.slice(2)));

  console.log(JSON.stringify(intake, null, 2));

  if (intake.status !== 'READY_TO_CONFIRM') {
    process.exit(1);
  }
}

main();
