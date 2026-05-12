import {
  MeetingActionItem,
  MeetingAgendaItem,
  MeetingDecision,
  MeetingInput,
  MeetingInputStatus,
  buildQualityReviewMeetingPack,
} from '../utils/qualityReviewMeeting';

type ParsedArgs = {
  title?: string;
  scheduledFor?: string;
  participants: string[];
  inputs: MeetingInput[];
  agenda: MeetingAgendaItem[];
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    participants: [],
    inputs: [],
    agenda: [],
    decisions: [],
    actionItems: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--title':
        parsed.title = requireValue(arg, value);
        index += 1;
        break;
      case '--scheduled-for':
        parsed.scheduledFor = requireValue(arg, value);
        index += 1;
        break;
      case '--participant':
        parsed.participants.push(...splitList(requireValue(arg, value)));
        index += 1;
        break;
      case '--input':
        parsed.inputs.push(parseInput(requireValue(arg, value)));
        index += 1;
        break;
      case '--agenda':
        parsed.agenda.push(parseAgenda(requireValue(arg, value)));
        index += 1;
        break;
      case '--decision':
        parsed.decisions.push(parseDecision(requireValue(arg, value)));
        index += 1;
        break;
      case '--action':
        parsed.actionItems.push(parseAction(requireValue(arg, value)));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseInput(value: string): MeetingInput {
  const [name, status, note] = value.split('|').map((item) => item.trim());
  if (!name || !status) {
    throw new Error('--input must use "name|READY/MISSING|optional note" format.');
  }

  return {
    name,
    status: parseInputStatus(status),
    note: note || undefined,
  };
}

function parseAgenda(value: string): MeetingAgendaItem {
  const [topic, owner, minutes] = value.split('|').map((item) => item.trim());
  if (!topic || !owner || !minutes) {
    throw new Error('--agenda must use "topic|owner|minutes" format.');
  }

  return {
    topic,
    owner,
    minutes: parseMinutes(minutes),
  };
}

function parseDecision(value: string): MeetingDecision {
  const [topic, owner, options = ''] = value.split('|').map((item) => item.trim());
  if (!topic || !owner) {
    throw new Error('--decision must use "topic|owner|option1,option2" format.');
  }

  return {
    topic,
    owner,
    options: splitCsv(options),
  };
}

function parseAction(value: string): MeetingActionItem {
  const [task, owner, dueDate, source = ''] = value.split('|').map((item) => item.trim());
  if (!task) {
    throw new Error('--action must use "task|owner|dueDate|source" format.');
  }

  return {
    task,
    owner: owner ?? '',
    dueDate: dueDate ?? '',
    source,
  };
}

function parseInputStatus(value: string): MeetingInputStatus {
  if (value === 'READY' || value === 'MISSING') {
    return value;
  }

  throw new Error('Input status must be READY or MISSING.');
}

function parseMinutes(value: string): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error('Agenda minutes must be a non-negative number.');
  }

  return minutes;
}

function splitList(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function splitCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.title || !args.scheduledFor) {
    throw new Error('Missing meeting pack values. Provide --title and --scheduled-for.');
  }

  const pack = buildQualityReviewMeetingPack({
    title: args.title,
    scheduledFor: args.scheduledFor,
    participants: args.participants,
    inputs: args.inputs,
    agenda: args.agenda,
    decisions: args.decisions,
    actionItems: args.actionItems,
  });

  console.log(JSON.stringify(pack, null, 2));

  if (pack.status !== 'READY') {
    process.exit(1);
  }
}

main();
