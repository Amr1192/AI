<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Job;
use App\Models\User;
use App\Services\EmbeddingService;
use App\Services\JobEmbeddingService;
use App\Services\ProfileEmbeddingService;
use App\Services\RagService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class RagController extends Controller
{
    protected $embeddingService;
    protected $jobEmbeddingService;
    protected $profileEmbeddingService;
    protected $ragService;

    public function __construct(
        EmbeddingService $embeddingService,
        JobEmbeddingService $jobEmbeddingService,
        ProfileEmbeddingService $profileEmbeddingService,
        RagService $ragService
    ) {
        $this->embeddingService = $embeddingService;
        $this->jobEmbeddingService = $jobEmbeddingService;
        $this->profileEmbeddingService = $profileEmbeddingService;
        $this->ragService = $ragService;
    }

    /**
     * Get AI-powered job recommendations for authenticated user
     * 
     * GET /api/rag/recommendations
     */
  public function getRecommendations(Request $request)
{
    $user = $request->user();
    
    // Check if user has a profile
    if (!$user->profile) {
        return response()->json([
            'message' => 'Please complete your profile first to get personalized recommendations.',
            'has_profile' => false
        ], 400);
    }

    // ✅ Validate profile completeness
    $validation = $this->profileEmbeddingService->validateProfileCompleteness($user);
    
    if (!$validation['valid']) {
        return response()->json([
            'message' => 'Your profile needs more information for accurate AI recommendations.',
            'profile_completion' => $validation['score'] . '%',
            'missing_fields' => [
                'professional_bio' => in_array('professional_bio', $validation['missing']) 
                    ? 'Add a professional bio (at least 50 characters)' 
                    : null,
                'skills' => in_array('skills', $validation['missing']) 
                    ? 'Add at least one skill' 
                    : null,
                'work_experience' => in_array('work_experience', $validation['missing']) 
                    ? 'Add at least one work experience' 
                    : null,
            ],
            'has_profile' => true,
            'needs_completion' => true
        ], 400);
    }

    // Generate profile embedding if not exists
    if (!$user->profile->embedding) {
        $generated = $this->profileEmbeddingService->generateEmbedding($user);
        
        if (!$generated) {
            return response()->json([
                'message' => 'Failed to generate AI profile. Please try again or contact support.',
                'error' => 'embedding_generation_failed'
            ], 500);
        }
    }

    $topK = (int) $request->input('limit', 10);
    $withExplanations = $request->boolean('explain', config('ai.rag_explanations', false));
    $result = $this->ragService->findMatchingJobs($user, $topK, $withExplanations);

    if (isset($result['error'])) {
        return response()->json([
            'message' => $result['error'],
            'recommendations' => [],
            'threshold' => $result['threshold'] ?? null,
        ], 404);
    }

    return response()->json([
        'message' => 'AI-powered job recommendations generated successfully',
        'count' => count($result['jobs']),
        'profile_completion' => $validation['score'] . '%',
        'threshold' => $result['threshold_applied'] ?? null,
        'recommendations' => $result['jobs'],
    ]);
}



    /**
     * Get AI-powered candidate recommendations for a job (for recruiters)
     * 
     * GET /api/rag/jobs/{jobId}/candidates
     */
    public function getCandidatesForJob(Request $request, $jobId)
    {
        $job = Job::with('company')->find($jobId);

        if (!$job) {
            return response()->json(['message' => 'Job not found'], 404);
        }

        // Check if user owns this job posting (if you have authorization logic)
        // $this->authorize('view', $job);

        if (!$job->embedding) {
            $generated = $this->jobEmbeddingService->generateEmbedding($job);
            $job->refresh();
            if (!$generated || !$job->embedding) {
                return response()->json([
                    'message' => 'Failed to generate job embedding. Check OPENAI_API_KEY and try again.',
                    'candidates' => [],
                ], 500);
            }
        }

        $topK = (int) $request->input('limit', 10);
        $withExplanations = $request->boolean('explain', config('ai.rag_explanations', false));
        $result = $this->ragService->findMatchingCandidates($job, $topK, $withExplanations);
        $candidates = $result['candidates'] ?? [];
        $message = $result['message'] ?? $result['error'] ?? null;
        $usedFallback = false;

        if (empty($candidates)) {
            $candidates = $this->ragService->findCandidatesFallback($job, $topK);
            if (!empty($candidates)) {
                $usedFallback = true;
                $message = $message
                    ? $message . ' Showing skill-based matches as a fallback.'
                    : 'No vector matches found. Showing skill-based candidate matches.';
            }
        }

        if (empty($candidates)) {
            $message = $message ?: 'No matching candidates found. Ensure users have complete profiles and run profile embedding generation.';
        } elseif (!$usedFallback) {
            $message = $message ?: 'Candidate recommendations generated successfully via semantic search.';
        }

        return response()->json([
            'message' => $message,
            'job' => [
                'id' => $job->id,
                'title' => $job->title,
                'company' => $job->company->name ?? 'Unknown company',
            ],
            'count' => count($candidates),
            'threshold' => $result['threshold_applied'] ?? null,
            'used_fallback' => $usedFallback,
            'candidates' => $candidates,
        ]);
    }

    /**
     * Generate/Update embedding for current user's profile
     * 
     * POST /api/rag/profile/generate-embedding
     */
    public function generateProfileEmbedding(Request $request)
    {
        $user = $request->user();

        if (!$user->profile) {
            return response()->json([
                'message' => 'Please create a profile first'
            ], 400);
        }

        $success = $this->profileEmbeddingService->generateEmbedding($user);

        if ($success) {
            return response()->json([
                'message' => 'Profile embedding generated successfully',
                'embedding_generated_at' => $user->profile->fresh()->embedding_generated_at
            ]);
        }

        return response()->json([
            'message' => 'Failed to generate profile embedding. Please try again.'
        ], 500);
    }

    /**
     * Generate/Update embedding for a specific job
     * 
     * POST /api/rag/jobs/{jobId}/generate-embedding
     */
    public function generateJobEmbedding(Request $request, $jobId)
    {
        $job = Job::with('company')->find($jobId);

        if (!$job) {
            return response()->json(['message' => 'Job not found'], 404);
        }

        // Check if user owns this job posting
        // $this->authorize('update', $job);

        $success = $this->jobEmbeddingService->generateEmbedding($job);

        if ($success) {
            return response()->json([
                'message' => 'Job embedding generated successfully',
                'embedding_generated_at' => $job->fresh()->embedding_generated_at
            ]);
        }

        return response()->json([
            'message' => 'Failed to generate job embedding. Please try again.'
        ], 500);
    }

    /**
     * Generate embeddings for all jobs (Admin only)
     * 
     * POST /api/rag/jobs/generate-all-embeddings
     */
    public function generateAllJobEmbeddings(Request $request)
    {
        // Add admin check here
        // if (!$request->user()->isAdmin()) {
        //     return response()->json(['message' => 'Unauthorized'], 403);
        // }

        $count = $this->jobEmbeddingService->generateAllEmbeddings();

        return response()->json([
            'message' => "Successfully generated embeddings for {$count} jobs",
            'count' => $count
        ]);
    }

    /**
     * Generate embeddings for all profiles (Admin only)
     * 
     * POST /api/rag/profiles/generate-all-embeddings
     */
    public function generateAllProfileEmbeddings(Request $request)
    {
        // Add admin check here
        // if (!$request->user()->isAdmin()) {
        //     return response()->json(['message' => 'Unauthorized'], 403);
        // }

        $force = $request->boolean('force', false);
        $count = $this->profileEmbeddingService->generateAllEmbeddings($force);

        return response()->json([
            'message' => "Successfully generated embeddings for {$count} profiles",
            'count' => $count,
            'force' => $force,
        ]);
    }

    /**
     * Search jobs using natural language query
     * 
     * POST /api/rag/search-jobs
     */
    public function searchJobs(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'query' => 'required|string|min:3',
            'limit' => 'nullable|integer|min:1|max:50'
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $query = $request->input('query');
        $limit = $request->input('limit', 10);

        // Generate embedding for the search query
        $queryEmbedding = $this->embeddingService->generateEmbedding($query);

        if (!$queryEmbedding) {
            return response()->json([
                'message' => 'Failed to process search query'
            ], 500);
        }

        // Get all active jobs with embeddings
        $jobs = Job::with('company')
            ->where('is_active', true)
            ->whereNotNull('embedding')
            ->get();

        if ($jobs->isEmpty()) {
            return response()->json([
                'message' => 'No jobs available',
                'jobs' => []
            ]);
        }

        // Prepare jobs array
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
                'embedding' => $job->embedding,
            ];
        })->toArray();

        $threshold = (float) config('ai.rag_similarity_threshold', 0.65);
        $similarJobs = $this->embeddingService->findSimilar($queryEmbedding, $jobsArray, $limit, $threshold);

        $results = array_map(function ($job) {
            return [
                'job_id' => $job['id'],
                'title' => $job['title'],
                'company' => $job['company'],
                'location' => $job['location'],
                'type' => $job['type'],
                'salary_from' => $job['salary_from'],
                'salary_to' => $job['salary_to'],
                'similarity_score' => round($job['similarity_score'], 4),
                'match_percentage' => round($job['similarity_score'] * 100, 2),
                'description' => substr($job['description'], 0, 200) . '...',
                'requirements' => substr($job['requirements'], 0, 200) . '...'
            ];
        }, $similarJobs);

        return response()->json([
            'query' => $query,
            'count' => count($results),
            'jobs' => $results
        ]);
    }

    /**
     * Get embedding status for current user
     * 
     * GET /api/rag/profile/embedding-status
     */
    public function getProfileEmbeddingStatus(Request $request)
    {
        $user = $request->user();
        $profile = $user->profile;

        if (!$profile) {
            return response()->json([
                'has_profile' => false,
                'has_embedding' => false,
                'message' => 'Please create your profile first'
            ]);
        }

        return response()->json([
            'has_profile' => true,
            'has_embedding' => !is_null($profile->embedding),
            'embedding_generated_at' => $profile->embedding_generated_at,
            'needs_update' => $profile->embedding_generated_at 
                ? $profile->embedding_generated_at->diffInDays(now()) > 30 
                : true
        ]);
    }
}
