<?php

namespace App\Console\Commands;

use App\Models\AdmModels\AdmNotifications;
use App\Services\BacktestTradeNotificationService;
use Illuminate\Console\Command;

/**
 * Backtest trade notifications are generated per fill and per close, so a
 * heavy Replay session can write far more rows than the account/system
 * messages this table was originally sized for. This bounds that growth.
 *
 * Only the trade source types are pruned — system notifications and
 * announcements are never touched, at any age.
 */
class PruneTradeNotifications extends Command
{
    protected $signature = 'notifications:prune-trades {--days=30 : Delete trade notifications older than this many days}';

    protected $description = 'Delete backtest trade notifications older than the retention window';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $cutoff = now()->subDays($days);

        // Deleted in chunks rather than one statement: a long-running session
        // can accumulate a lot of rows, and an unbounded DELETE holds locks on
        // a table the notification feed reads on every page load.
        $total = 0;
        do {
            $deleted = AdmNotifications::query()
                ->whereIn('source_type', BacktestTradeNotificationService::TRADE_SOURCE_TYPES)
                ->where('created_at', '<', $cutoff)
                ->limit(1000)
                ->delete();

            $total += $deleted;
        } while ($deleted > 0);

        $this->info("Pruned {$total} trade notification(s) older than {$days} day(s).");

        return self::SUCCESS;
    }
}
