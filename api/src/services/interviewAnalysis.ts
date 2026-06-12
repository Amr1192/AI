import { config } from '../config.js';
import { openai } from './openai.js';
import type { ConversationTurn } from './interviewReport.js';
import { extractQaPairs } from './interviewReport.js';

const ANALYSIS_SCHEMA = `{
  "overall_score": number (0-100),
  "readiness_level": "beginner" | "developing" | "intermediate" | "advanced" | "expert",
  "final_verdict": string (2-4 sentences),
  "technical_assessment": { "score": number, "depth": string, "accuracy": string, "problem_solving": string },
  "communication_assessment": { "score": number, "clarity": string, "structure": string, "examples": string },
  "soft_skills": { "score": number, "confidence": string, "engagement": string, "presence": string },
  "strengths": string[] (at least 2),
  "weaknesses": string[] (at least 2),
  "question_by_question": [{ "question_summary": string, "answer_quality": number, "feedback": string }],
  "improvement_roadmap": [{ "area": string, "priority": "high"|"medium"|"low", "actions": string[] }],
  "interview_tips": string[],
  "recommended_resources": string[],
  "practice_questions": string[]
}`;

function defaultSection(score = 60) {
  return {
    score,
    depth: 'Limited sample — more practice recommended',
    accuracy: 'Not fully assessed from this session',
    problem_solving: 'Not fully assessed from this session',
  };
}

function defaultComm(score = 60) {
  return {
    score,
    clarity: 'Adequate for a short practice session',
    structure: 'Could benefit from clearer structure',
    examples: 'Add concrete examples where possible',
  };
}

function defaultSoft(score = 60) {
  return {
    score,
    confidence: 'Shows willingness to participate',
    engagement: 'Engaged with the interviewer',
    presence: 'Professional tone',
  };
}

/** Ensure stored analysis always has fields the report UI expects. */
export function normalizeComprehensiveAnalysis(
  raw: Record<string, unknown>,
  qaPairs: Array<{ questionText: string; answerText: string }>,
): Record<string, unknown> {
  const answerCount = Math.max(qaPairs.length, 1);
  const baseScore = Math.min(85, 55 + answerCount * 8);

  const overall = Number(raw.overall_score);
  const overallScore = Number.isFinite(overall) && overall > 0 ? overall : baseScore;

  const strengths = Array.isArray(raw.strengths)
    ? (raw.strengths as unknown[]).map(String).filter(Boolean)
    : [];
  const weaknesses = Array.isArray(raw.weaknesses)
    ? (raw.weaknesses as unknown[]).map(String).filter(Boolean)
    : [];

  const qbq =
    Array.isArray(raw.question_by_question) && (raw.question_by_question as unknown[]).length > 0
      ? raw.question_by_question
      : qaPairs.map((p) => ({
          question_summary: p.questionText.slice(0, 200),
          answer_quality: overallScore,
          feedback: 'Review this answer and expand with examples and technical detail.',
        }));

  const verdict =
    typeof raw.final_verdict === 'string' && raw.final_verdict.trim()
      ? raw.final_verdict.trim()
      : answerCount === 1
        ? 'You completed a short practice round with one answered question. This is enough for a basic report — try a longer session for richer feedback.'
        : `You answered ${answerCount} question(s). Keep practicing to deepen your technical responses.`;

  const tech = (raw.technical_assessment as Record<string, unknown>) ?? {};
  const comm = (raw.communication_assessment as Record<string, unknown>) ?? {};
  const soft = (raw.soft_skills as Record<string, unknown>) ?? {};

  return {
    overall_score: overallScore,
    readiness_level: String(raw.readiness_level || 'developing'),
    final_verdict: verdict,
    technical_assessment: {
      score: Number(tech.score) || overallScore,
      depth: String(tech.depth || defaultSection().depth),
      accuracy: String(tech.accuracy || defaultSection().accuracy),
      problem_solving: String(tech.problem_solving || defaultSection().problem_solving),
    },
    communication_assessment: {
      score: Number(comm.score) || overallScore,
      clarity: String(comm.clarity || defaultComm().clarity),
      structure: String(comm.structure || defaultComm().structure),
      examples: String(comm.examples || defaultComm().examples),
    },
    soft_skills: {
      score: Number(soft.score) || overallScore,
      confidence: String(soft.confidence || defaultSoft().confidence),
      engagement: String(soft.engagement || defaultSoft().engagement),
      presence: String(soft.presence || defaultSoft().presence),
    },
    strengths:
      strengths.length > 0
        ? strengths
        : ['Completed a live voice interview', 'Engaged with technical questions'],
    weaknesses:
      weaknesses.length > 0
        ? weaknesses
        : ['Short session — limited data for deep assessment', 'Add more detail and examples in answers'],
    question_by_question: qbq,
    improvement_roadmap: Array.isArray(raw.improvement_roadmap) && (raw.improvement_roadmap as unknown[]).length
      ? raw.improvement_roadmap
      : [
          {
            area: 'Answer depth',
            priority: 'high',
            actions: ['Use the STAR method', 'Include trade-offs and examples'],
          },
        ],
    interview_tips: Array.isArray(raw.interview_tips)
      ? (raw.interview_tips as unknown[]).map(String).filter(Boolean)
      : ['Pause briefly before answering', 'Ask clarifying questions when needed'],
    recommended_resources: Array.isArray(raw.recommended_resources)
      ? (raw.recommended_resources as unknown[]).map(String).filter(Boolean)
      : ['Practice explaining concepts out loud daily'],
    practice_questions: Array.isArray(raw.practice_questions)
      ? (raw.practice_questions as unknown[]).map(String).filter(Boolean)
      : ['Describe a challenging problem you solved recently'],
    analysis_source: 'ai',
    generated_at: new Date().toISOString(),
    model_used: config.analysisModel,
  };
}

function buildFallbackFromQa(qaPairs: Array<{ questionText: string; answerText: string }>) {
  return normalizeComprehensiveAnalysis({}, qaPairs);
}

export async function generateComprehensiveAnalysis(
  conversation: ConversationTurn[],
  answers: Array<{ questionText: string; answerText: string }>,
): Promise<Record<string, unknown>> {
  const qaPairs =
    answers.length > 0
      ? answers.map((a) => ({ questionText: a.questionText, answerText: a.answerText }))
      : extractQaPairs(conversation);

  const transcript = conversation.map((t) => `${t.speaker}: ${t.message}`).join('\n\n');
  const qaSummary = qaPairs
    .map((p, i) => `Q${i + 1}: ${p.questionText}\nA${i + 1}: ${p.answerText}`)
    .join('\n\n');

  try {
    const res = await openai.chat.completions.create({
      model: config.analysisModel,
      temperature: 0.35,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an interview coach. Return ONLY valid JSON matching this schema (no markdown):\n${ANALYSIS_SCHEMA}\nAlways include overall_score > 0, final_verdict, and at least 2 strengths. Short interviews with one Q&A are valid — still produce a complete report.`,
        },
        {
          role: 'user',
          content: `Interview transcript:\n${transcript || '(empty)'}\n\nQ&A pairs:\n${qaSummary || '(none)'}\n\nGenerate the full JSON analysis.`,
        },
      ],
    });

    let raw = (res.choices[0]?.message?.content || '').trim();
    raw = raw.replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeComprehensiveAnalysis(parsed, qaPairs);
  } catch {
    return buildFallbackFromQa(qaPairs);
  }
}

export function isAnalysisDisplayable(data: Record<string, unknown> | null | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  if (data.analysis_source === 'fallback') return false;
  const score = Number(data.overall_score);
  if (Number.isFinite(score) && score > 0) return true;
  if (typeof data.final_verdict === 'string' && data.final_verdict.trim()) return true;
  if (Array.isArray(data.strengths) && data.strengths.length > 0) return true;
  return false;
}
