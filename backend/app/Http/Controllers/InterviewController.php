<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class InterviewController extends Controller
{
    /**
     * POST /api/interviews/start
     * Creates an interview with AI-generated questions based on user skills.
     */
    public function start(Request $request)
    {
        $request->validate([
            'user_id' => 'required|integer',
            'skill_ids' => 'nullable|array',
        ]);

        $userId = $request->input('user_id');
        $skillIds = $request->input('skill_ids', []);

        // Fetch user skills
        if (!empty($skillIds)) {
            $skills = DB::table('user_skills')
                ->whereIn('id', $skillIds)
                ->where('user_id', $userId)
                ->get(['title', 'years_of_experience', 'proficiency_level'])
                ->toArray();
        } else {
            $skills = DB::table('user_skills')
                ->where('user_id', $userId)
                ->get(['title', 'years_of_experience', 'proficiency_level'])
                ->toArray();
        }

        if (empty($skills)) {
            return response()->json(['error' => 'No skills found for this user'], 400);
        }

        // Generate the FIRST question only
        $firstQuestion = $this->generateSingleQuestion($skills);

        if (!$firstQuestion) {
            return response()->json(['error' => 'Failed to generate first question'], 500);
        }

        // Create interview with ONE initial question
        $id = DB::table('interviews')->insertGetId([
            'user_id'            => $userId,
            'selected_skill_ids' => !empty($skillIds) ? json_encode($skillIds) : null,
            'question_set'       => json_encode([$firstQuestion]),
            'current_question'   => 0,
            'status'             => 'active',
            'created_at'         => now(),
            'updated_at'         => now(),
        ]);

        return response()->json([
            'id'             => $id,
            'status'         => 'active',
            'first_question' => $firstQuestion,
            'skills_used'    => $skills,
        ]);
    }

    /**
     * Generate ONE adaptive first question
     */
    private function generateSingleQuestion(array $skills): ?string
    {
        $skillContext = collect($skills)->map(function ($skill) {
            return "- {$skill->title} ({$skill->proficiency_level}, {$skill->years_of_experience} yrs)";
        })->implode("\n");

        $prompt = <<<PROMPT
You are an expert technical interviewer starting a new interview session.

CANDIDATE'S SKILLS:
{$skillContext}

Generate ONE opening question that:
1. Matches the candidate's experience level and proficiency
2. Tests fundamental understanding while allowing them to demonstrate depth
3. Is answerable in 2-3 minutes of speaking
4. Focuses on their strongest/most experienced skill

Output only the question text.
PROMPT;

        try {
            $apiKey = env('OPENAI_API_KEY');
            if (!$apiKey) {
                return $this->simpleFirstQuestionFallback($skills);
            }

            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
            ])->timeout(60)->post('https://api.openai.com/v1/chat/completions', [
                'model' => 'gpt-5',
                'messages' => [
                    ['role' => 'system', 'content' => 'You are a senior technical interviewer with 20+ years of experience.'],
                    ['role' => 'user', 'content' => $prompt],
                ],
                'max_completion_tokens' => 800
            ]);

            if (!$response->successful()) {
                return $this->simpleFirstQuestionFallback($skills);
            }

            $content = trim($response->json('choices.0.message.content', ''));

            return $content ?: $this->simpleFirstQuestionFallback($skills);

        } catch (\Throwable $e) {
            Log::error('Error generating first question', ['error' => $e->getMessage()]);
            return $this->simpleFirstQuestionFallback($skills);
        }
    }

    private function simpleFirstQuestionFallback(array $skills): string
    {
        $titles = collect($skills)->pluck('title')->take(3)->implode(', ');
        return "To start, can you briefly describe your experience with {$titles}?";
    }

    /**
     * GET /api/interviews/{id}
     */
    public function show(int $id)
    {
        try {
            $row = DB::table('interviews')->find($id);

            if (!$row) {
                return response()->json(['error' => 'Interview not found'], 404);
            }

            $answers = DB::table('interview_answers')
                ->where('interview_id', $id)
                ->orderBy('question_index')
                ->get()
                ->map(function ($answer) {
                    return [
                        'id'            => $answer->id ?? 0,
                        'question_text' => $answer->question_text ?? '',
                        'answer_text'   => $answer->answer_text ?? '',
                        'feedback'      => $answer->feedback ?? '{}',
                        'created_at'    => $answer->created_at ?? now(),
                    ];
                })
                ->toArray();

            $overallFeedback = null;
            if (!empty($row->overall)) {
                $overallFeedback = json_decode($row->overall, true);
            }

            $questionSet = [];
            if (!empty($row->question_set)) {
                $questionSet = json_decode($row->question_set, true) ?: [];
            }

            return response()->json([
                'id'               => $row->id,
                'user_id'          => $row->user_id,
                'status'           => $row->status ?? 'created',
                'question_set'     => $questionSet,
                'current_question' => (int) ($row->current_question ?? 0),
                'overall'          => $overallFeedback,
                'answers'          => $answers,
            ]);
        } catch (\Exception $e) {
            Log::error('Error in show() method', [
                'interview_id' => $id,
                'error'        => $e->getMessage(),
            ]);

            return response()->json([
                'error'   => 'Server error loading interview',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/interviews/{id}/save-conversation
     * Saves real-time conversation history
     */
    public function saveConversation(int $id, Request $request)
    {
        $request->validate([
            'sessionId'    => 'required|string',
            'conversation' => 'required|array',
            'stats'        => 'required|array'
        ]);

        $interview = DB::table('interviews')->find($id);
        
        if (!$interview) {
            return response()->json(['error' => 'Interview not found'], 404);
        }

        DB::table('interviews')->where('id', $id)->update([
            'conversation_history' => json_encode($request->conversation),
            'stats'                => json_encode($request->stats),
            'status'               => 'completed',
            'updated_at'           => now()
        ]);

        return response()->json(['message' => 'Conversation saved successfully']);
    }

    /**
     * ✅ NEW: POST /api/interviews/{id}/save-video-frames
     * Saves video frames for AI analysis
     */
    public function saveVideoFrames(int $id, Request $request)
    {
        $request->validate([
            'frames'     => 'required|array',
            'frameCount' => 'required|integer'
        ]);

        $interview = DB::table('interviews')->find($id);
        
        if (!$interview) {
            return response()->json(['error' => 'Interview not found'], 404);
        }

        Log::info('Saving video frames', [
            'interview_id' => $id,
            'frame_count'  => $request->frameCount
        ]);

        // Sample frames (take every 3rd frame to reduce data size)
        $sampledFrames = [];
        for ($i = 0; $i < count($request->frames); $i += 3) {
            $sampledFrames[] = $request->frames[$i];
        }

        DB::table('interviews')->where('id', $id)->update([
            'video_frames'      => json_encode($sampledFrames),
            'video_frame_count' => count($sampledFrames),
            'updated_at'        => now()
        ]);

        // ✅ Trigger video analysis in background
        dispatch(function () use ($id, $sampledFrames) {
            $this->analyzeVideoFrames($id, $sampledFrames);
        });

        return response()->json([
            'message'     => 'Video frames saved successfully',
            'frame_count' => count($sampledFrames)
        ]);
    }

    /**
     * ✅ NEW: Analyze video frames with GPT-5 Vision
     */
    private function analyzeVideoFrames(int $interviewId, array $frames)
    {
        try {
            Log::info('Starting video analysis', ['interview_id' => $interviewId]);

            $apiKey = env('OPENAI_API_KEY');
            if (!$apiKey) {
                throw new \Exception('OPENAI_API_KEY not set');
            }

            // Prepare images for GPT-5 Vision
            $imageContent = [];
            foreach (array_slice($frames, 0, 5) as $frame) { // Analyze first 5 frames
                $imageContent[] = [
                    'type'      => 'image_url',
                    'image_url' => [
                        'url'    => $frame,
                        'detail' => 'low' // Faster processing
                    ]
                ];
            }

            $prompt = <<<PROMPT
Analyze these interview snapshots of the candidate during their technical interview. Provide a comprehensive body language and non-verbal communication assessment.

Analyze:
1. **Facial Expressions**: Eye contact, confidence level, nervousness indicators
2. **Body Language**: Posture, hand gestures, fidgeting, engagement level
3. **Professional Presence**: Appearance, background setting, lighting
4. **Overall Impression**: How they would come across in a real interview

Provide your analysis in JSON format:
{
  "eye_contact": {
    "score": 0-100,
    "assessment": "Description of eye contact quality"
  },
  "confidence_level": {
    "score": 0-100,
    "assessment": "Description of confidence indicators"
  },
  "body_language": {
    "score": 0-100,
    "assessment": "Description of posture and gestures"
  },
  "professional_presence": {
    "score": 0-100,
    "assessment": "Description of overall professional appearance"
  },
  "engagement": {
    "score": 0-100,
    "assessment": "Description of engagement level"
  },
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "areas_for_improvement": ["Improvement 1", "Improvement 2"],
  "overall_impression": "2-3 sentences summarizing the visual assessment",
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ]
}

Return ONLY valid JSON.
PROMPT;

            $messages = [
                [
                    'role'    => 'system',
                    'content' => 'You are an expert interview coach and body language analyst who has trained thousands of professionals for technical interviews.'
                ],
                [
                    'role'    => 'user',
                    'content' => array_merge([['type' => 'text', 'text' => $prompt]], $imageContent)
                ]
            ];

            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
            ])->timeout(120)->post('https://api.openai.com/v1/chat/completions', [
                'model'                 => 'gpt-5',
                'messages'              => $messages,
                'max_completion_tokens' => 2000
            ]);

            if (!$response->successful()) {
                throw new \Exception('GPT-5 Vision API error: ' . $response->status());
            }

            $jsonContent = trim($response->json('choices.0.message.content', '{}'));
            $jsonContent = preg_replace('/```json\s*|\s*```/', '', $jsonContent);
            $videoAnalysis = json_decode($jsonContent, true);

            if (!$videoAnalysis) {
                throw new \Exception('Invalid JSON from GPT-5 Vision');
            }

            // Save video analysis
            DB::table('interviews')->where('id', $interviewId)->update([
                'video_analysis' => json_encode($videoAnalysis),
                'updated_at'     => now()
            ]);

            Log::info('Video analysis completed', ['interview_id' => $interviewId]);

        } catch (\Throwable $e) {
            Log::error('Video analysis failed', [
                'interview_id' => $interviewId,
                'error'        => $e->getMessage()
            ]);
        }
    }

    /**
     * ✅ NEW: POST /api/interviews/{id}/analyze
     * Comprehensive interview analysis with GPT-5
     */
    public function analyzeInterview(int $id)
    {
        try {
            $interview = DB::table('interviews')->find($id);

            if (!$interview) {
                return response()->json(['error' => 'Interview not found'], 404);
            }

            // Get conversation history
            $conversation = json_decode($interview->conversation_history ?? '[]', true);
            
            if (empty($conversation)) {
                return response()->json(['error' => 'No conversation data'], 400);
            }

            // Get user skills
            $selectedSkillIds = json_decode($interview->selected_skill_ids ?? '[]', true);
            
            if (!empty($selectedSkillIds)) {
                $skills = DB::table('user_skills')
                    ->whereIn('id', $selectedSkillIds)
                    ->get(['title', 'years_of_experience', 'proficiency_level'])
                    ->toArray();
            } else {
                $skills = DB::table('user_skills')
                    ->where('user_id', $interview->user_id)
                    ->get(['title', 'years_of_experience', 'proficiency_level'])
                    ->toArray();
            }

            $skillContext = collect($skills)->map(function ($skill) {
                return "{$skill->title} ({$skill->proficiency_level}, {$skill->years_of_experience} yrs)";
            })->implode(", ");

            // Build transcript
            $transcript = "";
            $userAnswers = [];
            
            foreach ($conversation as $turn) {
                $speaker = $turn['speaker'] === 'candidate' ? 'CANDIDATE' : 'INTERVIEWER';
                $transcript .= "{$speaker}: {$turn['message']}\n\n";
                
                if ($turn['speaker'] === 'candidate') {
                    $userAnswers[] = $turn['message'];
                }
            }

            // Get video analysis if available
            $videoAnalysis = null;
            if (!empty($interview->video_analysis)) {
                $videoAnalysis = json_decode($interview->video_analysis, true);
            }

            $apiKey = env('OPENAI_API_KEY');
            if (!$apiKey) {
                throw new \Exception('OPENAI_API_KEY not set');
            }

            $videoContext = $videoAnalysis ? "VIDEO ANALYSIS RESULTS:\n" . json_encode($videoAnalysis, JSON_PRETTY_PRINT) : "No video analysis available.";

            $prompt = <<<PROMPT
You are a principal engineer and senior technical interviewer conducting a comprehensive post-interview evaluation.

CANDIDATE PROFILE:
Skills: {$skillContext}

COMPLETE INTERVIEW TRANSCRIPT:
{$transcript}

{$videoContext}

COMPREHENSIVE ANALYSIS REQUIRED:

**Phase 1: Technical Assessment**
- Evaluate technical depth and accuracy
- Assess problem-solving approach
- Evaluate communication of technical concepts

**Phase 2: Soft Skills Assessment**
- Communication clarity and structure
- Confidence and presence
- Active listening and engagement

**Phase 3: Holistic Evaluation**
- Combine verbal analysis with video analysis (if available)
- Overall interview readiness
- Specific strengths and gaps

**Output Format (JSON ONLY):**
{
  "overall_score": 0-100,
  "readiness_level": "junior/mid/senior/not_ready",
  "technical_assessment": {
    "score": 0-100,
    "depth": "Description of technical depth",
    "accuracy": "Description of technical accuracy",
    "problem_solving": "Description of problem-solving skills"
  },
  "communication_assessment": {
    "score": 0-100,
    "clarity": "How clearly they explain concepts",
    "structure": "How well-organized their answers are",
    "examples": "Quality of examples provided"
  },
  "soft_skills": {
    "score": 0-100,
    "confidence": "Confidence assessment",
    "engagement": "Engagement level",
    "presence": "Professional presence"
  },
  "strengths": [
    "Specific strength with evidence from interview",
    "Another strength with evidence",
    "Third strength with evidence"
  ],
  "weaknesses": [
    "Specific weakness with evidence",
    "Another weakness with evidence"
  ],
  "question_by_question": [
    {
      "question_summary": "Brief question summary",
      "answer_quality": 0-100,
      "feedback": "Specific feedback on this answer"
    }
  ],
  "improvement_roadmap": [
    {
      "area": "Area to improve",
      "priority": "high/medium/low",
      "actions": ["Action 1", "Action 2"]
    }
  ],
  "interview_tips": [
    "Specific tip 1",
    "Specific tip 2",
    "Specific tip 3"
  ],
  "recommended_resources": [
    "Resource/topic 1",
    "Resource/topic 2",
    "Resource/topic 3"
  ],
  "practice_questions": [
    "Practice question 1 targeting a gap",
    "Practice question 2 targeting a gap",
    "Practice question 3 targeting a gap"
  ],
  "final_verdict": "2-3 sentences with honest, constructive final assessment"
}

Provide evidence-based, actionable feedback. Return ONLY valid JSON.
PROMPT;

            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
            ])->timeout(180)->post('https://api.openai.com/v1/chat/completions', [
                'model'                 => 'gpt-5',
                'messages'              => [
                    ['role' => 'system', 'content' => 'You are a world-class technical interviewer and career coach who provides deeply insightful, evidence-based feedback that helps people grow.'],
                    ['role' => 'user', 'content' => $prompt],
                ],
                'max_completion_tokens' => 4000
            ]);

            if (!$response->successful()) {
                throw new \Exception('GPT-5 API error: ' . $response->status());
            }

            $jsonContent = trim($response->json('choices.0.message.content', '{}'));
            $jsonContent = preg_replace('/```json\s*|\s*```/', '', $jsonContent);
            $analysis = json_decode($jsonContent, true);

            if (!$analysis) {
                throw new \Exception('Invalid JSON from GPT-5');
            }

            // Merge video analysis if available
            if ($videoAnalysis) {
                $analysis['video_analysis'] = $videoAnalysis;
            }

            // Save comprehensive analysis
            DB::table('interviews')->where('id', $id)->update([
                'comprehensive_analysis' => json_encode($analysis),
                'analyzed_at'            => now(),
                'updated_at'             => now()
            ]);

            return response()->json([
                'status'   => 'success',
                'analysis' => $analysis,
                'model'    => 'gpt-5'
            ]);

        } catch (\Throwable $e) {
            Log::error('Interview analysis failed', [
                'interview_id' => $id,
                'error'        => $e->getMessage()
            ]);

            return response()->json([
                'error'   => 'Analysis failed',
                'message' => $e->getMessage()
            ], 500);
        }
    }
}