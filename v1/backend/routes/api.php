<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Http;

// Controllers
use App\Http\Controllers\API\AdminController;
use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\JobController;
use App\Http\Controllers\API\ProfileController;
use App\Http\Controllers\InterviewController;
use App\Http\Controllers\RealtimeInterviewController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| These routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

// ✅ Quick test for OpenAI connectivity
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

/*
|--------------------------------------------------------------------------
| Interview Routes
|--------------------------------------------------------------------------
|
| These routes power both the non-live (upload/analyze) and
| real-time interview practice flows used by your Next.js frontend.
|
*/

// 🎥 Standard Interview Flow
Route::post('/interviews/start',   [InterviewController::class, 'start']);     // create interview
Route::post('/interviews/upload',  [InterviewController::class, 'upload']);    // upload audio/video
Route::post('/interviews/analyze', [InterviewController::class, 'analyze']);   // transcribe + analyze
Route::get ('/interviews/{id}',    [InterviewController::class, 'show']);      // show result

// ⚡ Real-Time (SSE) Flow — matches your React frontend URLs
Route::prefix('interviews/{id}/rt')->group(function () {
    Route::post('/start',  [RealtimeInterviewController::class, 'start']);     // start session
    Route::post('/chunk',  [RealtimeInterviewController::class, 'chunk']);     // send audio chunks
    Route::post('/stop',   [RealtimeInterviewController::class, 'stop']);      // stop session
    Route::get ('/stream/{sessionId}', [RealtimeInterviewController::class, 'stream']); // SSE stream
});

/*
|--------------------------------------------------------------------------
| Authentication Routes
|--------------------------------------------------------------------------
*/

// Public
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login',    [AuthController::class, 'login']);

// Protected
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user',    [AuthController::class, 'user']);

    // Profile
    Route::get ('/profile',                 [ProfileController::class, 'show']);
    Route::put ('/profile',                 [ProfileController::class, 'update']);
    Route::post('/profile/education',       [ProfileController::class, 'addEducation']);
    Route::post('/profile/work-experience', [ProfileController::class, 'addWorkExperience']);
    Route::post('/profile/skills',          [ProfileController::class, 'addSkills']);

    // Jobs
    Route::get ('/jobs',                  [JobController::class, 'index']);
    Route::get ('/jobs/{job}',            [JobController::class, 'show']);
    Route::post('/jobs/{job}/apply',      [JobController::class, 'apply']);
    Route::get ('/jobs/applications/my',  [JobController::class, 'myApplications']);
    Route::get ('/jobs/recommended',      [JobController::class, 'recommendedJobs']);

    // Admin
    Route::middleware(\App\Http\Middleware\AdminMiddleware::class)
        ->prefix('admin')
        ->group(function () {
            Route::get ('/users',                        [AdminController::class, 'users']);
            Route::get ('/jobs',                         [AdminController::class, 'jobs']);
            Route::post('/jobs',                         [AdminController::class, 'createJob']);
            Route::post('/companies',                    [AdminController::class, 'createCompany']);
            Route::put ('/jobs/{job}/status',            [AdminController::class, 'updateJobStatus']);
            Route::put ('/applications/{application}/status', [AdminController::class, 'updateApplicationStatus']);
        });
});
