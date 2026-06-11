<?php

namespace App\Services;

use App\Models\Job;
use App\Models\Profile;
use App\Models\User;
use App\Support\HttpClientOptions;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\Log;

class RagService
{
    protected EmbeddingService $embeddingService;
    protected SkillMatchService $skillMatchService;
    protected Client $client;
    protected ?string $apiKey;

    public function __construct(
        EmbeddingService $embeddingService,
        SkillMatchService $skillMatchService
    ) {
        $this->embeddingService = $embeddingService;
        $this->skillMatchService = $skillMatchService;
        $this->client = new Client(HttpClientOptions::guzzle());
        $this->apiKey = config('ai.openai_api_key') ?: env('OPENAI_API_KEY');
    }

    protected function similarityThreshold(): float
    {
        return (float) config('ai.rag_similarity_threshold', 0.65);
    }

    protected function retrievalPoolSize(int $topK): int
    {
        return max($topK * 5, 30);
    }

    protected function shouldGenerateExplanations(): bool
    {
        return (bool) config('ai.rag_explanations', false);
    }

    /**
     * Find jobs that match a user (hybrid: embeddings + skill overlap).
     */
    public function findMatchingJobs(User $user, int $topK = 10, bool $withExplanations = null): array
    {
        $user->loadMissing(['profile', 'skills']);
        $profile = $user->profile;

        if (!$profile) {
            return ['error' => 'User profile not found. Please complete your profile.', 'jobs' => []];
        }

        $profileEmbedding = $this->embeddingService->normalizeEmbedding($profile->embedding);
        if ($profileEmbedding === null) {
            return [
                'error' => 'User profile embedding not found. Please update your profile.',
                'jobs' => [],
            ];
        }

        $jobs = Job::with('company')
            ->where('is_active', true)
            ->whereNotNull('embedding')
            ->get();

        if ($jobs->isEmpty()) {
            return [
                'error' => 'No jobs with AI embeddings available yet. Ask an admin to index jobs.',
                'jobs' => [],
            ];
        }

        $jobsArray = $jobs->map(fn ($job) => $this->mapJobForSearch($job))->toArray();
        $userSkillTitles = $user->skills->pluck('title')->all();

        $semanticMatches = $this->embeddingService->findSimilar(
            $profileEmbedding,
            $jobsArray,
            $this->retrievalPoolSize($topK)
        );

        $hybridMatches = $this->applyHybridJobScoring($semanticMatches, $userSkillTitles);
        $hybridMatches = array_slice($hybridMatches, 0, $topK);

        if (empty($hybridMatches)) {
            return [
                'error' => 'No jobs found that match your skills and profile. Add relevant skills to improve matches.',
                'jobs' => [],
                'threshold' => $this->similarityThreshold(),
            ];
        }

        $withExplanations = $withExplanations ?? $this->shouldGenerateExplanations();

        return [
            'profile_text' => $profile->embedding_text,
            'jobs' => $this->formatJobMatches($user, $hybridMatches, $withExplanations),
            'threshold_applied' => $this->similarityThreshold(),
            'scoring' => 'hybrid',
            'total_matches' => count($hybridMatches),
        ];
    }

    /**
     * Find candidates for a job (hybrid: embeddings + skill overlap).
     */
    public function findMatchingCandidates(Job $job, int $topK = 10, bool $withExplanations = null): array
    {
        $jobEmbedding = $this->embeddingService->normalizeEmbedding($job->embedding);
        if ($jobEmbedding === null) {
            return ['error' => 'Job embedding not found.', 'candidates' => []];
        }

        $profiles = Profile::with(['user.skills', 'user.workExperiences', 'user.education'])
            ->whereNotNull('embedding')
            ->get();

        if ($profiles->isEmpty()) {
            return [
                'message' => 'No candidate profile embeddings available. Generate profile embeddings first.',
                'candidates' => [],
            ];
        }

        $jobData = $this->mapJobForSearch($job);
        $profilesArray = $profiles->map(fn ($profile) => $this->mapProfileForSearch($profile))->toArray();

        $semanticMatches = $this->embeddingService->findSimilar(
            $jobEmbedding,
            $profilesArray,
            $this->retrievalPoolSize($topK)
        );

        $hybridMatches = $this->applyHybridCandidateScoring($semanticMatches, $jobData);
        $hybridMatches = array_slice($hybridMatches, 0, $topK);

        if (empty($hybridMatches)) {
            return [
                'message' => 'No candidates matched the required skills for this job.',
                'candidates' => [],
                'threshold' => $this->similarityThreshold(),
            ];
        }

        $withExplanations = $withExplanations ?? $this->shouldGenerateExplanations();

        return [
            'job_text' => $job->embedding_text,
            'candidates' => $this->formatCandidateMatches($job, $hybridMatches, $withExplanations),
            'threshold_applied' => $this->similarityThreshold(),
            'scoring' => 'hybrid',
            'total_matches' => count($hybridMatches),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $semanticMatches
     * @param  string[]  $userSkillTitles
     * @return array<int, array<string, mixed>>
     */
    protected function applyHybridJobScoring(array $semanticMatches, array $userSkillTitles): array
    {
        $scored = [];

        foreach ($semanticMatches as $job) {
            $semanticScore = (float) ($job['similarity_score'] ?? 0);
            $hybrid = $this->skillMatchService->scoreJobForUser($userSkillTitles, $job, $semanticScore);

            if (!$hybrid['eligible']) {
                continue;
            }

            $job['similarity_score'] = $hybrid['final_score'];
            $job['semantic_score'] = $hybrid['semantic_score'];
            $job['skill_score'] = $hybrid['skill_score'];
            $job['skill_overlap_ratio'] = $hybrid['skill_overlap_ratio'];
            $job['matched_skills'] = $hybrid['matched_skills'];
            $job['missing_skills'] = $hybrid['missing_skills'];
            $job['job_skills'] = $hybrid['job_skills'];
            $scored[] = $job;
        }

        usort($scored, fn ($a, $b) => $b['similarity_score'] <=> $a['similarity_score']);

        return $scored;
    }

    /**
     * @param  array<int, array<string, mixed>>  $semanticMatches
     * @return array<int, array<string, mixed>>
     */
    protected function applyHybridCandidateScoring(array $semanticMatches, array $jobData): array
    {
        $scored = [];

        foreach ($semanticMatches as $candidate) {
            $semanticScore = (float) ($candidate['similarity_score'] ?? 0);
            $userSkillTitles = $candidate['skills'] ?? [];
            $hybrid = $this->skillMatchService->scoreCandidateForJob($userSkillTitles, $jobData, $semanticScore);

            if (!$hybrid['eligible']) {
                continue;
            }

            $candidate['similarity_score'] = $hybrid['final_score'];
            $candidate['semantic_score'] = $hybrid['semantic_score'];
            $candidate['skill_score'] = $hybrid['skill_score'];
            $candidate['skill_overlap_ratio'] = $hybrid['skill_overlap_ratio'];
            $candidate['matched_skills'] = $hybrid['matched_skills'];
            $candidate['missing_skills'] = $hybrid['missing_skills'];
            $scored[] = $candidate;
        }

        usort($scored, fn ($a, $b) => $b['similarity_score'] <=> $a['similarity_score']);

        return $scored;
    }

    protected function mapJobForSearch(Job $job): array
    {
        return [
            'id' => $job->id,
            'title' => $job->title,
            'company' => $job->company?->name ?? 'Unknown',
            'location' => $job->location,
            'type' => $job->type,
            'description' => $job->description,
            'requirements' => $job->requirements,
            'salary_from' => $job->salary_from,
            'salary_to' => $job->salary_to,
            'embedding' => $job->embedding,
            'embedding_text' => $job->embedding_text,
        ];
    }

    protected function mapProfileForSearch(Profile $profile): array
    {
        return [
            'user_id' => $profile->user_id,
            'name' => $profile->user->name,
            'email' => $profile->user->email,
            'location' => $profile->location,
            'years_of_experience' => $profile->years_of_experience,
            'professional_bio' => $profile->professional_bio,
            'skills' => $profile->user->skills->pluck('title')->all(),
            'embedding' => $profile->embedding,
            'embedding_text' => $profile->embedding_text,
        ];
    }

    protected function formatJobMatches(User $user, array $jobs, bool $withExplanations): array
    {
        $profileText = $user->profile?->embedding_text ?? '';
        $results = [];

        foreach ($jobs as $job) {
            $score = (float) $job['similarity_score'];
            $explanation = $withExplanations
                ? $this->tryExplainJobMatch($profileText, $job)
                : $this->defaultJobExplanation($job);

            $results[] = [
                'job_id' => $job['id'],
                'title' => $job['title'],
                'company' => $job['company'],
                'location' => $job['location'],
                'type' => $job['type'],
                'salary_from' => $job['salary_from'],
                'salary_to' => $job['salary_to'],
                'similarity_score' => round($score, 4),
                'semantic_score' => isset($job['semantic_score']) ? round((float) $job['semantic_score'], 4) : null,
                'skill_score' => isset($job['skill_score']) ? round((float) $job['skill_score'], 4) : null,
                'match_percentage' => round($score * 100, 2),
                'matched_skills' => $job['matched_skills'] ?? [],
                'missing_skills' => $job['missing_skills'] ?? [],
                'explanation' => $explanation,
                'description' => $this->truncate($job['description'] ?? '', 200),
                'requirements' => $this->truncate($job['requirements'] ?? '', 200),
            ];
        }

        return $results;
    }

    protected function formatCandidateMatches(Job $job, array $candidates, bool $withExplanations): array
    {
        $jobText = $job->embedding_text ?? '';
        $results = [];

        foreach ($candidates as $candidate) {
            $score = (float) $candidate['similarity_score'];
            $explanation = $withExplanations
                ? $this->tryExplainCandidateMatch($jobText, $candidate)
                : $this->defaultCandidateExplanation($candidate);

            $results[] = [
                'user_id' => $candidate['user_id'],
                'name' => $candidate['name'],
                'email' => $candidate['email'],
                'location' => $candidate['location'],
                'years_of_experience' => $candidate['years_of_experience'],
                'similarity_score' => round($score, 4),
                'semantic_score' => isset($candidate['semantic_score']) ? round((float) $candidate['semantic_score'], 4) : null,
                'skill_score' => isset($candidate['skill_score']) ? round((float) $candidate['skill_score'], 4) : null,
                'match_percentage' => round($score * 100, 2),
                'matched_skills' => $candidate['matched_skills'] ?? [],
                'missing_skills' => $candidate['missing_skills'] ?? [],
                'explanation' => $explanation,
                'professional_bio' => $this->truncate($candidate['professional_bio'] ?? '', 200),
            ];
        }

        return $results;
    }

    protected function defaultJobExplanation(array $job): string
    {
        $score = (float) $job['similarity_score'];
        $matched = $job['matched_skills'] ?? [];

        if (!empty($matched)) {
            return sprintf(
                '%.0f%% match — overlapping skills: %s.',
                $score * 100,
                implode(', ', $matched)
            );
        }

        return sprintf('%.0f%% overall match based on profile similarity.', $score * 100);
    }

    protected function defaultCandidateExplanation(array $candidate): string
    {
        $score = (float) $candidate['similarity_score'];
        $matched = $candidate['matched_skills'] ?? [];

        if (!empty($matched)) {
            return sprintf(
                '%.0f%% match — candidate skills aligned with job: %s.',
                $score * 100,
                implode(', ', $matched)
            );
        }

        return sprintf('%.0f%% overall match based on profile similarity.', $score * 100);
    }

    protected function tryExplainJobMatch(string $profileText, array $job): string
    {
        try {
            return $this->callOpenAI($this->buildJobMatchPrompt($profileText, $job));
        } catch (\Exception $e) {
            Log::error('Error generating job match explanation: ' . $e->getMessage());
            return $this->defaultJobExplanation($job);
        }
    }

    protected function tryExplainCandidateMatch(string $jobText, array $candidate): string
    {
        try {
            return $this->callOpenAI($this->buildCandidateMatchPrompt($jobText, $candidate));
        } catch (\Exception $e) {
            Log::error('Error generating candidate match explanation: ' . $e->getMessage());
            return $this->defaultCandidateExplanation($candidate);
        }
    }

    protected function buildJobMatchPrompt(string $profileText, array $job): string
    {
        $matched = implode(', ', $job['matched_skills'] ?? []) ?: 'none identified';
        $missing = implode(', ', $job['missing_skills'] ?? []) ?: 'none';

        return "You are a career advisor AI. Explain in 2-3 sentences why this job fits (or partially fits) the candidate. Be honest about skill gaps.

Candidate Profile:
{$profileText}

Job:
{$job['embedding_text']}

Matched skills: {$matched}
Missing skills: {$missing}

Provide a concise, professional explanation:";
    }

    protected function buildCandidateMatchPrompt(string $jobText, array $candidate): string
    {
        $matched = implode(', ', $candidate['matched_skills'] ?? []) ?: 'none identified';
        $missing = implode(', ', $candidate['missing_skills'] ?? []) ?: 'none';

        return "You are a recruitment AI. Explain in 2-3 sentences why this candidate fits the job based on verified skill overlap.

Job:
{$jobText}

Candidate:
{$candidate['embedding_text']}

Matched skills: {$matched}
Missing skills: {$missing}

Provide a concise, professional explanation:";
    }

    protected function callOpenAI(string $prompt): string
    {
        $response = $this->client->post('https://api.openai.com/v1/chat/completions', [
            'headers' => [
                'Authorization' => 'Bearer ' . $this->apiKey,
                'Content-Type' => 'application/json',
            ],
            'json' => [
                'model' => config('ai.rag_model', 'gpt-4o-mini'),
                'messages' => [
                    ['role' => 'system', 'content' => 'You are a professional career advisor and recruitment expert.'],
                    ['role' => 'user', 'content' => $prompt],
                ],
                'max_tokens' => 150,
                'temperature' => 0.7,
            ],
            'timeout' => 20,
        ]);

        $result = json_decode($response->getBody()->getContents(), true);

        return trim($result['choices'][0]['message']['content'] ?? '');
    }

    protected function truncate(?string $text, int $length): string
    {
        $text = (string) $text;
        if (strlen($text) <= $length) {
            return $text;
        }

        return substr($text, 0, $length) . '...';
    }

    /**
     * Skill-based fallback when embeddings are unavailable.
     */
    public function findCandidatesFallback(Job $job, int $topK = 10): array
    {
        $job->loadMissing('company');
        $jobData = $this->mapJobForSearch($job);
        $jobSkills = $this->skillMatchService->extractFromJob($jobData);

        $users = User::with(['profile', 'skills'])
            ->whereHas('skills')
            ->get();

        $candidates = [];

        foreach ($users as $user) {
            $userSkillTitles = $user->skills->pluck('title')->all();
            $hybrid = $this->skillMatchService->scoreCandidateForJob($userSkillTitles, $jobData, 0.5);

            if (!$hybrid['eligible'] && empty($hybrid['matched_skills'])) {
                continue;
            }

            $score = $hybrid['eligible'] ? $hybrid['final_score'] : ($hybrid['skill_overlap_ratio'] ?? 0);

            $candidates[] = [
                'user_id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'location' => $user->profile?->location,
                'years_of_experience' => $user->profile?->years_of_experience,
                'professional_bio' => $user->profile?->professional_bio,
                'similarity_score' => round($score, 4),
                'match_percentage' => round($score * 100, 2),
                'matched_skills' => $hybrid['matched_skills'],
                'missing_skills' => $hybrid['missing_skills'],
                'explanation' => !empty($hybrid['matched_skills'])
                    ? 'Matched based on skills: ' . implode(', ', $hybrid['matched_skills']) . '.'
                    : 'Partial profile overlap.',
            ];
        }

        usort($candidates, fn ($a, $b) => $b['match_percentage'] <=> $a['match_percentage']);

        return array_slice($candidates, 0, $topK);
    }
}
