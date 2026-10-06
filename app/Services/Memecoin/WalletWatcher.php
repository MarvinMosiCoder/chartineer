<?php

namespace App\Services\Memecoin;

use App\Models\MemecoinAlert;
use App\Models\MemecoinWallet;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class WalletWatcher
{
    private const QUOTES = ['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'];

    public function telegramEnabled(int $userId): bool
    {
        return (int) config('memecoin.telegram_user_id') === $userId && config('memecoin.telegram_bot_token') && config('memecoin.telegram_chat_id');
    }

    private function rpc(string $method, array $params): mixed
    {
        $response = Http::timeout(12)->connectTimeout(4)->post(config('memecoin.solana_rpc_url'), ['jsonrpc' => '2.0', 'id' => 1, 'method' => $method, 'params' => $params]);
        if (!$response->successful() || !is_array($response->json()) || $response->json('error') || !array_key_exists('result', $response->json())) {
            throw new RuntimeException('Solana RPC is unavailable or rate limited. The wallet checkpoint was retained.');
        }

        return $response->json('result');
    }

    /** Aggregate all token accounts per mint. Token gains are not proof of a buy. */
    public function tokenGains(array $transaction, string $owner): array
    {
        if (data_get($transaction, 'meta.err') !== null) return [];
        $balances = [];
        foreach (['preTokenBalances' => -1, 'postTokenBalances' => 1] as $key => $sign) {
            foreach (data_get($transaction, 'meta.'.$key, []) ?? [] as $balance) {
                if (($balance['owner'] ?? null) !== $owner || in_array($balance['mint'] ?? '', self::QUOTES, true)) continue;
                $mint = $balance['mint'] ?? '';
                if (!preg_match(Chains::SOLANA, $mint)) continue;
                $amount = Analyzer::number(data_get($balance, 'uiTokenAmount.uiAmountString'));
                if ($amount === null) continue;
                $balances[$mint] = ($balances[$mint] ?? 0) + $sign * $amount;
            }
        }

        return array_filter($balances, fn ($v) => $v > 0 && is_finite($v));
    }

    public function run(int $userId): array
    {
        $result = ['wallets_checked' => 0, 'new_alerts' => 0, 'errors' => []];
        $deadline = microtime(true) + 45;
        // Oldest check first: large lists eventually rotate through every wallet.
        $wallets = MemecoinWallet::where('adm_user_id', $userId)->whereIn('list', ['watch', 'good_dev'])->orderBy('last_checked_at')->orderBy('id')->limit(config('memecoin.watch_batch_size', 10))->get();
        foreach ($wallets as $wallet) {
            if (microtime(true) >= $deadline) break;
            if (!preg_match(Chains::SOLANA, $wallet->address)) {
                $result['errors'][$wallet->address] = 'EVM wallets are not watched yet; only Solana wallets are scanned.';
                $wallet->update(['last_checked_at' => CarbonImmutable::now('UTC')]);
                continue;
            }
            $lock = Cache::lock('memecoin:wallet-scan:'.$wallet->id, 180);
            if (!$lock->get()) continue;
            $result['wallets_checked']++;
            try {
                $wallet->refresh();
                $options = ['limit' => 1000, 'commitment' => 'confirmed'];
                if ($wallet->last_signature) $options['until'] = $wallet->last_signature;
                $entries = $this->rpc('getSignaturesForAddress', [$wallet->address, $options]);
                if (!is_array($entries)) throw new RuntimeException('The RPC returned an invalid signature list.');
                if (!$wallet->last_signature) {
                    $wallet->update(['last_signature' => $entries[0]['signature'] ?? null, 'last_checked_at' => CarbonImmutable::now('UTC')]);
                    continue;
                }
                // Do not skip a truncated backlog by advancing to a recent page.
                $pages = 1;
                $page = $entries;
                while (count($page) === 1000 && $pages < 5 && microtime(true) < $deadline - 12) {
                    $options['before'] = end($page)['signature'];
                    $page = $this->rpc('getSignaturesForAddress', [$wallet->address, $options]);
                    if (!is_array($page)) throw new RuntimeException('The RPC returned an invalid signature list.');
                    $entries = array_merge($entries, $page);
                    $pages++;
                }
                if (count($page) === 1000) throw new RuntimeException('Backlog exceeds the bounded scan window. Check more frequently or use an indexed RPC. Checkpoint retained.');
                $pending = array_reverse($entries);
                $batch = array_slice($pending, 0, 20);
                $processed = 0;
                foreach ($batch as $entry) {
                    if (microtime(true) >= $deadline - 12) break;
                    $tx = empty($entry['err']) ? $this->rpc('getTransaction', [$entry['signature'], ['encoding' => 'jsonParsed', 'maxSupportedTransactionVersion' => 1, 'commitment' => 'confirmed']]) : [];
                    if ($tx === null) throw new RuntimeException('A transaction is not available yet. The scan will retry it.');
                    $new = DB::transaction(function () use ($wallet, $entry, $tx) {
                        $current = MemecoinWallet::where('adm_user_id', $wallet->adm_user_id)->lockForUpdate()->find($wallet->id);
                        if (!$current) return [];
                        $alerts = [];
                        foreach ($this->tokenGains($tx, $wallet->address) as $mint => $amount) {
                            $event = hash('sha256', $wallet->address.':'.$entry['signature'].':'.$mint);
                            $alert = MemecoinAlert::firstOrCreate(['adm_user_id' => $wallet->adm_user_id, 'event_hash' => $event], [
                                'wallet_address' => $wallet->address, 'wallet_list' => $wallet->list, 'wallet_label' => $wallet->label,
                                'mint' => $mint, 'amount' => $amount, 'signature' => $entry['signature'],
                                'block_time' => !empty($tx['blockTime']) ? CarbonImmutable::createFromTimestampUTC($tx['blockTime']) : null, 'seen' => false,
                            ]);
                            if ($alert->wasRecentlyCreated) $alerts[] = $alert;
                        }
                        $current->update(['last_signature' => $entry['signature'], 'last_checked_at' => CarbonImmutable::now('UTC')]);
                        return $alerts;
                    });
                    $result['new_alerts'] += count($new);
                    if ($this->telegramEnabled($userId)) {
                        foreach ($new as $alert) {
                            try {
                                $response = Http::timeout(8)->post('https://api.telegram.org/bot'.config('memecoin.telegram_bot_token').'/sendMessage', ['chat_id' => config('memecoin.telegram_chat_id'), 'text' => ($wallet->label ?: 'Watched wallet').' gained '.$alert->amount.' tokens: '.$alert->mint."\nhttps://dexscreener.com/solana/".$alert->mint, 'disable_web_page_preview' => true]);
                                if (!$response->successful() || !$response->json('ok')) $result['errors']['telegram'] = 'Telegram delivery failed; alerts remain available here.';
                            } catch (Throwable $error) {
                                $result['errors']['telegram'] = 'Telegram delivery failed; alerts remain available here.';
                            }
                        }
                    }
                    $processed++;
                    usleep(350000);
                }
                if (count($pending) > $processed) $result['errors'][$wallet->address] = (count($pending) - $processed).' newer transactions wait for the next scan.';
                $wallet->refresh()->update(['last_checked_at' => CarbonImmutable::now('UTC')]);
            } catch (Throwable $error) {
                $result['errors'][$wallet->address] = $error instanceof RuntimeException ? $error->getMessage() : 'Scan failed. Unprocessed transactions will be retried.';
                // Rotate failures too so an unavailable wallet cannot starve the list.
                MemecoinWallet::whereKey($wallet->id)->update(['last_checked_at' => CarbonImmutable::now('UTC')]);
            } finally {
                $lock->release();
            }
        }
        $result['errors'] = (object) $result['errors'];
        Cache::put('memecoin:watch-result:'.$userId, $result, 3600);

        return $result;
    }
}
