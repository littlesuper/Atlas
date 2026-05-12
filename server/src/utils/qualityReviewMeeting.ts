export type MeetingInputStatus = 'READY' | 'MISSING';

export type MeetingInput = {
  name: string;
  status: MeetingInputStatus;
  note?: string;
};

export type MeetingAgendaItem = {
  topic: string;
  owner: string;
  minutes: number;
};

export type MeetingDecision = {
  topic: string;
  owner: string;
  options: string[];
};

export type MeetingActionItem = {
  task: string;
  owner: string;
  dueDate: string;
  source: string;
};

export type QualityReviewMeetingPack = {
  mode: 'QUALITY_REVIEW_MEETING_PACK';
  status: 'READY' | 'BLOCKED';
  title: string;
  scheduledFor: string;
  generatedAt: string;
  summary: {
    participantCount: number;
    agendaMinutes: number;
    decisionCount: number;
    actionItemCount: number;
    missingInputCount: number;
  };
  participants: string[];
  inputs: MeetingInput[];
  agenda: MeetingAgendaItem[];
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  blockers: string[];
};

export function buildQualityReviewMeetingPack(input: {
  title: string;
  scheduledFor: string;
  participants: string[];
  inputs: MeetingInput[];
  agenda: MeetingAgendaItem[];
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  generatedAt?: Date;
}): QualityReviewMeetingPack {
  const participants = normalizeList(input.participants);
  const inputs = input.inputs.map(normalizeInput).filter((item) => item.name.length > 0);
  const agenda = input.agenda.map(normalizeAgendaItem).filter((item) => item.topic.length > 0);
  const decisions = input.decisions.map(normalizeDecision).filter((item) => item.topic.length > 0);
  const actionItems = input.actionItems.map(normalizeActionItem).filter((item) => item.task.length > 0);
  const blockers = buildBlockers({ participants, inputs, agenda, actionItems });

  return {
    mode: 'QUALITY_REVIEW_MEETING_PACK',
    status: blockers.length > 0 ? 'BLOCKED' : 'READY',
    title: input.title,
    scheduledFor: input.scheduledFor,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      participantCount: participants.length,
      agendaMinutes: agenda.reduce((total, item) => total + item.minutes, 0),
      decisionCount: decisions.length,
      actionItemCount: actionItems.length,
      missingInputCount: inputs.filter((item) => item.status === 'MISSING').length,
    },
    participants,
    inputs,
    agenda,
    decisions,
    actionItems,
    blockers,
  };
}

function normalizeInput(input: MeetingInput): MeetingInput {
  return {
    name: input.name.trim(),
    status: input.status,
    note: input.note?.trim() || undefined,
  };
}

function normalizeAgendaItem(item: MeetingAgendaItem): MeetingAgendaItem {
  return {
    topic: item.topic.trim(),
    owner: item.owner.trim(),
    minutes: clampMinutes(item.minutes),
  };
}

function normalizeDecision(decision: MeetingDecision): MeetingDecision {
  return {
    topic: decision.topic.trim(),
    owner: decision.owner.trim(),
    options: normalizeList(decision.options),
  };
}

function normalizeActionItem(item: MeetingActionItem): MeetingActionItem {
  return {
    task: item.task.trim(),
    owner: item.owner.trim(),
    dueDate: item.dueDate.trim(),
    source: item.source.trim(),
  };
}

function buildBlockers(input: {
  participants: string[];
  inputs: MeetingInput[];
  agenda: MeetingAgendaItem[];
  actionItems: MeetingActionItem[];
}): string[] {
  return [
    ...(input.participants.length > 0 ? [] : ['at least one participant is required']),
    ...(input.agenda.length > 0 ? [] : ['at least one agenda item is required']),
    ...input.inputs
      .filter((item) => item.status === 'MISSING')
      .map((item) => `input is missing: ${item.name}`),
    ...input.actionItems
      .filter((item) => !item.owner)
      .map((item) => `action item owner is missing: ${item.task}`),
    ...input.actionItems
      .filter((item) => !item.dueDate)
      .map((item) => `action item dueDate is missing: ${item.task}`),
  ];
}

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    return 0;
  }

  return Math.max(0, Math.round(minutes));
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
