<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use App\Models\Job;
use App\Observers\JobObserver;
use App\Models\Profile;
use App\Observers\ProfileObserver;
class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot()
{
    Job::observe(JobObserver::class);
    Profile::observe(ProfileObserver::class);
}
}
