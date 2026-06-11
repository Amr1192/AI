<?php

namespace App\Providers;

use App\Models\Job;
use App\Models\Profile;
use App\Observers\JobObserver;
use App\Observers\ProfileObserver;
use App\Support\HttpClientOptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\ServiceProvider;

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
    public function boot(): void
    {
        $sslOptions = HttpClientOptions::guzzle();
        if ($sslOptions !== []) {
            Http::globalOptions($sslOptions);
        }

        Job::observe(JobObserver::class);
        Profile::observe(ProfileObserver::class);
    }
}
