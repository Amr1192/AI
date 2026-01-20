<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\User;
use App\Services\ProfileEmbeddingService;

class ForceGenerateEmbeddings extends Command
{
    protected $signature = 'embeddings:force-generate';
    protected $description = 'Force generate embeddings for all users with profiles';

    public function handle(ProfileEmbeddingService $service)
    {
        $this->info('🚀 Force generating profile embeddings...');
        
        $users = User::whereHas('profile')->get();
        
        $count = 0;
        $failed = 0;
        
        foreach ($users as $user) {
            $this->line("Processing {$user->name}...");
            
            try {
                // Generate without any validation
                $profile = $user->profile;
                
                if (!$profile) {
                    $this->warn("  ✗ No profile");
                    continue;
                }
                
                $text = $service->prepareProfileText($user);
                
                if (empty(trim($text))) {
                    $this->warn("  ✗ Empty profile text");
                    continue;
                }
                
                $embeddingService = app(\App\Services\EmbeddingService::class);
                $embedding = $embeddingService->generateEmbedding($text);
                
                if (!$embedding) {
                    $this->error("  ✗ Failed to generate embedding");
                    $failed++;
                    continue;
                }
                
                $profile->embedding = json_encode($embedding);
                $profile->embedding_text = $text;
                $profile->embedding_generated_at = now();
                $profile->save();
                
                $this->info("  ✓ Success");
                $count++;
                
                sleep(1); // Rate limiting
                
            } catch (\Exception $e) {
                $this->error("  ✗ Error: " . $e->getMessage());
                $failed++;
            }
        }
        
        $this->newLine();
        $this->info("✅ Generated {$count} embeddings");
        
        if ($failed > 0) {
            $this->warn("⚠️  Failed: {$failed}");
        }
        
        return 0;
    }
}
