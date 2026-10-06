<?php

namespace App\Console\Commands;

use App\Jobs\ScanMemecoinWallets;
use App\Models\MemecoinWallet;
use App\Services\Memecoin\WalletWatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Throwable;

class WatchMemecoinWallets extends Command
{
    protected $signature = 'memecoin:watch {--user= : Scan one user immediately}';
    protected $description = 'Queue watched-wallet scans, or scan one user immediately';

    public function handle(WalletWatcher $watcher): int
    {
        if ($id = $this->option('user')) {
            $this->line(json_encode($watcher->run((int) $id), JSON_PRETTY_PRINT));
            return self::SUCCESS;
        }
        $connection = config('queue.default') === 'sync' ? 'database' : config('queue.default');
        foreach (MemecoinWallet::whereIn('list', ['watch', 'good_dev'])->select('adm_user_id')->distinct()->cursor() as $wallet) {
            if (!Cache::add('memecoin:queued:'.$wallet->adm_user_id, true, 600)) continue;
            try {
                ScanMemecoinWallets::dispatch($wallet->adm_user_id)->onConnection($connection);
            } catch (Throwable $error) {
                Cache::forget('memecoin:queued:'.$wallet->adm_user_id);
                throw $error;
            }
        }
        $this->info('Wallet scans queued.');
        return self::SUCCESS;
    }
}
