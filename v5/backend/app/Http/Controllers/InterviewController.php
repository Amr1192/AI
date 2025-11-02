<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use OpenAI;

class InterviewController extends Controller
{
    /**
     * POST /api/interviews/start
     */
    public function start(Request $request)
    {
        $request->validate([
            'question' => 'required|string',
            'user_id'  => 'nullable|integer'
        ]);

        $id = DB::table('interviews')->insertGetId([
            'user_id'    => $request->input('user_id'),
            'question'   => $request->input('question'),
            'status'     => 'created',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['id' => $id, 'status' => 'created']);
    }

    /**
     * POST /api/interviews/upload
     */
    public function upload(Request $request)
    {
        $request->validate([
            'interview_id' => 'required|integer|exists:interviews,id',
            'file'         => 'required|file|mimetypes:audio/mpeg,audio/webm,audio/wav,video/mp4,video/webm'
        ]);

        $path = $request->file('file')->store('interviews');

        DB::table('interviews')->where('id', $request->interview_id)->update([
            'media_path' => $path,
            'status'     => 'uploaded',
            'updated_at' => now(),
        ]);

        return response()->json(['ok' => true, 'path' => $path]);
    }

    /**
     * POST /api/interviews/analyze
     */
    public function analyze(Request $request)
    {
        $request->validate([
            'interview_id' => 'required|integer|exists:interviews,id',
        ]);

        $row = DB::table('interviews')->find($request->interview_id);
        if (!$row || !$row->media_path) {
            return response()->json(['error' => 'Media not found'], 400);
        }

        $audioPath = storage_path('app/' . $row->media_path);
        $client = OpenAI::client(env('OPENAI_API_KEY'));

        // 1️⃣ Transcribe with GPT-4o-mini
        $transcript = $this->transcribeWithGPT($audioPath);
        if (str_starts_with($transcript, 'Transcription failed')) {
            return response()->json(['error' => 'transcription_failed', 'details' => $transcript], 500);
        }

        // 2️⃣ Analyze response
        $analysis = $this->analyzeWithOpenAI($client, $row->question, $transcript);

        DB::table('interviews')->where('id', $row->id)->update([
            'transcript'    => $transcript,
            'feedback_json' => json_encode($analysis),
            'status'        => 'complete',
            'updated_at'    => now(),
        ]);

        return response()->json([
            'id'         => $row->id,
            'status'     => 'complete',
            'transcript' => $transcript,
            'analysis'   => $analysis
        ]);
    }

    /**
     * GET /api/interviews/{id}
     */
    public function show($id)
    {
        $row = DB::table('interviews')->find($id);
        if (!$row) return response()->json(['error' => 'Not found'], 404);

        return response()->json([
            'id'         => $row->id,
            'question'   => $row->question,
            'status'     => $row->status,
            'transcript' => $row->transcript,
            'analysis'   => $row->feedback_json ? json_decode($row->feedback_json, true) : null,
        ]);
    }

    // ----------------------------------------------------------------
    // 🔧 Helpers (GPT-4o-mini)
    // ----------------------------------------------------------------

    private function transcribeWithGPT(string $filePath): string
    {
        try {
            $audioData = base64_encode(file_get_contents($filePath));
            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . env('OPENAI_API_KEY'),
                'Content-Type'  => 'application/json',
            ])->post('https://api.openai.com/v1/chat/completions', [
                'model' => 'gpt-4o-mini',
                'messages' => [
                    ['role' => 'system', 'content' => 'You transcribe audio into clean text.'],
                    [
                        'role' => 'user',
                        'content' => [
                            [
                                'type' => 'input_audio',
                                'audio' => [
                                    'data' => $audioData,
                                    'format' => 'wav'
                                ]
                            ]
                        ]
                    ]
                ],
            ]);

            if ($response->failed()) {
                Log::error('Transcription failed: ' . $response->body());
                return 'Transcription failed: ' . $response->body();
            }

            return $response->json('choices.0.message.content') ?? 'No transcript.';
        } catch (\Exception $e) {
            return 'Transcription failed: ' . $e->getMessage();
        }
    }

    private function analyzeWithOpenAI($client, string $question, string $answer): array
    {
        $prompt = <<<TXT
You are an interview coach. Evaluate the candidate's response concisely. Return **ONLY JSON**.

Question: "$question"
Answer: "$answer"

JSON schema:
{
  "clarity": 0-100,
  "confidence": 0-100,
  "structure": 0-100,
  "summary": "short summary",
  "tips": ["tip1", "tip2"]
}
TXT;

        try {
            $response = $client->chat()->create([
                'model' => 'gpt-4o-mini',
                'messages' => [
                    ['role' => 'system', 'content' => 'Return JSON only.'],
                    ['role' => 'user', 'content' => $prompt],
                ],
                'temperature' => 0.4,
            ]);

            $content = $response['choices'][0]['message']['content'] ?? '{}';
            $json = json_decode($content, true);
            return is_array($json) ? $json : ['clarity'=>70,'confidence'=>70,'structure'=>70,'summary'=>'Parse error','tips'=>[]];
        } catch (\Exception $e) {
            return ['clarity'=>0,'confidence'=>0,'structure'=>0,'summary'=>'Analysis failed','tips'=>[]];
        }
    }
}
