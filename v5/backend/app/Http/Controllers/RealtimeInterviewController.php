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
    // -------------------------------------------------------
    //  RT session lifecycle
    // -------------------------------------------------------

    public function start(int $id)
    {
        if (!DB::table('interviews')->where('id', $id)->exists()) {
            return response()->json(['error' => 'Interview not found'], 404);
        }

        $sid = Str::uuid()->toString();
        Cache::put("rt:$id:$sid:open", true, 3600);
        Cache::put("rt:$id:$sid:transcript", '', 3600);
        Cache::put("rt:$id:$sid:queue", [], 3600);

        return response()->json(['sessionId' => $sid]);
    }

    public function chunk(int $id, Request $req)
    {
        $req->validate([
            'sessionId' => 'required',
            'file'      => 'required|file',
        ]);

        $sid  = $req->input('sessionId');
        $file = $req->file('file');

        if (!Cache::get("rt:$id:$sid:open")) {
            return response()->json(['ok' => false, 'error' => 'session_closed']);
        }

        $chunkDir = storage_path('app/chunks');
        if (!file_exists($chunkDir)) mkdir($chunkDir, 0777, true);

        $filename  = uniqid('chunk_', true) . '.webm';
        $chunkPath = "$chunkDir/$filename";
        $file->move($chunkDir, $filename);
        Log::info("Received audio chunk → $chunkPath");

        clearstatcache(true, $chunkPath);
        for ($i = 0; $i < 15; $i++) {
            if (filesize($chunkPath) > 2000) break;
            usleep(150000);
            clearstatcache(true, $chunkPath);
        }

        if (filesize($chunkPath) < 1000) {
            Log::warning("Skipping empty/tiny chunk: $chunkPath (" . filesize($chunkPath) . " B)");
            @unlink($chunkPath);
            return response()->json(['ok' => false, 'error' => 'empty_chunk']);
        }

        $text = $this->transcribeChunk($chunkPath);
        Log::info("Chunk transcription for interview $id → " . ($text ?: '[EMPTY]'));

        if ($text !== '') {
            $joined = trim(Cache::get("rt:$id:$sid:transcript", '') . ' ' . $text);
            Cache::put("rt:$id:$sid:transcript", $joined, 3600);

            $analysis = $this->quickFeedback($text);
            $queue    = Cache::get("rt:$id:$sid:queue", []);
            $queue[]  = ['type' => 'partial', 'text' => $text, 'analysis' => $analysis];
            Cache::put("rt:$id:$sid:queue", $queue, 3600);
        }

        @unlink($chunkPath);
        return response()->json(['ok' => true, 'text' => $text]);
    }

    public function stop(int $id, Request $req)
    {
        $req->validate(['sessionId' => 'required']);
        $sid = $req->input('sessionId');
        Cache::put("rt:$id:$sid:open", false, 3600);

        $row        = DB::table('interviews')->find($id);
        $transcript = Cache::get("rt:$id:$sid:transcript", '');
        $final      = $this->finalFeedback($row->question ?? 'General question', $transcript);

        DB::table('interviews')->where('id', $id)->update([
            'transcript'    => $transcript,
            'feedback_json' => json_encode($final),
            'status'        => 'complete',
            'updated_at'    => now(),
        ]);

        $queue   = Cache::get("rt:$id:$sid:queue", []);
        $queue[] = ['type' => 'final', 'transcript' => $transcript, 'analysis' => $final];
        Cache::put("rt:$id:$sid:queue", $queue, 3600);

        return response()->json(['ok' => true]);
    }

    public function stream(int $id, string $sid)
    {
        set_time_limit(0);

        return response()->stream(function () use ($id, $sid) {
            $start = microtime(true);
            while (microtime(true) - $start < 30) {
                $queue = Cache::pull("rt:$id:$sid:queue", []);
                foreach ($queue as $event) {
                    echo "event: {$event['type']}\n";
                    echo "data: " . json_encode($event) . "\n\n";
                    @ob_flush();
                    @flush();
                }
                usleep(200000);
            }
            echo "event: end\ndata: {}\n\n";
            @ob_flush();
            @flush();
        }, 200, [
            'Content-Type'      => 'text/event-stream',
            'Cache-Control'     => 'no-cache',
            'Connection'        => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    // -------------------------------------------------------
    //  Helpers
    // -------------------------------------------------------

    private function transcribeChunk(string $webmPath): string
    {
        try {
            $ffmpeg = env('FFMPEG_PATH', 'ffmpeg');
            $python = env('PYTHON_PATH', 'python');
            $wavPath = storage_path('app/temp_' . uniqid() . '.wav');

            if (filesize($webmPath) < 1000) {
                Log::warning("Tiny file skipped: $webmPath");
                return '';
            }

            $cmd = "\"$ffmpeg\" -hide_banner -loglevel error -y -i " .
                    escapeshellarg($webmPath) .
                    " -vn -acodec pcm_s16le -ar 16000 -ac 1 " .
                    escapeshellarg($wavPath) . " 2>&1";
            exec($cmd, $out, $code);

            if ($code !== 0 || !file_exists($wavPath) || filesize($wavPath) < 2000) {
                Log::error("FFmpeg failed ($code): " . implode("\n", $out));
                return '';
            }

            // Run whisper
            $cmd2 = "\"$python\" -m whisper " .
                    escapeshellarg($wavPath) .
                    " --model base --language en --output_format txt --verbose False --output_dir " .
                    escapeshellarg(storage_path('app')) . " 2>&1";
            exec($cmd2, $out2, $code2);
            Log::debug("Whisper output:\n" . implode("\n", $out2));

            if ($code2 !== 0) {
                Log::error("Whisper exited $code2");
                return '';
            }

            $txtFile = $wavPath . '.txt';
            $altFile = preg_replace('/\.wav$/', '.txt', $wavPath);
            $fileOut = file_exists($txtFile) ? $txtFile : (file_exists($altFile) ? $altFile : null);

            $text = $fileOut ? trim(file_get_contents($fileOut)) : '';
            if (!$text) Log::warning("Whisper produced empty transcript for $wavPath");

            @unlink($txtFile);
            @unlink($altFile);
            @unlink($wavPath);

            return $text;
        } catch (\Throwable $e) {
            Log::error("transcribeChunk exception: " . $e->getMessage());
            return '';
        }
    }

    private function quickFeedback(string $text): array
    {
        $fillers = preg_match_all('/\b(um|uh|like|you know)\b/i', $text);
        $pace = str_word_count($text) < 8 ? 'slow' : 'good';
        return ['note' => Str::limit($text, 80), 'fillerWords' => $fillers, 'pace' => $pace];
    }

    private function finalFeedback(string $question, string $answer): array
    {
        $prompt = <<<TXT
Analyze the following interview response and output concise JSON:
Question: "$question"
Answer: "$answer"

JSON: {"clarity":0-100,"confidence":0-100,"structure":0-100,"summary":"short summary","tips":["tip1","tip2"]}
TXT;

        try {
            $res = Http::withHeaders([
                'Authorization' => 'Bearer ' . env('OPENAI_API_KEY'),
                'Content-Type'  => 'application/json'
            ])->post('https://api.openai.com/v1/chat/completions', [
                'model' => 'gpt-4o-mini',
                'messages' => [
                    ['role' => 'system', 'content' => 'Return valid JSON only.'],
                    ['role' => 'user', 'content' => $prompt],
                ],
                'temperature' => 0.3,
            ]);

            $json = json_decode($res->json('choices.0.message.content') ?? '{}', true);
            return is_array($json)
                ? $json
                : ['clarity'=>70,'confidence'=>70,'structure'=>70,'summary'=>'Parse error','tips'=>[]];
        } catch (\Throwable $e) {
            Log::error("finalFeedback error: " . $e->getMessage());
            return ['clarity'=>60,'confidence'=>60,'structure'=>60,'summary'=>'Error','tips'=>[]];
        }
    }
}
