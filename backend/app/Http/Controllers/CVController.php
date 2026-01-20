<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CVController extends Controller
{
    /**
     * POST /api/cv/generate
     * Accepts basic profile data and returns a generated CV/text using Anthropic (Claude Haiku 4.5)
     * Falls back to OpenAI if Anthropic isn't configured or fails.
     */
    public function generate(Request $request)
    {
        $payload = $request->only(['personalInfo', 'skills', 'summary', 'experience', 'education', 'style']);

        $personal = $payload['personalInfo'] ?? [];
        $skills = $payload['skills'] ?? [];
        $summary = $payload['summary'] ?? '';

        // Build a concise prompt for the model
        $skillText = 'None';
        if (is_array($skills)) {
            $skillText = implode(', ', $skills);
        } elseif (is_string($skills)) {
            $skillText = $skills;
        }

        $name = $personal['fullName'] ?? ($personal['name'] ?? '');
        $email = $personal['email'] ?? '';
        $phone = $personal['phone'] ?? '';
        $location = $personal['location'] ?? '';

        $style = $payload['style'] ?? 'professional';

        $prompt = <<<PROMPT
You are a resume writer. Given the candidate information below, generate a polished one-page CV in JSON with keys: "title", "contact", "summary", "experience", "education", "skills", where "experience" and "education" are arrays of objects and "skills" is an array of strings. Keep the CV concise and tailored to a $style tone.

Candidate:
- Name: {$name}
- Email: {$email}
- Phone: {$phone}
- Location: {$location}
- Skills: {$skillText}
- Summary: {$summary}

Return ONLY valid JSON. Do NOT include markdown or any surrounding text.
PROMPT;

        try {
            $content = null;

            // Prefer Anthropic if configured
            if (env('ANTHROPIC_API_KEY')) {
                $anthropicKey = env('ANTHROPIC_API_KEY');
                $anthropicModel = env('ANTHROPIC_MODEL', 'claude-haiku-4.5');

                Log::info('Generating CV via Anthropic', ['model' => $anthropicModel]);

                $resp = Http::withHeaders([
                    'x-api-key' => $anthropicKey,
                    'Content-Type' => 'application/json'
                ])->timeout(60)->post('https://api.anthropic.com/v1/complete', [
                    'model' => $anthropicModel,
                    'prompt' => "Human: {$prompt}\n\nAssistant:",
                    'max_tokens' => 1000,
                    'temperature' => 0.2,
                ]);

                Log::info('Anthropic response', ['status' => $resp->status()]);

                if ($resp->successful()) {
                    $j = $resp->json();
                    $content = $j['completion'] ?? $j['response'] ?? $resp->body();
                } else {
                    Log::warning('Anthropic CV generation failed', ['status' => $resp->status(), 'body' => $resp->body()]);
                }
            }

            // Fallback to OpenAI if necessary
            if (!$content) {
                if (!env('OPENAI_API_KEY')) {
                    Log::error('No AI provider configured (ANTHROPIC_API_KEY or OPENAI_API_KEY required)');
                    return response()->json(['error' => 'No AI provider configured'], 500);
                }

                $openaiKey = env('OPENAI_API_KEY');
                $openaiModel = env('OPENAI_MODEL', 'gpt-4o-mini');

                Log::info('Generating CV via OpenAI', ['model' => $openaiModel]);

                $resp = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $openaiKey,
                    'Content-Type' => 'application/json'
                ])->timeout(60)->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $openaiModel,
                    'messages' => [
                        ['role' => 'system', 'content' => 'You are a resume writer. Return only valid JSON.'],
                        ['role' => 'user', 'content' => $prompt]
                    ],
                    'temperature' => 0.2,
                    'max_tokens' => 1500,
                ]);

                Log::info('OpenAI response', ['status' => $resp->status()]);

                if ($resp->successful()) {
                    $rd = $resp->json();
                    $content = $rd['choices'][0]['message']['content'] ?? $resp->body();
                } else {
                    Log::error('OpenAI CV generation failed', ['status' => $resp->status(), 'body' => $resp->body()]);
                    return response()->json(['error' => 'AI provider failed'], 500);
                }
            }

            // Clean fencing and trim
            $content = preg_replace('/```json\s*/', '', $content);
            $content = preg_replace('/```\s*/', '', $content);
            $content = trim($content);

            $decoded = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                Log::error('CV JSON decode error', ['error' => json_last_error_msg(), 'content' => $content]);
                return response()->json(['error' => 'Invalid response from AI', 'raw' => $content], 500);
            }

            return response()->json(['cv' => $decoded]);

        } catch (\Throwable $e) {
            Log::error('CV generation exception', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'Server error generating CV'], 500);
        }
    }
}
