/**
 * AgenticInterviewer.js
 *
 * Autonomous AI interviewer that:
 * - Asks questions naturally
 * - Probes deeper based on answers
 * - Responds to user questions
 * - Decides when to change topics
 * - Concludes only when the candidate wants to stop
 */

export class AgenticInterviewer {
  constructor(userSkills, interviewId, constraints = {}) {
    this.userSkills = userSkills;
    this.interviewId = interviewId;
    this.allowedSkills = constraints.allowedSkills?.length
      ? constraints.allowedSkills
      : userSkills.map((s) => s.title);
    this.strictMode = constraints.strictMode ?? true;
    this.conversationHistory = [];
    this.currentTopic = null;
    this.questionsAsked = 0;
    this.questionsAnswered = 0;
    this.topicsCovered = new Set();
    this.selectedSkill = this.allowedSkills.length === 1 ? this.allowedSkills[0] : null;

    if (this.selectedSkill) {
      this.topicsCovered.add(this.selectedSkill);
    }
  }

  getSystemInstructions() {
    const skillList = this.userSkills
      .map((s) => `${s.title} (${s.proficiency_level}, ${s.years_of_experience} yrs)`)
      .join('\n');

    const sessionSeed = Date.now();
    const randomTopics = this.getRandomTopics();
    const allowedList = this.allowedSkills.join(', ');

    const skillSelectionPhase =
      this.allowedSkills.length === 1
        ? `Phase 1 - Single Skill Selected:
1. Greet the candidate warmly
2. The candidate already chose to practice ONLY: ${this.allowedSkills[0]}
3. Do NOT ask which skill to practice
4. Call select_skill with "${this.allowedSkills[0]}" immediately
5. Then call ask_question once for that skill`
        : `Phase 1 - Greeting & Skill Selection:
1. Greet the candidate warmly
2. Ask which skill they want to practice from ONLY this list: ${allowedList}
3. WAIT for their response
4. When they choose, call select_skill once
5. Then call ask_question once for that skill`;

    const strictRule = this.strictMode
      ? `⚠️ STRICT SKILL RULE: You may ONLY discuss these skills: ${allowedList}. Never ask about anything outside this list.`
      : '';

    return `You are a friendly, conversational technical interviewer. Session: ${sessionSeed}

SELECTED SKILLS FOR THIS SESSION:
${skillList}

${strictRule}

⚠️ QUESTION VARIETY:
Every interview must have DIFFERENT questions. Focus areas for this session: ${randomTopics.join(', ')}

CONVERSATION FLOW:

${skillSelectionPhase}

Phase 2 - Open Practice (no question limit):
6. Ask ONE question at a time, then WAIT for the full answer
7. After each answer, either probe deeper OR ask a different question about the same skill
8. Continue as long as the candidate wants to keep practicing
9. There is NO maximum number of questions
10. Only call conclude_interview when the candidate explicitly says they want to stop or end the interview

CRITICAL RULES:
- NEVER repeat the same question
- Ask ONE question at a time, then STOP and WAIT
- Call ask_question each time you ask a new interview question
- Do NOT auto-end the interview after a fixed number of questions

Start by greeting the candidate.`;
  }

  getRandomTopics() {
    const allTopics = [
      'fundamentals',
      'practical scenarios',
      'performance optimization',
      'debugging',
      'best practices',
      'trade-offs',
      'real-world problems',
      'advanced concepts',
      'common pitfalls',
      'modern techniques',
    ];

    return allTopics.sort(() => Math.random() - 0.5).slice(0, 3);
  }

  getFunctionDefinitions() {
    return [
      {
        type: 'function',
        name: 'select_skill',
        description: 'Record which skill the candidate chose to practice from their available skills',
        parameters: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              description: 'The exact skill name the candidate wants to practice (must be from their available skills)',
            },
            confirmation: {
              type: 'string',
              description: 'A brief, friendly confirmation message',
            },
          },
          required: ['skill_name', 'confirmation'],
        },
      },
      {
        type: 'function',
        name: 'ask_question',
        description: 'Ask the candidate a technical question about the skill they selected',
        parameters: {
          type: 'object',
          properties: {
            skill: {
              type: 'string',
              description: 'The skill this question is about',
            },
            question: {
              type: 'string',
              description: 'The interview question to ask',
            },
            difficulty: {
              type: 'string',
              enum: ['easy', 'medium', 'hard'],
              description: 'Difficulty level of the question',
            },
          },
          required: ['skill', 'question', 'difficulty'],
        },
      },
      {
        type: 'function',
        name: 'probe_deeper',
        description: 'Ask a follow-up question to dig deeper into their previous answer',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Why you are probing deeper',
            },
            follow_up: {
              type: 'string',
              description: 'The follow-up question',
            },
          },
          required: ['reason', 'follow_up'],
        },
      },
      {
        type: 'function',
        name: 'respond_to_question',
        description: 'Answer a question the candidate asked you, then continue the interview',
        parameters: {
          type: 'object',
          properties: {
            answer: {
              type: 'string',
              description: 'Your answer to their question',
            },
          },
          required: ['answer'],
        },
      },
      {
        type: 'function',
        name: 'conclude_interview',
        description: 'End the interview when the candidate wants to stop',
        parameters: {
          type: 'object',
          properties: {
            closing_message: {
              type: 'string',
              description: 'A warm, professional closing message thanking them for their time',
            },
            reason: {
              type: 'string',
              description: 'Why you are concluding',
            },
          },
          required: ['closing_message', 'reason'],
        },
      },
    ];
  }

  isAllowedSkill(skillName) {
    if (!skillName) return false;
    const normalized = skillName.toLowerCase().trim();
    return this.allowedSkills.some((skill) => skill.toLowerCase().trim() === normalized);
  }

  recordCandidateAnswer() {
    this.questionsAnswered++;
  }

  async handleFunctionCall(functionName, args) {
    console.log(`🤖 AI called function: ${functionName}`, args);

    switch (functionName) {
      case 'select_skill':
        if (!this.isAllowedSkill(args.skill_name)) {
          return {
            status: 'error',
            message: `You must choose from: ${this.allowedSkills.join(', ')}`,
          };
        }

        this.selectedSkill = args.skill_name;
        this.topicsCovered.add(args.skill_name);

        return {
          status: 'skill_selected',
          skill: args.skill_name,
          message: `Skill selected: ${args.skill_name}`,
        };

      case 'ask_question':
        if (!this.isAllowedSkill(args.skill)) {
          return {
            status: 'error',
            message: `You must ask about one of: ${this.allowedSkills.join(', ')}`,
          };
        }

        if (this.selectedSkill && args.skill.toLowerCase() !== this.selectedSkill.toLowerCase()) {
          return {
            status: 'error',
            message: `You must ask about ${this.selectedSkill}, not ${args.skill}`,
          };
        }

        this.questionsAsked++;
        this.currentTopic = args.skill;
        this.topicsCovered.add(args.skill);

        return {
          status: 'question_asked',
          count: this.questionsAsked,
          answered: this.questionsAnswered,
          skill: args.skill,
          message: `Question ${this.questionsAsked} asked about ${args.skill}`,
        };

      case 'probe_deeper':
        return {
          status: 'probing_deeper',
          reason: args.reason,
          message: 'Following up on previous answer',
        };

      case 'respond_to_question':
        return {
          status: 'answered_question',
          message: 'Answered candidate question and continuing interview',
        };

      case 'conclude_interview':
        return {
          status: 'interview_concluded',
          reason: args.reason,
          questions_asked: this.questionsAsked,
          questions_answered: this.questionsAnswered,
          topics_covered: Array.from(this.topicsCovered),
          message: 'Interview completed',
        };

      default:
        return { status: 'unknown_function' };
    }
  }

  logTurn(speaker, message, metadata = {}) {
    this.conversationHistory.push({
      timestamp: new Date().toISOString(),
      speaker,
      message,
      metadata,
    });

    if (speaker === 'candidate' && message?.trim()) {
      this.recordCandidateAnswer();
    }
  }

  getStats() {
    return {
      questionsAsked: this.questionsAsked,
      questionsAnswered: this.questionsAnswered,
      topicsCovered: Array.from(this.topicsCovered),
      conversationTurns: this.conversationHistory.length,
    };
  }
}
