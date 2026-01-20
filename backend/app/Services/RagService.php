<?php

namespace App\Services;

use App\Models\Job;
use App\Models\User;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\Log;

class RagService
{
    protected $embeddingService;
    protected $client;
    protected $apiKey;

    public function __construct(EmbeddingService $embeddingService)
    {
        $this->embeddingService = $embeddingService;
        $this->client = new Client();
        $this->apiKey = env('OPENAI_API_KEY');
    }

    /**
     * Find jobs that match a user's profile using RAG
     *
     * @param User $user
     * @param int $topK
     * @return array
     */
   public function findMatchingJobs(User $user, int $topK = 10): array
{
    $profile = $user->profile;
    
    if (!$profile || !$profile->embedding) {
        return [
            'error' => 'User profile embedding not found. Please update your profile.',
            'jobs' => []
        ];
    }

    // Get all active jobs with embeddings
    $jobs = Job::with('company')
        ->where('is_active', true)
        ->whereNotNull('embedding')
        ->get();

    if ($jobs->isEmpty()) {
        return [
            'error' => 'No jobs available at the moment. Please check back later.',
            'jobs' => []
        ];
    }

    // Prepare jobs array with embeddings
    $jobsArray = $jobs->map(function ($job) {
        return [
            'id' => $job->id,
            'title' => $job->title,
            'company' => $job->company->name,
            'location' => $job->location,
            'type' => $job->type,
            'description' => $job->description,
            'requirements' => $job->requirements,
            'salary_from' => $job->salary_from,
            'salary_to' => $job->salary_to,
            'embedding' => json_decode($job->embedding, true),
            'embedding_text' => $job->embedding_text
        ];
    })->toArray();

    // Find similar jobs
    $profileEmbedding = json_decode($profile->embedding, true);
    $similarJobs = $this->embeddingService->findSimilar($profileEmbedding, $jobsArray, $topK);

    // ✅ Filter out jobs with similarity below 50% (0.5)
    $MIN_SIMILARITY_THRESHOLD = 0.80; // 50% minimum match
    
    $filteredJobs = array_filter($similarJobs, function($job) use ($MIN_SIMILARITY_THRESHOLD) {
        return $job['similarity_score'] >= $MIN_SIMILARITY_THRESHOLD;
    });

    // If no jobs meet threshold, return message
    if (empty($filteredJobs)) {
        return [
            'error' => 'No jobs found that closely match your profile. Try updating your skills or experience to get better matches.',
            'jobs' => [],
            'threshold' => $MIN_SIMILARITY_THRESHOLD
        ];
    }

    // Re-index array after filtering
    $filteredJobs = array_values($filteredJobs);

    // Limit to topK
    $filteredJobs = array_slice($filteredJobs, 0, $topK);

    // Generate explanations using LLM
    $jobsWithExplanations = $this->generateExplanations($user, $filteredJobs);

    return [
        'profile_text' => $profile->embedding_text,
        'jobs' => $jobsWithExplanations,
        'threshold_applied' => $MIN_SIMILARITY_THRESHOLD,
        'total_matches' => count($filteredJobs)
    ];
}


    public function findMatchingCandidates(Job $job, int $topK = 10): array
    {
        if (!$job->embedding) {
            return [
                'error' => 'Job embedding not found.',
                'candidates' => []
            ];
        }

        // Get all profiles with embeddings
        $profiles = \App\Models\Profile::with(['user.skills', 'user.workExperiences', 'user.education'])
            ->whereNotNull('embedding')
            ->get();

        if ($profiles->isEmpty()) {
            return [
                'message' => 'No candidate profiles available',
                'candidates' => []
            ];
        }

        // Prepare profiles array with embeddings
        $profilesArray = $profiles->map(function ($profile) {
            return [
                'user_id' => $profile->user_id,
                'name' => $profile->user->name,
                'email' => $profile->user->email,
                'location' => $profile->location,
                'years_of_experience' => $profile->years_of_experience,
                'professional_bio' => $profile->professional_bio,
                'embedding' => json_decode($profile->embedding, true),
                'embedding_text' => $profile->embedding_text
            ];
        })->toArray();

        // Find similar candidates
        $jobEmbedding = json_decode($job->embedding, true);
        $similarCandidates = $this->embeddingService->findSimilar($jobEmbedding, $profilesArray, $topK);

        // Generate explanations
        $candidatesWithExplanations = $this->generateCandidateExplanations($job, $similarCandidates);

        return [
            'job_text' => $job->embedding_text,
            'candidates' => $candidatesWithExplanations
        ];
    }

    /**
     * Generate explanations for why jobs match using GPT
     *
     * @param User $user
     * @param array $jobs
     * @return array
     */
    protected function generateExplanations(User $user, array $jobs): array
    {
        $profile = $user->profile;
        $profileText = $profile->embedding_text;

        $results = [];

        foreach ($jobs as $job) {
            try {
                $prompt = $this->buildJobMatchPrompt($profileText, $job);
                $explanation = $this->callOpenAI($prompt);

                $results[] = [
                    'job_id' => $job['id'],
                    'title' => $job['title'],
                    'company' => $job['company'],
                    'location' => $job['location'],
                    'type' => $job['type'],
                    'salary_from' => $job['salary_from'],
                    'salary_to' => $job['salary_to'],
                    'similarity_score' => round($job['similarity_score'], 4),
                    'match_percentage' => round($job['similarity_score'] * 100, 2),
                    'explanation' => $explanation,
                    'description' => substr($job['description'], 0, 200) . '...',
                    'requirements' => substr($job['requirements'], 0, 200) . '...'
                ];
            } catch (\Exception $e) {
                Log::error('Error generating explanation: ' . $e->getMessage());
                $results[] = [
                    'job_id' => $job['id'],
                    'title' => $job['title'],
                    'company' => $job['company'],
                    'location' => $job['location'],
                    'type' => $job['type'],
                    'salary_from' => $job['salary_from'],
                    'salary_to' => $job['salary_to'],
                    'similarity_score' => round($job['similarity_score'], 4),
                    'match_percentage' => round($job['similarity_score'] * 100, 2),
                    'explanation' => 'This job matches your profile based on AI similarity analysis.',
                    'description' => substr($job['description'], 0, 200) . '...',
                    'requirements' => substr($job['requirements'], 0, 200) . '...'
                ];
            }
        }

        return $results;
    }

    /**
     * Generate explanations for why candidates match a job
     *
     * @param Job $job
     * @param array $candidates
     * @return array
     */
    protected function generateCandidateExplanations(Job $job, array $candidates): array
    {
        $jobText = $job->embedding_text;

        $results = [];

        foreach ($candidates as $candidate) {
            try {
                $prompt = $this->buildCandidateMatchPrompt($jobText, $candidate);
                $explanation = $this->callOpenAI($prompt);

                $results[] = [
                    'user_id' => $candidate['user_id'],
                    'name' => $candidate['name'],
                    'email' => $candidate['email'],
                    'location' => $candidate['location'],
                    'years_of_experience' => $candidate['years_of_experience'],
                    'similarity_score' => round($candidate['similarity_score'], 4),
                    'match_percentage' => round($candidate['similarity_score'] * 100, 2),
                    'explanation' => $explanation,
                    'professional_bio' => substr($candidate['professional_bio'] ?? '', 0, 200) . '...'
                ];
            } catch (\Exception $e) {
                Log::error('Error generating candidate explanation: ' . $e->getMessage());
                $results[] = [
                    'user_id' => $candidate['user_id'],
                    'name' => $candidate['name'],
                    'email' => $candidate['email'],
                    'location' => $candidate['location'],
                    'years_of_experience' => $candidate['years_of_experience'],
                    'similarity_score' => round($candidate['similarity_score'], 4),
                    'match_percentage' => round($candidate['similarity_score'] * 100, 2),
                    'explanation' => 'This candidate matches the job requirements based on AI similarity analysis.',
                    'professional_bio' => substr($candidate['professional_bio'] ?? '', 0, 200) . '...'
                ];
            }
        }

        return $results;
    }

    /**
     * Build prompt for job matching
     *
     * @param string $profileText
     * @param array $job
     * @return string
     */
    protected function buildJobMatchPrompt(string $profileText, array $job): string
    {
        return "You are a career advisor AI. Based on the following candidate profile and job posting, explain in 2-3 sentences why this job is a good match for the candidate. Focus on specific skills, experience, and qualifications that align.

Candidate Profile:
{$profileText}

Job Posting:
{$job['embedding_text']}

Provide a concise, professional explanation of why this is a good match:";
    }

    /**
     * Build prompt for candidate matching
     *
     * @param string $jobText
     * @param array $candidate
     * @return string
     */
    protected function buildCandidateMatchPrompt(string $jobText, array $candidate): string
    {
        return "You are a recruitment AI. Based on the following job posting and candidate profile, explain in 2-3 sentences why this candidate is a good fit for the position. Focus on specific skills, experience, and qualifications that align with job requirements.

Job Posting:
{$jobText}

Candidate Profile:
{$candidate['embedding_text']}

Provide a concise, professional explanation of why this candidate is a good fit:";
    }

    /**
     * Call OpenAI API for text generation
     *
     * @param string $prompt
     * @return string
     */
    protected function callOpenAI(string $prompt): string
    {
        try {
            $response = $this->client->post('https://api.openai.com/v1/chat/completions', [
                'headers' => [
                    'Authorization' => 'Bearer ' . $this->apiKey,
                    'Content-Type' => 'application/json',
                ],
                'json' => [
                    'model' => 'gpt-3.5-turbo',
                    'messages' => [
                        [
                            'role' => 'system',
                            'content' => 'You are a professional career advisor and recruitment expert.'
                        ],
                        [
                            'role' => 'user',
                            'content' => $prompt
                        ]
                    ],
                    'max_tokens' => 150,
                    'temperature' => 0.7,
                ],
                'timeout' => 30,
            ]);

            $result = json_decode($response->getBody()->getContents(), true);
            return trim($result['choices'][0]['message']['content']);
        } catch (\Exception $e) {
            Log::error('OpenAI API error: ' . $e->getMessage());
            throw $e;
        }
    }
}
