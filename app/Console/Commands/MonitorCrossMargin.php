<?php

namespace App\Console\Commands;

use App\Services\CrossMarginLiveMonitor;
use Illuminate\Console\Command;

class MonitorCrossMargin extends Command
{
    protected $signature = 'cross-margin:monitor {--once : Run a single polling cycle} {--force : Run even when disabled}';
    protected $description = 'Monitor open BacktradeLab Cross Margin portfolios and liquidate on maintenance breach';

    public function handle(CrossMarginLiveMonitor $monitor): int
    {
        if (!config('cross-margin.enabled') && !$this->option('force')) {
            $this->warn('Cross Margin monitoring is disabled. Set CROSS_MARGIN_MONITOR_ENABLED=true or pass --force.');
            return self::SUCCESS;
        }

        do {
            $result = $monitor->runOnce();
            if ($result['liquidations'] > 0) {
                $this->info("Liquidated {$result['liquidations']} Cross portfolio(s) this cycle.");
            }
            if ($this->option('once')) break;
            sleep((int) config('cross-margin.poll_seconds', 5));
        } while (true);

        return self::SUCCESS;
    }
}
