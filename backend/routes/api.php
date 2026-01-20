<?php

use App\Http\Controllers\API\AdminController;
use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\JobController;
use App\Http\Controllers\API\RagController;
use App\Http\Controllers\API\ProfileController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Http;
use App\Http\Controllers\API\CVAnalysisController;
use App\Http\Controllers\InterviewController;
use App\Http\Controllers\RealtimeInterviewController;
use App\Http\Controllers\UserSkillController;
use App\Http\Controllers\CvController;
use App\Http\Controllers\UserCvController;

/*
|--------------------------------------------------------------------------
| API Routes - OpenAI Test
|--------------------------------------------------------------------------
*/
Route::get('/check-key', function () {
    $key = env('OPENAI_API_KEY');
    $project = env('OPENAI_PROJECT_ID');
    $headers = ['Authorization' => 'Bearer ' . $key];
    if ($project) $headers['OpenAI-Project'] = $project;
    $res = Http::withHeaders($headers)->get('https://api.openai.com/v1/models');
    return response()->json([
        'status' => $res->status(),
        'body'   => $res->json(),
    ]);
});

// Generate description for jOB
Route::post('/admin/jobs/generate-description', [AdminController::class, 'generateDescription']);

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/
Route::post('/cv/analyze', [CVAnalysisController::class, 'analyze']);
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::get('/jobs', [JobController::class, 'index']);

/*
|--------------------------------------------------------------------------
| RAG Protected Routes (MUST come BEFORE public RAG routes)
|--------------------------------------------------------------------------
*/

//PREFIXED WITH RAGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
Route::middleware('auth:sanctum')->prefix('rag')->group(function () {
    // Job Recommendations
    Route::get('/recommendations', [RagController::class, 'getRecommendations']);
    
    // Natural Language Search
    Route::post('/search-jobs', [RagController::class, 'searchJobs']);
    
    // Profile Embeddings
    Route::get('/profile/embedding-status', [RagController::class, 'getProfileEmbeddingStatus']);
    Route::post('/profile/generate-embedding', [RagController::class, 'generateProfileEmbedding']);
    
    // Job Embeddings
    Route::post('/jobs/{jobId}/generate-embedding', [RagController::class, 'generateJobEmbedding']);
    
    // Candidate Recommendations
    Route::get('/jobs/{jobId}/candidates', [RagController::class, 'getCandidatesForJob']);
    
    // Admin Operations (FIXED: removed duplicate /rag prefix)
    Route::post('/jobs/generate-all-embeddings', [RagController::class, 'generateAllJobEmbeddings']);
    Route::post('/profiles/generate-all-embeddings', [RagController::class, 'generateAllProfileEmbeddings']);
});

/*
|--------------------------------------------------------------------------
| RAG Public Routes (MUST come AFTER protected routes)
|--------------------------------------------------------------------------
*/
Route::prefix('rag')->group(function () {
    // More specific route first
    Route::get('/alljobs', [RagController::class, 'getJobs']);
    // Less specific route last (catches anything else)
    Route::get('/jobs/{profileId?}', [RagController::class, 'getAllJobs']);
});

/*
|--------------------------------------------------------------------------
| Protected Routes
|--------------------------------------------------------------------------
*/
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    // Profile
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/education', [ProfileController::class, 'addEducation']);
    Route::post('/profile/work-experience', [ProfileController::class, 'addWorkExperience']);
    Route::post('/profile/skills', [ProfileController::class, 'addSkills']);
    Route::delete('/profile/skills/{skillId}', [ProfileController::class, 'deleteSkill']);

    // Jobs
    Route::get('/jobs/{job}', [JobController::class, 'show']);
    Route::post('/jobs/{job}/apply', [JobController::class, 'apply']);
    Route::get('/jobs/applications/my', [JobController::class, 'myApplications']);
    Route::get('/jobs/recommended', [JobController::class, 'recommendedJobs']);
    
    // CV Routes
    Route::post('/user-cvs', [UserCvController::class, 'store']);
    Route::post('/profile/cv', [ProfileController::class, 'saveCv']);

    // Admin Routes
    Route::middleware(\App\Http\Middleware\AdminMiddleware::class)->prefix('admin')->group(function () {
        Route::get('/users', [AdminController::class, 'users']);
        Route::post('/users', [AdminController::class, 'addUser']);
        Route::delete('/users/{userID}', [AdminController::class, 'deleteUser']);
        Route::put('/users/{user}', [AdminController::class, 'updateUser']);
        Route::get('/companies', [AdminController::class, 'companies']);
        Route::get('/jobs', [AdminController::class, 'jobs']);
        Route::post('/jobs', [AdminController::class, 'createJob']);
        Route::put('/jobs/{job}', [AdminController::class, 'updateJob']);
        Route::delete('/jobs/{jobID}', [AdminController::class, 'deleteJob']);
        Route::post('/companies', [AdminController::class, 'createCompany']);
        Route::put('/companies/{company}', [AdminController::class, 'updateCompany']);
        Route::delete('/companies/{companyID}', [AdminController::class, 'deleteCompany']);
        Route::put('/jobs/{job}/status', [AdminController::class, 'updateJobStatus']);
        Route::put('/applications/{application}/status', [AdminController::class, 'updateApplicationStatus']);
    });
});

/*
|--------------------------------------------------------------------------
| User Skills Routes
|--------------------------------------------------------------------------
*/
Route::get('/users/{userId}/skills', [UserSkillController::class, 'index']);
Route::put('/profile/skills/{id}', [UserSkillController::class, 'update']);
Route::delete('/profile/skills/{id}', [UserSkillController::class, 'destroy']);

/*
|--------------------------------------------------------------------------
| Interview Routes
|--------------------------------------------------------------------------
*/
Route::post('/interviews/start', [InterviewController::class, 'start']);
Route::get('/interviews/{id}/next-question', [InterviewController::class, 'nextQuestion']);
Route::post('/interviews/{id}/finalize', [InterviewController::class, 'finalize']);
Route::get('/interviews/{id}/report', [InterviewController::class, 'show']);

// Real-time Interview
Route::post('/interviews/{id}/rt/start', [RealtimeInterviewController::class, 'start']);
Route::post('/interviews/{id}/rt/submit-answer', [RealtimeInterviewController::class, 'submitAnswer']);

// MUST BE LAST — avoid swallowing other routes
Route::get('/interviews/{id}', [InterviewController::class, 'show']);

/*
|--------------------------------------------------------------------------
| CV Generation Route
|--------------------------------------------------------------------------
*/
Route::post('/cv/generate', [CVController::class, 'generate']);






Route::post('/interviews/{id}/save-conversation', [InterviewController::class, 'saveConversation']);
Route::post('/interviews/{id}/save-video-frames', [InterviewController::class, 'saveVideoFrames']);
Route::post('/interviews/{id}/analyze', [InterviewController::class, 'analyzeInterview']);