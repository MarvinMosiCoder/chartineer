<?php

namespace App\Providers;

use App\Services\Auth\AppleProvider;
use Illuminate\Support\ServiceProvider;
use Laravel\Socialite\Facades\Socialite;

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
        Socialite::extend('apple', fn ($app) => new AppleProvider(
            $app->make('request'),
            config('services.apple.client_id'),
            config('services.apple.client_secret'),
            config('services.apple.redirect'),
        ));

        if (
            app()->environment('production')
            && config('market-data.require_redis_in_production', true)
            && config('cache.default') !== 'redis'
        ) {
            throw new \RuntimeException('Production market-data locks and rate limits require CACHE_DRIVER=redis.');
        }
        //
    }
}
