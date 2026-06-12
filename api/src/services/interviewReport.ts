export type ConversationTurn = {
  speaker: string;
  message: string;
  timestamp?: string;
};

export function normalizeSpeaker(speaker: string): 'interviewer' | 'candidate' | 'other' {
  const s = speaker.toLowerCase();
  if (s === 'interviewer' || s === 'ai') return 'interviewer';
  if (s === 'candidate' || s === 'user') return 'candidate';
  return 'other';
}

/** Count substantive candidate turns in saved conversation history. */
export function countCandidateAnswers(conversation: ConversationTurn[]): number {
  return conversation.filter((turn) => {
    if (normalizeSpeaker(turn.speaker) !== 'candidate') return false;
    const text = turn.message?.trim() ?? '';
    return text.length >= 2;
  }).length;
}

/** Pair each candidate reply with the most recent interviewer message. */
export function extractQaPairs(
  conversation: ConversationTurn[],
): Array<{ questionText: string; answerText: string }> {
  const pairs: Array<{ questionText: string; answerText: string }> = [];
  let pendingQuestion = '';

  for (const turn of conversation) {
    const speaker = normalizeSpeaker(turn.speaker);
    const message = turn.message?.trim() ?? '';
    if (!message) continue;

    if (speaker === 'interviewer') {
      pendingQuestion = message;
      continue;
    }

    if (speaker === 'candidate') {
      pairs.push({
        questionText: pendingQuestion || `Question ${pairs.length + 1}`,
        answerText: message,
      });
      pendingQuestion = '';
    }
  }

  return pairs;
}

export function isReportEligible(
  answersCount: number,
  conversation: ConversationTurn[],
  stats?: Record<string, unknown> | null,
): boolean {
  if (answersCount >= 1) return true;
  if (countCandidateAnswers(conversation) >= 1) return true;
  const answered = Number(stats?.questionsAnswered ?? 0);
  return answered >= 1;
}

export function reportEligibilityPayload(
  answersCount: number,
  conversation: ConversationTurn[],
  stats?: Record<string, unknown> | null,
) {
  const fromConversation = countCandidateAnswers(conversation);
  const fromStats = Number(stats?.questionsAnswered ?? 0);
  const questionsAnswered = Math.max(answersCount, fromConversation, fromStats);

  return {
    report_eligible: isReportEligible(answersCount, conversation, stats),
    report_eligibility: {
      message:
        questionsAnswered >= 1
          ? 'Report available.'
          : 'Answer at least one interview question to unlock your report.',
      questions_asked: questionsAnswered,
      minimum_required: 1,
    },
  };
}
