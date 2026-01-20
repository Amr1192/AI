<?php

namespace App\Observers;

use App\Models\Profile;
use App\Services\ProfileEmbeddingService;

class ProfileObserver
{
    protected $profileEmbeddingService;

    public function __construct(ProfileEmbeddingService $profileEmbeddingService)
    {
        $this->profileEmbeddingService = $profileEmbeddingService;
    }

    /**
     * Handle the Profile "created" event.
     */
    public function created(Profile $profile): void
    {
        // Generate embedding asynchronously after profile creation
        dispatch(function () use ($profile) {
            $this->profileEmbeddingService->generateEmbedding($profile->user);
        })->afterResponse();
    }

    /**
     * Handle the Profile "updated" event.
     */
    public function updated(Profile $profile): void
    {
        // Update embedding asynchronously when profile is updated
        dispatch(function () use ($profile) {
            $this->profileEmbeddingService->updateEmbedding($profile->user);
        })->afterResponse();
    }

    /**
     * Handle the Profile "deleted" event.
     */
    public function deleted(Profile $profile): void
    {
        // Embedding will be deleted with the profile (no action needed)
    }
}
