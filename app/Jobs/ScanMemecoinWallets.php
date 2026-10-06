<?php

namespace App\Jobs;

use App\Models\AdmUser;
use App\Services\Memecoin\WalletWatcher;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Throwable;

class ScanMemecoinWallets implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 85;
    public int $tries = 1;

    public function __construct(public readonly int $userId)
    {
        $this->onQueue('memecoin');
    }

    public function handle(WalletWatcher $watcher): void
    {
        try {
            $user = AdmUser::find($this->userId);
            if ($user && in_array(strtoupper((string) $user->status), ['ACTIVE', '1'], true)) $watcher->run($this->userId);
        } finally {
            Cache::forget('memecoin:queued:'.$this->userId);
        }
    }

    public function failed(?Throwable $error): void
    {
        Cache::forget('memecoin:queued:'.$this->userId);
        Cache::put('memecoin:watch-result:'.$this->userId, ['wallets_checked' => 0, 'new_alerts' => 0, 'errors' => ['scan' => 'Scan failed. Try again. Checkpoints were retained.']], 3600);
    }
}
