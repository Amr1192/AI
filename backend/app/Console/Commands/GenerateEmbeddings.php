<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\JobEmbeddingService;
use App\Services\ProfileEmbeddingService;

class GenerateEmbeddings extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'embeddings:generate 
                            {type=all : Type of embeddings to generate (jobs, profiles, all)}
                            {--force : Skip validation and generate embeddings for all profiles}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Generate embeddings for jobs and/or profiles using OpenAI';

    protected $jobEmbeddingService;
    protected $profileEmbeddingService;

    /**
     * Create a new command instance.
     */
    public function __construct(
        JobEmbeddingService $jobEmbeddingService,
        ProfileEmbeddingService $profileEmbeddingService
    ) {
        parent::__construct();
        $this->jobEmbeddingService = $jobEmbeddingService;
        $this->profileEmbeddingService = $profileEmbeddingService;
    }

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $type = $this->argument('type');
        $force = $this->option('force');

        // Validate type
        if (!in_array($type, ['jobs', 'profiles', 'all'])) {
            $this->error('❌ Invalid type. Use: jobs, profiles, or all');
            return 1;
        }

        $this->info('🚀 Starting embedding generation...');
        
        if ($force) {
            $this->warn('⚠️  Force mode enabled - skipping profile validation');
        }

        // Generate job embeddings
        if ($type === 'jobs' || $type === 'all') {
            $this->newLine();
            $this->info('📋 Generating embeddings for jobs...');
            
            try {
                $count = $this->jobEmbeddingService->generateAllEmbeddings();
                
                if ($count > 0) {
                    $this->info("✅ Generated embeddings for {$count} jobs");
                } else {
                    $this->warn("⚠️  No jobs found to generate embeddings");
                    $this->line("   Possible reasons:");
                    $this->line("   - All jobs already have embeddings");
                    $this->line("   - No active jobs in database");
                    $this->line("   - Jobs don't meet minimum requirements");
                }
            } catch (\Exception $e) {
                $this->error("❌ Error generating job embeddings: " . $e->getMessage());
                $this->line("   Check storage/logs/laravel.log for details");
                return 1;
            }
        }

        // Generate profile embeddings
        if ($type === 'profiles' || $type === 'all') {
            $this->newLine();
            $this->info('👤 Generating embeddings for profiles...');
            
            try {
                $count = $this->profileEmbeddingService->generateAllEmbeddings($force);
                
                if ($count > 0) {
                    $this->info("✅ Generated embeddings for {$count} profiles");
                } else {
                    $this->warn("⚠️  No profiles found to generate embeddings");
                    $this->line("   Possible reasons:");
                    $this->line("   - All profiles already have embeddings");
                    $this->line("   - No profiles in database");
                    $this->line("   - Profiles don't meet minimum requirements");
                    
                    if (!$force) {
                        $this->newLine();
                        $this->comment("💡 Try running with --force flag:");
                        $this->line("   php artisan embeddings:generate profiles --force");
                    }
                }
            } catch (\Exception $e) {
                $this->error("❌ Error generating profile embeddings: " . $e->getMessage());
                $this->line("   Check storage/logs/laravel.log for details");
                return 1;
            }
        }

        $this->newLine();
        $this->info('🎉 Embedding generation completed!');
        
        return 0;
    }
}
