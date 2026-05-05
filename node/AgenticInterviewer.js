/**
 * AgenticInterviewer.js
 * 
 * Autonomous AI interviewer that:
 * - Asks questions naturally
 * - Probes deeper based on answers
 * - Responds to user questions
 * - Decides when to change topics
 * - Concludes interview when appropriate
 */

export class AgenticInterviewer {
  constructor(userSkills, interviewId) {
    this.userSkills = userSkills;
    this.interviewId = interviewId;
    this.conversationHistory = [];
    this.currentTopic = null;
    this.questionsAsked = 0;
    this.maxQuestions = 8;
    this.topicsCovered = new Set();
  }

  /**
   * Generate the system instructions for the agentic interviewer
   */
  getSystemInstructions() {
    const skillList = this.userSkills
      .map(s => `${s.title} (${s.proficiency_level}, ${s.years_of_experience} yrs)`)
      .join('\n');

    // ✅ Add randomization to ensure different questions each time
    const sessionSeed = Date.now();
    const randomTopics = this.getRandomTopics();

    return `You are a friendly, conversational technical interviewer. Session: ${sessionSeed}

AVAILABLE SKILLS TO PRACTICE:
${skillList}

⚠️ CRITICAL - QUESTION VARIETY REQUIREMENT:
Every interview must have COMPLETELY DIFFERENT questions. Use these focus areas: ${randomTopics.join(', ')}

Question variety strategies:
- Ask about different aspects: theory, practice, debugging, optimization, trade-offs
- Vary depths: basic concepts → applied scenarios → complex problems
- Change perspectives: "what", "why", "how", "when", "compare", "debug"
- NEVER ask the same question type twice

CONVERSATION FLOW:

Phase 1 - Greeting & Skill Selection:
1. Greet the candidate warmly
2. Ask: "Which skill would you like to practice today?"
3. WAIT for their response
4. When they choose a skill (e.g., "SQL", "Python"), acknowledge it
5. Then call the ask_question function ONCE for that skill

Phase 2 - Interview (${this.maxQuestions} questions total):
6. Ask ONE unique question about the chosen skill
7. WAIT for their complete answer
8. Either probe deeper OR ask a DIFFERENT question
9. Continue until ${this.maxQuestions} questions asked

CRITICAL RULES:
- NEVER repeat questions or ask similar ones
- Vary question formats constantly
- In Phase 1, do NOT call functions until they choose a skill
- After they choose, call ask_question ONCE
- Ask ONE question at a time, then STOP and WAIT

Start by greeting them and asking which skill to practice.`;
  }

  /**
   * ✅ NEW: Generate random topic focus areas for variety
   */
  getRandomTopics() {
    const allTopics = [
      'fundamentals', 'practical scenarios', 'performance optimization',
      'debugging', 'best practices', 'trade-offs', 'real-world problems',
      'advanced concepts', 'common pitfalls', 'modern techniques'
    ];
    
    // Shuffle and return 3 random topics
    return allTopics.sort(() => Math.random() - 0.5).slice(0, 3);
  }

  /**
   * ✅ FIXED: Define the functions with proper 'type' field for OpenAI Realtime API
   */
  getFunctionDefinitions() {
    return [
      {
        type: 'function', // ✅ ADDED: Required by OpenAI Realtime API
        name: 'select_skill',
        description: 'Record which skill the candidate chose to practice from their available skills',
        parameters: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              description: 'The exact skill name the candidate wants to practice (must be from their available skills)'
            },
            confirmation: {
              type: 'string',
              description: 'A brief, friendly confirmation message (e.g., "Great! Let\'s focus on React" or "Perfect choice! SQL it is")'
            }
          },
          required: ['skill_name', 'confirmation']
        }
      },
      {
        type: 'function', // ✅ ADDED
        name: 'ask_question',
        description: 'Ask the candidate a technical question about the skill they selected',
        parameters: {
          type: 'object',
          properties: {
            skill: {
              type: 'string',
              description: 'The skill this question is about (must match the skill they selected)'
            },
            question: {
              type: 'string',
              description: 'The actual technical question to ask them'
            },
            difficulty: {
              type: 'string',
              enum: ['easy', 'medium', 'hard'],
              description: 'Question difficulty level based on their proficiency'
            }
          },
          required: ['skill', 'question', 'difficulty']
        }
      },
      {
        type: 'function', // ✅ ADDED
        name: 'probe_deeper',
        description: 'Ask a follow-up question to dig deeper into their last answer',
        parameters: {
          type: 'object',
          properties: {
            follow_up_question: {
              type: 'string',
              description: 'A deeper, more specific follow-up question based on what they just said'
            },
            reason: {
              type: 'string',
              description: 'Why you want to probe deeper (e.g., "answer was vague", "interesting point to explore", "need more technical detail")'
            }
          },
          required: ['follow_up_question', 'reason']
        }
      },
      {
        type: 'function', // ✅ ADDED
        name: 'respond_to_question',
        description: 'Answer a question the candidate asked you, then continue the interview',
        parameters: {
          type: 'object',
          properties: {
            answer: {
              type: 'string',
              description: 'Your clear, helpful answer to their question'
            },
            next_question: {
              type: 'string',
              description: 'The next question you want to ask them after answering'
            }
          },
          required: ['answer', 'next_question']
        }
      },
      {
        type: 'function', // ✅ ADDED
        name: 'conclude_interview',
        description: 'End the interview politely after sufficient questions have been asked',
        parameters: {
          type: 'object',
          properties: {
            closing_message: {
              type: 'string',
              description: 'A warm, professional closing message thanking them for their time'
            },
            reason: {
              type: 'string',
              description: 'Why you are concluding (e.g., "reached question limit", "covered all key topics", "comprehensive assessment complete")'
            }
          },
          required: ['closing_message', 'reason']
        }
      }
    ];
  }

  /**
   * Handle function calls from the AI
   */
  async handleFunctionCall(functionName, args) {
    console.log(`🤖 AI called function: ${functionName}`, args);

    switch (functionName) {
      case 'select_skill':
        this.selectedSkill = args.skill_name;
        this.topicsCovered.add(args.skill_name);
        
        console.log(`✅ User selected skill: ${args.skill_name}`);
        
        return {
          status: 'skill_selected',
          skill: args.skill_name,
          message: `Skill selected: ${args.skill_name}`
        };

      case 'ask_question':
        // Validate they're asking about the selected skill
        if (this.selectedSkill && args.skill.toLowerCase() !== this.selectedSkill.toLowerCase()) {
          return {
            status: 'error',
            message: `You must ask about ${this.selectedSkill}, not ${args.skill}`
          };
        }
        
        this.questionsAsked++;
        this.currentTopic = args.skill;
        
        return {
          status: 'question_asked',
          count: this.questionsAsked,
          max: this.maxQuestions,
          skill: args.skill,
          message: `Question ${this.questionsAsked}/${this.maxQuestions} asked about ${args.skill}`
        };

      case 'probe_deeper':
        return {
          status: 'probing_deeper',
          reason: args.reason,
          message: 'Following up on previous answer'
        };

      case 'respond_to_question':
        return {
          status: 'answered_question',
          message: 'Answered candidate question and continuing interview'
        };

      case 'conclude_interview':
        return {
          status: 'interview_concluded',
          reason: args.reason,
          questions_asked: this.questionsAsked,
          topics_covered: Array.from(this.topicsCovered),
          message: 'Interview completed'
        };

      default:
        return { status: 'unknown_function' };
    }
  }

  /**
   * Log conversation turn
   */
  logTurn(speaker, message, metadata = {}) {
    this.conversationHistory.push({
      timestamp: new Date().toISOString(),
      speaker,
      message,
      metadata
    });
  }

  /**
   * Get interview statistics
   */
  getStats() {
    return {
      questionsAsked: this.questionsAsked,
      maxQuestions: this.maxQuestions,
      topicsCovered: Array.from(this.topicsCovered),
      conversationTurns: this.conversationHistory.length
    };
  }
}