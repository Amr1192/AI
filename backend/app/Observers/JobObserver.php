<?php

namespace App\Observers;

use App\Models\Job;
use App\Services\JobEmbeddingService;
use Illuminate\Support\Facades\Log;

class JobObserver
{
    public function __construct(
        protected JobEmbeddingService $jobEmbeddingService
    ) {}

    public function created(Job $job): void
    {
        $this->refreshEmbedding($job);
    }

    public function updated(Job $job): void
    {
        $relevantFields = ['title', 'description', 'requirements', 'location', 'type', 'salary_from', 'salary_to'];
        $dirty = $job->getDirty();

        $shouldUpdate = !$job->embedding;
        foreach ($relevantFields as $field) {
            if (array_key_exists($field, $dirty)) {
                $shouldUpdate = true;
                break;
            }
        }

        if ($shouldUpdate) {
            $this->refreshEmbedding($job);
        }
    }

    protected function refreshEmbedding(Job $job): void
    {
        try {
            $job->loadMissing('company');
            $this->jobEmbeddingService->generateEmbedding($job);
        } catch (\Throwable $e) {
            Log::warning("Job embedding refresh failed for job {$job->id}: {$e->getMessage()}");
        }
    }
}
