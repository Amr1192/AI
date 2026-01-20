<?php

namespace App\Observers;

use App\Models\Job;
use App\Services\JobEmbeddingService;

class JobObserver
{
    protected $jobEmbeddingService;

    public function __construct(JobEmbeddingService $jobEmbeddingService)
    {
        $this->jobEmbeddingService = $jobEmbeddingService;
    }

    /**
     * Handle the Job "created" event.
     */
    public function created(Job $job): void
    {
        // Generate embedding asynchronously after job creation
        dispatch(function () use ($job) {
            $this->jobEmbeddingService->generateEmbedding($job);
        })->afterResponse();
    }

    /**
     * Handle the Job "updated" event.
     */
    public function updated(Job $job): void
    {
        // Check if relevant fields changed
        $relevantFields = ['title', 'description', 'requirements', 'location', 'type'];
        $dirty = $job->getDirty();
        
        $shouldUpdate = false;
        foreach ($relevantFields as $field) {
            if (array_key_exists($field, $dirty)) {
                $shouldUpdate = true;
                break;
            }
        }

        if ($shouldUpdate) {
            // Update embedding asynchronously
            dispatch(function () use ($job) {
                $this->jobEmbeddingService->updateEmbedding($job);
            })->afterResponse();
        }
    }

    /**
     * Handle the Job "deleted" event.
     */
    public function deleted(Job $job): void
    {
        // Embedding will be deleted with the job (no action needed)
    }
}
