import { Week8HandoffConfirmation, buildConfirmedWeek8HandoffPack } from '../utils/week8HandoffPack';

function parseConfirmations(args: string[]): Week8HandoffConfirmation[] {
  const confirmations: Week8HandoffConfirmation[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg !== '--confirm') {
      throw new Error(`Unknown argument: ${arg}`);
    }

    confirmations.push(parseConfirmation(requireValue(arg, value)));
    index += 1;
  }

  return confirmations;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseConfirmation(value: string): Week8HandoffConfirmation {
  const [topic, owner, confirmedAt, decision] = value.split('|').map((item) => item.trim());

  if (!topic || !owner || !confirmedAt || !decision) {
    throw new Error('--confirm must use "topic|owner|confirmedAt|decision" format.');
  }

  return {
    topic,
    owner,
    confirmedAt,
    decision,
  };
}

function main(): void {
  const confirmations = parseConfirmations(process.argv.slice(2));

  if (confirmations.length === 0) {
    throw new Error('Provide at least one --confirm value.');
  }

  const pack = buildConfirmedWeek8HandoffPack({ confirmations });

  console.log(JSON.stringify(pack, null, 2));

  if (pack.status !== 'CONFIRMED') {
    process.exit(1);
  }
}

main();
