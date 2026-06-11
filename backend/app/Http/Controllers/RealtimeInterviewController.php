<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class RealtimeInterviewController extends Controller
{
    /**
     * POST /api/interviews/{id}/rt/start
     * Called when a question starts. Returns Node.js WebSocket URL.
     */
    public function start(int $id)
    {
        $interview = DB::table('interviews')->where('id', $id)->first();
        
        if (!$interview) {
            return response()->json(['error' => 'Interview not found'], 404);
        }

        $sid = (string) Str::uuid();

        return response()->json([
            'sessionId' => $sid,
            'node_ws_url' => env('NODE_REALTIME_URL', 'ws://127.0.0.1:8081'),
            'interview_id' => $id
        ]);
    }

    /**
     * POST /api/interviews/{id}/rt/submit-answer
     * Called when the user finishes speaking and submits their answer.
     * Analyzes the answer and provides detailed feedback.
     */
   public function submitAnswer(Request $request, $id)
{
    $request->validate([
        'sessionId' => 'required|string',
        'transcript' => 'required|string',
        'question_index' => 'required|integer',
    ]);

    $interviewId = $id;
    $questionIndex = $request->question_index;
    $answerText = trim($request->transcript);

    // Check existing answer
    $interview = DB::table('interviews')->where('id', $interviewId)->first();
    if (!$interview) {
        return response()->json(['error' => 'Interview not found'], 404);
    }

    $existingAnswer = DB::table('interview_answers')
        ->where('interview_id', $interviewId)
        ->where('question_index', $questionIndex)
        ->first();

    if ($existingAnswer) {
        Log::info('Answer already exists');
        return response()->json([
            'status' => 'success',
            'model_used' => $existingAnswer->model_used ?? 'unknown',
            'analysis_source' => $existingAnswer->analysis_source ?? 'unknown',
            'verification_token' => $existingAnswer->verification_token ?? null,
            'feedback' => json_decode($existingAnswer->feedback ?? '{}', true),
            'message' => 'Answer already submitted'
        ]);
    }

    $questionSet = json_decode($interview->question_set ?? '[]', true);
    $questionText = $questionSet[$questionIndex] ?? 'Unknown Question';

    $modelUsed = config('ai.analysis_model', 'gpt-5-mini');
    $analysisSource = 'ai';
    $feedback = null;
    $verification_hash = null;

    try {
        $prompt = <<<PROMPT
You are evaluating a technical interview answer. Analyze the response quality systematically.

QUESTION:
{$questionText}

CANDIDATE'S ANSWER:
{$answerText}

EVALUATION PROCESS:

Step 1 - Identify the most relevant evaluation dimensions for this question.
Consider: technical accuracy, depth of explanation, clarity, use of examples, completeness, practical understanding.

Step 2 - For each dimension, assess the answer:
- What did they do well?
- What did they miss or get wrong?
- How confident/clear was their explanation?

Step 3 - Provide specific, actionable feedback based on their actual words.

Step 4 - Generate improvement recommendations tailored to their gaps.

OUTPUT (JSON only):
{
  "evaluation_criteria": [
    {
      "name": "dimension name (e.g., Technical Accuracy, Depth, Clarity)",
      "score": 0-100,
      "reasoning": "specific observation from their answer"
    }
  ],
  "overall_score": 0-100,
  "strengths": [
    "specific thing they did well, with evidence from answer"
  ],
  "weaknesses": [
    "specific gap or error, with evidence from answer"
  ],
  "actionable_tips": [
    "concrete improvement suggestion 1",
    "concrete improvement suggestion 2",
    "concrete improvement suggestion 3"
  ],
  "next_recommendations": {
    "suggested_level": "junior/mid/senior",
    "recommended_next_difficulty": "easy/medium/hard",
    "skills_to_focus": ["skill1", "skill2"],
    "suggested_interview_type": "technical/behavioral/system design",
    "practice_questions": ["question1", "question2", "question3"]
  }
}

Return only valid JSON.
PROMPT;

        $apiKey = env('OPENAI_API_KEY');
        $maxTokens = preg_match('/^gpt-5/', $modelUsed) ? 3000 : 1000;
        
        $payload = $this->buildChatPayload(
            $modelUsed,
            [
                ['role' => 'system', 'content' => 'You are an expert interview evaluator who provides evidence-based, constructive feedback. You think step-by-step and identify patterns that reveal true understanding vs surface knowledge.'],
                ['role' => 'user', 'content' => $prompt],
            ],
            $maxTokens,
            null
        );

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
        ])->timeout(120)->post('https://api.openai.com/v1/chat/completions', $payload);

        if (!$response->successful()) {
            throw new \Exception('API error: ' . $response->status());
        }

        $responseData = $response->json();
        $raw = trim($responseData['choices'][0]['message']['content'] ?? '');
        
        if (empty($raw)) {
            throw new \Exception('Empty response from API');
        }

        $raw = preg_replace('/``````/', '', $raw);
        $raw = trim($raw);

        $feedback = json_decode($raw, true);

        if (!$feedback || !isset($feedback['evaluation_criteria'])) {
            throw new \Exception("Invalid JSON returned");
        }

        $feedback = array_merge([
            'evaluation_criteria' => [],
            'overall_score' => 50,
            'strengths' => [],
            'weaknesses' => [],
            'actionable_tips' => [],
            'next_recommendations' => [
                'suggested_level' => 'mid',
                'recommended_next_difficulty' => 'medium',
                'skills_to_focus' => [],
                'suggested_interview_type' => 'technical',
                'practice_questions' => []
            ]
        ], $feedback);

        if ($feedback['overall_score'] == 0 && count($feedback['evaluation_criteria']) > 0) {
            $scores = array_column($feedback['evaluation_criteria'], 'score');
            $feedback['overall_score'] = round(array_sum($scores) / count($scores));
        }

        $verification_hash = hash('sha256', json_encode($feedback) . $modelUsed);

    } catch (\Throwable $e) {
        Log::error('Feedback analysis error', ['error' => $e->getMessage()]);

        $analysisSource = 'fallback';
        $wordCount = str_word_count($answerText);
        $score = min(100, max(30, $wordCount * 1.5));

        $feedback = [
            "evaluation_criteria" => [
                [
                    "name" => "Response Length",
                    "score" => (int) $score,
                    "reasoning" => "Automated analysis. Word count: {$wordCount}."
                ]
            ],
            "overall_score" => (int) $score,
            "strengths" => ["Provided a response"],
            "weaknesses" => ["Detailed analysis unavailable"],
            "actionable_tips" => [
                "Provide more detailed explanations",
                "Structure your answer clearly",
                "Use precise technical terminology"
            ],
            "next_recommendations" => [
                "suggested_level" => "mid",
                "recommended_next_difficulty" => "medium",
                "skills_to_focus" => ["communication"],
                "suggested_interview_type" => "technical",
                "practice_questions" => ["Practice explaining concepts step-by-step"]
            ]
        ];

        $verification_hash = hash('sha256', 'fallback-' . time());
    }

    // ✅ ONLY INSERT COLUMNS THAT EXIST IN YOUR CURRENT SCHEMA
    try {
        DB::table('interview_answers')->insert([
            'interview_id'       => $interviewId,
            'question_index'     => $questionIndex,
            'question_text'      => $questionText,
            'answer_text'        => $answerText,
            'feedback'           => json_encode($feedback),
            'model_used'         => $modelUsed,
            'analysis_source'    => $analysisSource,
            'verification_token' => $verification_hash,
            'created_at'         => now(),
            'updated_at'         => now(),
        ]);

    } catch (\Illuminate\Database\QueryException $e) {
        if ($e->getCode() == 23000) {
            $existingAnswer = DB::table('interview_answers')
                ->where('interview_id', $interviewId)
                ->where('question_index', $questionIndex)
                ->first();

            if ($existingAnswer) {
                return response()->json([
                    'status' => 'success',
                    'model_used' => $existingAnswer->model_used ?? 'unknown',
                    'analysis_source' => $existingAnswer->analysis_source ?? 'unknown',
                    'verification_token' => $existingAnswer->verification_token ?? null,
                    'feedback' => json_decode($existingAnswer->feedback ?? '{}', true),
                    'message' => 'Answer already submitted'
                ]);
            }
        }
        throw $e;
    }

    return response()->json([
        'status' => 'success',
        'model_used' => $modelUsed,
        'analysis_source' => $analysisSource,
        'verification_token' => $verification_hash,
        'feedback' => $feedback,
    ]);
}



private function buildChatPayload(string $model, array $messages, int $maxTokens, ?float $temperature = null): array
{
    $payload = [
        'model'    => $model,
        'messages' => $messages,
    ];

    // ✅ FIXED: Match ANY gpt-4.1 variant (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, etc.)
    if (preg_match('/^gpt-5/', $model)) {
        // ALL gpt-4.1 variants use reasoning-style parameters
        $payload['max_completion_tokens'] = $maxTokens;
        // NO temperature for reasoning models
    } else {
        // All other models (gpt-4.1, gpt-4o, gpt-4o-mini, etc.)
        $payload['max_tokens'] = $maxTokens;
        if (!is_null($temperature)) {
            $payload['temperature'] = $temperature;
        }
    }

    return $payload;
}

    /**
     * LEGACY: Analyze interview answer using AI (NOT USED in submitAnswer)
     * This is kept for backward compatibility but should use buildChatPayload
     */
    private function analyzeAnswer(string $question, string $answer): array
    {
        $model = config('ai.analysis_model', 'gpt-5-mini');

        // Handle empty or very short answers
        if (strlen($answer) < 10) {
            return [
                'clarity' => 20,
                'confidence' => 20,
                'structure' => 20,
                'relevance' => 20,
                'average' => 20,
                'summary' => 'Answer too short. Please provide more detail.',
                'tips' => ['Provide a more detailed response', 'Aim for at least 50 words']
            ];
        }
        
        $prompt = <<<PROMPT
        You are a senior technical interview evaluator with expertise in assessing candidate responses.
        
        Analyze the candidate's answer to the following question and provide a comprehensive evaluation.
        
        **Question:** "$question"
        
        **Candidate's Answer:** "$answer"

Your evaluation should:
1. Identify 3-5 relevant evaluation criteria based on what matters most for this specific question
2. Score each criterion from 0-100
3. Provide an overall assessment
4. Give actionable improvement tips
5. Suggest next steps for the candidate

Return ONLY valid JSON in this structure:

{
  "evaluation_criteria": [
    {
      "name": "criterion name (e.g., Technical Accuracy, Depth, Examples)",
      "score": 0-100,
      "reasoning": "brief explanation of the score"
    },
    // 3-5 criteria total
  ],
  "overall_score": 0-100,
  "summary": "one-paragraph high-level performance summary",
  "strengths": ["specific strength 1", "specific strength 2"],
  "weaknesses": ["specific weakness 1", "specific weakness 2"],
  "tips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],
  "next_recommendations": {
    "suggested_level": "junior/mid/senior",
    "recommended_next_difficulty": "easy/medium/hard",
    "skills_to_focus": ["skill1", "skill2"],
    "suggested_interview_type": "technical/behavioral/system design/problem-solving",
    "practice_questions": ["question1", "question2", "question3"]
  }
}

NO markdown. NO extra text.
PROMPT;


        try {
            $apiKey = env('OPENAI_API_KEY');

            Log::info('Analyzing answer with AI (LEGACY method)', [
                'model' => $model,
                'question_length' => strlen($question),
                'answer_length' => strlen($answer)
            ]);

            // ✅ Use the helper method
            $payload = $this->buildChatPayload(
                $model,
                [
                    [
                        'role' => 'system',
                        'content' => 'You are an interview coach. Return ONLY valid JSON without markdown formatting.'
                    ],
                    ['role' => 'user', 'content' => $prompt],
                ],
                800,
                0.3
            );

            $res = Http::withHeaders(['Authorization' => 'Bearer ' . $apiKey])
                ->timeout(60)
                ->post('https://api.openai.com/v1/chat/completions', $payload);

            if (!$res->successful()) {
                Log::error('Feedback API error', [
                    'status' => $res->status(),
                    'body' => $res->body()
                ]);
                return $this->getFallbackFeedback($answer);
            }

            $content = $res->json('choices.0.message.content') ?? '{}';
            
            Log::info('AI feedback received', [
                'content_length' => strlen($content),
                'preview' => substr($content, 0, 100)
            ]);
            
            // Clean response
            $content = preg_replace('/```json\s*|\s*```/', '', $content);
            $content = trim($content);
            
            $feedback = json_decode($content, true);

            if (!is_array($feedback) || !isset($feedback['clarity'])) {
                Log::warning('Invalid feedback format from AI', ['content' => $content]);
                return $this->getFallbackFeedback($answer);
            }

            Log::info('AI feedback successfully parsed', [
                'clarity' => $feedback['clarity'] ?? 0,
                'confidence' => $feedback['confidence'] ?? 0,
                'structure' => $feedback['structure'] ?? 0,
                'relevance' => $feedback['relevance'] ?? 0
            ]);

            // Ensure all required fields exist
            return [
                'clarity' => (int) ($feedback['clarity'] ?? 70),
                'confidence' => (int) ($feedback['confidence'] ?? 70),
                'structure' => (int) ($feedback['structure'] ?? 70),
                'relevance' => (int) ($feedback['relevance'] ?? 70),
                'average' => (int) ($feedback['average'] ?? 70),
                'summary' => $feedback['summary'] ?? 'Good effort on this answer.',
                'tips' => $feedback['tips'] ?? ['Keep practicing']
            ];

        } catch (\Throwable $e) {
            Log::error('Feedback analysis error: ' . $e->getMessage());
            return $this->getFallbackFeedback($answer);
        }
    }

    /**
     * Generate fallback feedback based on basic metrics
     * This is only used when AI analysis fails
     */
    private function getFallbackFeedback(string $answer): array
    {
        Log::warning('Using FALLBACK feedback (AI analysis failed)');
        
        $wordCount = str_word_count($answer);
        $sentences = preg_split('/[.!?]+/', $answer, -1, PREG_SPLIT_NO_EMPTY);
        $sentenceCount = count($sentences);

        // Basic scoring based on length and structure
        $clarityScore = min(100, max(40, $wordCount * 2));
        $confidenceScore = 65;
        $structureScore = min(100, max(50, $sentenceCount * 15));
        $relevanceScore = 70;
        $average = round(($clarityScore + $confidenceScore + $structureScore + $relevanceScore) / 4);

        $tips = [];
        if ($wordCount < 30) {
            $tips[] = "Try to provide more detailed responses (aim for 50+ words)";
        }
        if ($sentenceCount < 3) {
            $tips[] = "Structure your answer into multiple clear points";
        }
        $tips[] = "Use specific examples to support your points";

        return [
            'clarity' => (int) $clarityScore,
            'confidence' => (int) $confidenceScore,
            'structure' => (int) $structureScore,
            'relevance' => (int) $relevanceScore,
            'average' => $average,
            'summary' => "⚠️ Basic analysis (AI unavailable). Word count: {$wordCount}. Consider adding more detail and structure.",
            'tips' => $tips
        ];
    }
}