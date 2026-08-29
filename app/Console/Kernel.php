<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        $schedule->command('inspire')->hourly();
        $schedule->call('\App\Http\Controllers\PullErpController@getListOfOrdersFromErpv1')->everyMinute();
        $schedule->command('mysql:backup')->daily()->at('06:00');
        $schedule->command('payments:reconcile-paymongo --limit=50')->everyFiveMinutes()->withoutOverlapping();
        $schedule->command('subscriptions:send-renewal-reminders')->dailyAt('09:00')->withoutOverlapping();
        $schedule->command('notifications:prune-trades')->dailyAt('04:00')->withoutOverlapping();
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
