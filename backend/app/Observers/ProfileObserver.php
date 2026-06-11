<?php

namespace App\Observers;

use App\Models\Profile;
use App\Services\ProfileEmbeddingService;
use Illuminate\Support\Facades\Log;

class ProfileObserver
{
    public function __construct(
        protected ProfileEmbeddingService $profileEmbeddingService
    ) {}

    public function created(Profile $profile): void
    {
        $this->refreshEmbedding($profile);
    }

    public function updated(Profile $profile): void
    {
        $this->refreshEmbedding($profile);
    }

    protected function refreshEmbedding(Profile $profile): void
    {
        try {
            $profile->loadMissing('user');
            if ($profile->user) {
                $this->profileEmbeddingService->updateEmbedding($profile->user);
            }
        } catch (\Throwable $e) {
            Log::warning("Profile embedding refresh failed for user {$profile->user_id}: {$e->getMessage()}");
        }
    }
}
