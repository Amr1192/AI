export interface UserSkill {
  title: string;
  proficiency_level?: string;
  years_of_experience?: number;
}

export class AgenticInterviewer {
  userSkills: UserSkill[];
  interviewId: string | number;
  allowedSkills: string[];
  strictMode: boolean;
  conversationHistory: Array<{ timestamp: string; speaker: string; message: string; metadata?: Record<string, unknown> }> = [];
  currentTopic: string | null = null;
  questionsAsked = 0;
  questionsAnswered = 0;
  topicsCovered = new Set<string>();
  selectedSkill: string | null;

  constructor(userSkills: UserSkill[], interviewId: string | number, constraints: { allowedSkills?: string[]; strictMode?: boolean } = {}) {
    this.userSkills = userSkills;
    this.interviewId = interviewId;
    this.allowedSkills = constraints.allowedSkills?.length
      ? constraints.allowedSkills
      : userSkills.map((s) => s.title);
    this.strictMode = constraints.strictMode ?? true;
    this.selectedSkill = this.allowedSkills.length === 1 ? this.allowedSkills[0] : null;
    if (this.selectedSkill) this.topicsCovered.add(this.selectedSkill);
  }

  getSystemInstructions(): string {
    const skillList = this.userSkills
      .map((s) => `${s.title} (${s.proficiency_level || 'intermediate'}, ${s.years_of_experience || 0} yrs)`)
      .join('\n');
    const allowedList = this.allowedSkills.join(', ');
    const randomTopics = this.getRandomTopics().join(', ');

    const skillSelectionPhase =
      this.allowedSkills.length === 1
        ? `Greet the candidate. They chose ONLY "${this.allowedSkills[0]}". Call select_skill and ask_question.`
        : `Greet and ask which skill to practice from: ${allowedList}. Then select_skill and ask_question.`;

    return `You are a friendly technical interviewer. Session: ${Date.now()}

SKILLS:
${skillList}

${this.strictMode ? `ONLY discuss: ${allowedList}` : ''}

Focus: ${randomTopics}

${skillSelectionPhase}

Ask ONE question at a time. Only conclude_interview when the candidate wants to stop.`;
  }

  getRandomTopics(): string[] {
    const all = ['fundamentals', 'debugging', 'best practices', 'trade-offs', 'real-world problems'];
    return all.sort(() => Math.random() - 0.5).slice(0, 3);
  }

  getFunctionDefinitions() {
    return [
      { type: 'function', name: 'select_skill', description: 'Record skill chosen', parameters: { type: 'object', properties: { skill_name: { type: 'string' }, confirmation: { type: 'string' } }, required: ['skill_name', 'confirmation'] } },
      { type: 'function', name: 'ask_question', description: 'Ask technical question', parameters: { type: 'object', properties: { skill: { type: 'string' }, question: { type: 'string' }, difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] } }, required: ['skill', 'question', 'difficulty'] } },
      { type: 'function', name: 'probe_deeper', description: 'Follow up', parameters: { type: 'object', properties: { reason: { type: 'string' }, follow_up: { type: 'string' } }, required: ['reason', 'follow_up'] } },
      { type: 'function', name: 'respond_to_question', description: 'Answer candidate', parameters: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] } },
      { type: 'function', name: 'conclude_interview', description: 'End interview', parameters: { type: 'object', properties: { closing_message: { type: 'string' }, reason: { type: 'string' } }, required: ['closing_message', 'reason'] } },
    ];
  }

  isAllowedSkill(skillName?: string): boolean {
    if (!skillName) return false;
    const n = skillName.toLowerCase().trim();
    return this.allowedSkills.some((s) => s.toLowerCase().trim() === n);
  }

  async handleFunctionCall(functionName: string, args: Record<string, string>): Promise<Record<string, unknown>> {
    switch (functionName) {
      case 'select_skill':
        if (!this.isAllowedSkill(args.skill_name)) {
          return { status: 'error', message: `Choose from: ${this.allowedSkills.join(', ')}` };
        }
        this.selectedSkill = args.skill_name;
        this.topicsCovered.add(args.skill_name);
        return { status: 'skill_selected', skill: args.skill_name };
      case 'ask_question':
        if (!this.isAllowedSkill(args.skill)) {
          return { status: 'error', message: `Ask about: ${this.allowedSkills.join(', ')}` };
        }
        this.questionsAsked++;
        this.currentTopic = args.skill;
        this.topicsCovered.add(args.skill);
        return { status: 'question_asked', count: this.questionsAsked, answered: this.questionsAnswered, skill: args.skill };
      case 'probe_deeper':
        return { status: 'probing_deeper', reason: args.reason };
      case 'respond_to_question':
        return { status: 'answered_question' };
      case 'conclude_interview':
        return {
          status: 'interview_concluded',
          questions_asked: this.questionsAsked,
          questions_answered: this.questionsAnswered,
          topics_covered: [...this.topicsCovered],
        };
      default:
        return { status: 'unknown_function' };
    }
  }

  logTurn(speaker: string, message: string): void {
    this.conversationHistory.push({ timestamp: new Date().toISOString(), speaker, message });
    if (speaker === 'candidate' && message?.trim()) this.questionsAnswered++;
  }

  getStats() {
    return {
      questionsAsked: this.questionsAsked,
      questionsAnswered: this.questionsAnswered,
      topicsCovered: [...this.topicsCovered],
      conversationTurns: this.conversationHistory.length,
    };
  }
}
