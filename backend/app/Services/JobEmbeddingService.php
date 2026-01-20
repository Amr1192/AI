<?php

namespace App\Services;

use App\Models\Job;
use Illuminate\Support\Facades\Log;

class JobEmbeddingService
{
    protected $embeddingService;

    public function __construct(EmbeddingService $embeddingService)
    {
        $this->embeddingService = $embeddingService;
    }

    /**
     * Prepare job text for embedding
     *
     * @param Job $job
     * @return string
     */
    public function prepareJobText(Job $job): string
    {
        $company = $job->company;
        
        $text = "Job Title: {$job->title}\n";
        $text .= "Company: {$company->name}\n";
        $text .= "Location: {$job->location}\n";
        $text .= "Job Type: {$job->type}\n";
        $text .= "Description: {$job->description}\n";
        $text .= "Requirements: {$job->requirements}\n";
        
        if ($job->salary_from && $job->salary_to) {
            $text .= "Salary Range: {$job->salary_from} - {$job->salary_to}\n";
        }
        
        if ($company->description) {
            $text .= "Company Description: {$company->description}\n";
        }

        return $text;
    }

    /**
     * Generate and store embedding for a job
     *
     * @param Job $job
     * @return bool
     */
    public function generateEmbedding(Job $job): bool
    {
        try {
            $text = $this->prepareJobText($job);
            $embedding = $this->embeddingService->generateEmbedding($text);

            if (!$embedding) {
                return false;
            }

            $job->embedding = json_encode($embedding);
            $job->embedding_text = $text;
            $job->embedding_generated_at = now();
            $job->save();

            return true;
        } catch (\Exception $e) {
            Log::error('Error generating job embedding: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Generate embeddings for all jobs that don't have one
     *
     * @return int Number of jobs processed
     */
    public function generateAllEmbeddings(): int
    {
        $jobs = Job::with('company')
            ->whereNull('embedding')
            ->orWhere('embedding_generated_at', '<', now()->subDays(30)) // Regenerate old embeddings
            ->get();

        $count = 0;
        foreach ($jobs as $job) {
            if ($this->generateEmbedding($job)) {
                $count++;
            }
            
            // Rate limiting - sleep for 1 second between requests to avoid API limits
            sleep(1);
        }

        return $count;
    }

    /**
     * Update embedding when job is modified
     *
     * @param Job $job
     * @return bool
     */
    public function updateEmbedding(Job $job): bool
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

        if ($shouldUpdate || !$job->embedding) {
            return $this->generateEmbedding($job);
        }

        return true;
    }
}
