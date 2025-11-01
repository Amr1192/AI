<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class RealtimeInterviewController extends Controller
{
    public function start(int $id)
    {
        if (!DB::table('interviews')->where('id', $id)->exists()) {
            return response()->json(['error' => 'Interview not found'], 404);
        }

        $sessionId = Str::uuid()->toString();
        Cache::put("rt:$id:$sessionId:open", true, 3600);
        Cache::put("rt:$id:$sessionId:transcript", '', 3600);
        Cache::put("rt:$id:$sessionId:queue", [], 3600);

        return response()->json(['sessionId' => $sessionId]);
    }

    public function chunk(int $id, Request $req)
    {
        $req->validate(['sessionId' => 'required', 'file' => 'required|file']);
        $sid = $req->input('sessionId');

        if (!Cache::get("rt:$id:$sid:open")) {
            return response()->json(['error' => 'Session closed'], 400);
        }

        $filePath = $req->file('file')->storeAs('chunks', uniqid() . '.webm');
        $text = $this->transcribeSnippet(storage_path('app/' . $filePath));
        $joined = trim(Cache::get("rt:$id:$sid:transcript", '') . ' ' . $text);
        Cache::put("rt:$id:$sid:transcript", $joined, 3600);

        $analysis = $this->microFeedback($text);
        $queue = Cache::get("rt:$id:$sid:queue", []);
        $queue[] = ['type' => 'partial', 'text' => $text, 'analysis' => $analysis];
        Cache::put("rt:$id:$sid:queue", $queue, 3600);

        return response()->json(['ok' => true]);
    }

    public function stop(int $id, Request $req)
    {
        $req->validate(['sessionId' => 'required']);
        $sid = $req->input('sessionId');

        Cache::put("rt:$id:$sid:open", false, 3600);
        $row = DB::table('interviews')->find($id);
        $transcript = Cache::get("rt:$id:$sid:transcript", '');
        $final = $this->finalFeedback($row->question ?? 'General question', $transcript);

        DB::table('interviews')->where('id', $id)->update([
            'transcript' => $transcript,
            'feedback_json' => json_encode($final),
            'status' => 'complete',
            'updated_at' => now(),
        ]);

        $queue = Cache::get("rt:$id:$sid:queue", []);
        $queue[] = ['type' => 'final', 'transcript' => $transcript, 'analysis' => $final];
        Cache::put("rt:$id:$sid:queue", $queue, 3600);

        return response()->json(['ok' => true]);
    }

public function stream(int $id, string $sessionId)
{
    set_time_limit(0);

    return response()->stream(function () use ($id, $sessionId) {
        $start = microtime(true);
        while (microtime(true) - $start < 25) { // keep open ~25 s
            $queue = Cache::pull("rt:$id:$sessionId:queue", []);
            foreach ($queue as $event) {
                echo "event: {$event['type']}\n";
                echo "data: " . json_encode($event) . "\n\n";
                @ob_flush();
                @flush();
            }
            usleep(200000); // 0.2 s
        }
        echo "event: end\n";
        echo "data: {}\n\n";
        @ob_flush();
        @flush();
    }, 200, [
        'Content-Type' => 'text/event-stream',
        'Cache-Control' => 'no-cache',
        'Connection' => 'keep-alive',
        'X-Accel-Buffering' => 'no',
    ]);
}

    // ----------------------------- Helpers -----------------------------

    private function transcribeSnippet(string $filePath): string
    {
    
        try {
            $audioData = base64_encode(file_get_contents($filePath));
            $res = Http::withHeaders([
                'Authorization' => 'Bearer ' . env('OPENAI_API_KEY'),
                'Content-Type' => 'application/json'
            ])->post('https://api.openai.com/v1/chat/completions', [
                'model' => 'gpt-4o-mini',
                'messages' => [
                    ['role' => 'system', 'content' => 'You transcribe short audio clearly.'],
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

            return $res->json('choices.0.message.content') ?? '';
        } catch (\Exception $e) {
            Log::error('transcribeSnippet error: ' . $e->getMessage());
            return '';
        }
    }

    private function microFeedback(string $snippet): array
    {
        $prompt = <<<TXT
Evaluate briefly and return JSON only:
Text: "$snippet"
JSON: {"fillerWords":number,"pace":"slow|good|fast","note":"short note"}
TXT;

        try {
            $res = Http::withHeaders([
                'Authorization' => 'Bearer ' . env('OPENAI_API_KEY'),
                'Content-Type' => 'application/json'
            ])->post('https://api.openai.com/v1/chat/completions', [
                'model' => 'gpt-4o-mini',
                'messages' => [
                    ['role' => 'system', 'content' => 'Return valid JSON only.'],
                    ['role' => 'user', 'content' => $prompt],
                ],
                'temperature' => 0.2,
            ]);

            $content = $res->json('choices.0.message.content') ?? '{}';
            $json = json_decode($content, true);
            return is_array($json) ? $json : ['fillerWords'=>0,'pace'=>'good','note'=>''];
        } catch (\Exception $e) {
            return ['fillerWords'=>0,'pace'=>'good','note'=>''];
        }
    }

    private function finalFeedback(string $q, string $a): array
    {
        $prompt = <<<TXT
Analyze answer and return JSON:
Question: "$q"
Answer: "$a"

JSON: {"clarity":0-100,"confidence":0-100,"structure":0-100,"summary":"short feedback","tips":["tip1","tip2"]}
TXT;

        try {
            $res = Http::withHeaders([
                'Authorization' => 'Bearer ' . env('OPENAI_API_KEY'),
                'Content-Type' => 'application/json'
            ])->post('https://api.openai.com/v1/chat/completions', [
                'model' => 'gpt-4o-mini',
                'messages' => [
                    ['role' => 'system', 'content' => 'Return JSON only.'],
                    ['role' => 'user', 'content' => $prompt],
                ],
                'temperature' => 0.3,
            ]);

            $content = $res->json('choices.0.message.content') ?? '{}';
            $json = json_decode($content, true);
            return is_array($json) ? $json : ['clarity'=>70,'confidence'=>70,'structure'=>70,'summary'=>'Parse error','tips'=>[]];
        } catch (\Exception $e) {
            return ['clarity'=>70,'confidence'=>70,'structure'=>70,'summary'=>'Analysis failed','tips'=>[]];
        }
    }
}
