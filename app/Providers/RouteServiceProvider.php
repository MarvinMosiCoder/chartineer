<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

class RouteServiceProvider extends ServiceProvider
{
    /**
     * The path to your application's "home" route.
     *
     * Typically, users are redirected here after authentication.
     *
     * @var string
     */
    public const HOME = '/home';

    /**
     * Define your route model bindings, pattern filters, and other route configuration.
     */
    public function boot(): void
    {
        foreach (['memecoin-search' => 20, 'memecoin-analyze' => 6, 'memecoin-watch' => 2] as $name => $maximum) {
            RateLimiter::for($name, fn (Request $request) => Limit::perMinute($maximum)->by($name.':'.($request->user()?->id ?: $request->ip())));
        }
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by(optional($request->user())->id ?: $request->ip());
        });

        RateLimiter::for('market-symbol-options', function (Request $request) {
            return Limit::perMinute(6)->by(optional($request->user())->id ?: $request->ip());
        });

        RateLimiter::for('market-klines', function (Request $request) {
            $fresh = $request->boolean('fresh');
            // 'history' (symbol/timeframe/category switches, entering Replay) was
            // 10/min — tight enough that scanning a normal-sized watchlist within
            // a minute routinely tripped it. Raised to match the 'fresh' live-tick
            // ceiling: actual abuse protection against hammering exchange APIs
            // lives one layer down in ExchangeMarketDataGateway (per-exchange
            // budgets, cooldowns, 429/418 backoff), so this per-user limiter no
            // longer needs to be the tightest layer.
            $limit = 30;
            $identity = optional($request->user())->id ?: $request->ip();
            return Limit::perMinute($limit)->by($identity.($fresh ? ':fresh' : ':history'));
        });

        RateLimiter::for('featured-coins', function (Request $request) {
            return Limit::perMinute(30)->by('featured-coins:'.$request->ip());
        });

        RateLimiter::for('market-write', function (Request $request) {
            return Limit::perMinute(15)->by(optional($request->user())->id ?: $request->ip());
        });

        RateLimiter::for('price-alert-write', function (Request $request) {
            return Limit::perMinute(30)->by(optional($request->user())->id ?: $request->ip());
        });

        RateLimiter::for('price-alert-check', function (Request $request) {
            return Limit::perMinute(60)->by(optional($request->user())->id ?: $request->ip());
        });

        RateLimiter::for('backtest-read', function (Request $request) {
            return Limit::perMinute(180)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('backtest-write', function (Request $request) {
            return Limit::perMinute(90)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('backtest-heavy', function (Request $request) {
            return Limit::perMinute(12)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('feedback-write', function (Request $request) {
            return Limit::perMinute(6)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('mentor-review-public', function (Request $request) {
            return Limit::perMinute(20)->by($request->ip());
        });

        RateLimiter::for('login', function (Request $request) {
            $ip = $request->ip();
            $identity = Str::lower(trim((string) $request->input('email')));
            $response = fn (Request $request, array $headers) => back()
                ->withErrors(['message' => 'Too many sign-in attempts. Please wait a minute and try again.'])
                ->withHeaders($headers);

            return [
                Limit::perMinute(5)
                    ->by('login-identity:'.sha1($identity.'|'.$ip))
                    ->response($response),
                Limit::perMinute(30)
                    ->by('login-ip:'.$ip)
                    ->response($response),
            ];
        });

        RateLimiter::for('login-email-check', function (Request $request) {
            $ip = $request->ip();
            $identity = Str::lower(trim((string) $request->input('email')));
            $response = fn (Request $request, array $headers) => response()->json([
                'message' => 'Too many email checks. Please wait a minute and try again.',
            ], 429)->withHeaders($headers);

            return [
                Limit::perMinute(10)
                    ->by('login-email-check-identity:'.sha1($identity.'|'.$ip))
                    ->response($response),
                Limit::perMinute(60)
                    ->by('login-email-check-ip:'.$ip)
                    ->response($response),
            ];
        });

        RateLimiter::for('password-reset-request', function (Request $request) {
            $ip = $request->ip();
            $identity = Str::lower(trim((string) $request->input('email')));
            $response = fn (Request $request, array $headers) => back()
                ->withErrors(['email' => 'Too many password-reset requests. Please try again later.'])
                ->withHeaders($headers);

            return [
                Limit::perMinute(3)
                    ->by('password-reset-identity:'.sha1($identity.'|'.$ip))
                    ->response($response),
                Limit::perHour(10)
                    ->by('password-reset-ip:'.$ip)
                    ->response($response),
            ];
        });

        RateLimiter::for('password-reset-confirm', function (Request $request) {
            return Limit::perMinute(10)
                ->by('password-reset-confirm:'.$request->ip());
        });

        RateLimiter::for('social-login', function (Request $request) {
            return Limit::perMinute(20)
                ->by('social-login:'.$request->ip());
        });

        RateLimiter::for('social-callback', function (Request $request) {
            return Limit::perMinute(60)
                ->by('social-callback:'.$request->ip());
        });

        $this->routes(function () {
            Route::middleware('api')
                ->prefix('api')
                ->group(base_path('routes/api.php'));

            Route::middleware('web')
                ->group(base_path('routes/web.php'));
        });
    }
}
