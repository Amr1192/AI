<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\User;
use App\Models\Job;

class CheckEmbeddings extends Command
{
    protected $signature = 'embeddings:check';
    protected $description = 'Check embedding status for users and jobs';

    public function handle()
    {
        $this->info('📊 Checking Embeddings Status...');
        $this->newLine();

        // Users
        $this->info('👤 Users:');
        $users = User::with('profile', 'skills')->get();
        
        foreach ($users as $user) {
            $hasProfile = $user->profile ? '✓' : '✗';
            $hasEmbedding = $user->profile?->embedding ? '✓' : '✗';
            $skillsCount = $user->skills->count();
            
            $this->line("  {$user->name} ({$user->email})");
            $this->line("    Profile: {$hasProfile} | Embedding: {$hasEmbedding} | Skills: {$skillsCount}");
        }

        $this->newLine();

        // Jobs
        $this->info('💼 Jobs:');
        $jobs = Job::with('company')->get();
        
        foreach ($jobs as $job) {
            $hasEmbedding = $job->embedding ? '✓' : '✗';
            $this->line("  {$job->title} - {$job->company->name}");
            $this->line("    Embedding: {$hasEmbedding}");
        }

        $this->newLine();
        
        // Summary
        $usersWithEmbedding = User::whereHas('profile', fn($q) => $q->whereNotNull('embedding'))->count();
        $totalUsers = User::count();
        $jobsWithEmbedding = Job::whereNotNull('embedding')->count();
        $totalJobs = Job::count();
        
        $this->info("📈 Summary:");
        $this->line("  Users with embeddings: {$usersWithEmbedding}/{$totalUsers}");
        $this->line("  Jobs with embeddings: {$jobsWithEmbedding}/{$totalJobs}");

        return 0;
    }
}
