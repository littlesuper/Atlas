export type TeamConfirmation = {
  topic: string;
  owner: string;
  confirmedAt: string;
  decision: string;
  evidenceRef: string;
};

export type TeamConfirmationRegisterItem = TeamConfirmation & {
  status: 'CONFIRMED' | 'ACTION_REQUIRED';
};

export type TeamConfirmationRegister = {
  mode: 'TEAM_CONFIRMATION_REGISTER';
  status: 'CONFIRMED' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    required: number;
    confirmed: number;
    pending: number;
    missingEvidence: number;
  };
  items: TeamConfirmationRegisterItem[];
  gaps: string[];
};

export function buildTeamConfirmationRegister(input: {
  requiredTopics: string[];
  confirmations: TeamConfirmation[];
  generatedAt?: Date;
}): TeamConfirmationRegister {
  const requiredTopics = normalizeList(input.requiredTopics);
  const confirmationsByTopic = new Map(
    input.confirmations.map((confirmation) => [confirmation.topic.trim(), normalizeConfirmation(confirmation)]),
  );
  const items: TeamConfirmationRegisterItem[] = requiredTopics.flatMap((topic) => {
    const confirmation = confirmationsByTopic.get(topic);

    if (!confirmation) {
      return [];
    }

    return [
      {
        ...confirmation,
        status: hasConfirmationEvidence(confirmation) ? 'CONFIRMED' : 'ACTION_REQUIRED',
      },
    ];
  });
  const gaps = requiredTopics.flatMap((topic) => {
    const confirmation = confirmationsByTopic.get(topic);

    if (!confirmation) {
      return [`confirmation is missing: ${topic}`];
    }

    if (!hasConfirmationEvidence(confirmation)) {
      return [`confirmation evidence is missing: ${topic}`];
    }

    return [];
  });
  const confirmed = items.filter((item) => item.status === 'CONFIRMED').length;
  const missingEvidence = items.filter((item) => item.status === 'ACTION_REQUIRED').length;

  return {
    mode: 'TEAM_CONFIRMATION_REGISTER',
    status: gaps.length > 0 ? 'ACTION_REQUIRED' : 'CONFIRMED',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      required: requiredTopics.length,
      confirmed,
      pending: requiredTopics.length - confirmed - missingEvidence,
      missingEvidence,
    },
    items,
    gaps,
  };
}

function normalizeConfirmation(confirmation: TeamConfirmation): TeamConfirmation {
  return {
    topic: confirmation.topic.trim(),
    owner: confirmation.owner.trim(),
    confirmedAt: confirmation.confirmedAt.trim(),
    decision: confirmation.decision.trim(),
    evidenceRef: confirmation.evidenceRef.trim(),
  };
}

function hasConfirmationEvidence(confirmation: TeamConfirmation): boolean {
  return Boolean(confirmation.topic && confirmation.owner && confirmation.confirmedAt && confirmation.decision && confirmation.evidenceRef);
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
