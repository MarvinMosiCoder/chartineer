<?php

namespace App\Services\Memecoin;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class Analyzer
{
    public function __construct(private readonly RiskRules $rules)
    {
    }

    public static function number(mixed $value): ?float
    {
        return is_numeric($value) && is_finite((float) $value) ? (float) $value : null;
    }

    private function json(mixed $response): array
    {
        if (!$response instanceof Response || !$response->successful() || !is_array($response->json())) {
            throw new RuntimeException($response instanceof Response ? 'Provider returned HTTP '.$response->status() : 'Provider could not be reached.');
        }

        return $response->json();
    }

    public function search(string $query, ?string $chain): array
    {
        $pairs = $this->json(Http::timeout(10)->connectTimeout(5)->get('https://api.dexscreener.com/latest/dex/search', ['q' => $query]))['pairs'] ?? [];

        return array_values(array_filter($this->groupTokens($pairs), fn ($t) => !$chain || $t['chain'] === $chain));
    }

    public function market(string $chain, string $address): ?array
    {
        $pairs = $this->json(Http::timeout(10)->connectTimeout(5)->get('https://api.dexscreener.com/token-pairs/v1/'.$chain.'/'.$address));

        return $this->tokenMarket($pairs, $chain, $address);
    }

    private function safeUrl(mixed $url): ?string
    {
        return is_string($url) && strlen($url) <= 2048 && filter_var($url, FILTER_VALIDATE_URL) && in_array(strtolower(parse_url($url, PHP_URL_SCHEME) ?? ''), ['https', 'http'], true) ? $url : null;
    }

    public function groupTokens(array $pairs): array
    {
        $tokens = [];
        foreach ($pairs as $pair) {
            $chain = $pair['chainId'] ?? '';
            $address = $pair['baseToken']['address'] ?? '';
            if (!is_string($address) || !isset(config('memecoin.chains')[$chain]) || !preg_match($chain === 'solana' ? Chains::SOLANA : Chains::EVM, $address)) {
                continue;
            }
            $pool = ['chain' => $chain, 'address' => Chains::normalize($address), 'dex' => $pair['dexId'] ?? null,
                'name' => $pair['baseToken']['name'] ?? null, 'symbol' => $pair['baseToken']['symbol'] ?? null,
                'pair_address' => $pair['pairAddress'] ?? null, 'url' => $this->safeUrl($pair['url'] ?? null),
                'age_hours' => self::number($pair['pairCreatedAt'] ?? null) === null ? null : max(0, (microtime(true) * 1000 - $pair['pairCreatedAt']) / 3600000),
                'websites' => [], 'socials' => [],
            ];
            foreach (['price_usd' => 'priceUsd', 'liquidity_usd' => 'liquidity.usd', 'volume_24h' => 'volume.h24', 'market_cap' => 'marketCap', 'fdv' => 'fdv', 'volume_1h' => 'volume.h1', 'volume_5m' => 'volume.m5', 'buys_5m' => 'txns.m5.buys', 'sells_5m' => 'txns.m5.sells', 'price_change_5m' => 'priceChange.m5', 'price_change_1h' => 'priceChange.h1', 'buys_24h' => 'txns.h24.buys', 'sells_24h' => 'txns.h24.sells'] as $key => $path) {
                $pool[$key] = self::number(data_get($pair, $path));
            }
            foreach (data_get($pair, 'info.websites', []) ?? [] as $site) {
                if ($url = $this->safeUrl($site['url'] ?? null)) {
                    $pool['websites'][] = $url;
                }
            }
            foreach (data_get($pair, 'info.socials', []) ?? [] as $social) {
                if ($url = $this->safeUrl($social['url'] ?? null)) {
                    $pool['socials'][] = ['type' => $social['type'] ?? null, 'url' => $url];
                }
            }
            $key = $chain.':'.$pool['address'];
            $old = $tokens[$key] ?? null;
            $selected = !$old || ($pool['liquidity_usd'] ?? 0) > ($old['liquidity_usd'] ?? 0) ? $pool : $old;
            $selected['pools'] = ($old['pools'] ?? 0) + 1;
            $selected['total_liquidity_usd'] = ($old['total_liquidity_usd'] ?? 0) + ($pool['liquidity_usd'] ?? 0);
            $selected['total_volume_24h'] = ($old['total_volume_24h'] ?? 0) + ($pool['volume_24h'] ?? 0);
            $selected['websites'] = array_values(array_unique(array_merge($old['websites'] ?? [], $pool['websites'])));
            $selected['socials'] = array_values(collect(array_merge($old['socials'] ?? [], $pool['socials']))->unique('url')->all());
            $tokens[$key] = $selected;
        }
        usort($tokens, fn ($a, $b) => $b['total_volume_24h'] <=> $a['total_volume_24h']);

        return array_values($tokens);
    }

    public function tokenMarket(array $pairs, string $chain, string $address): ?array
    {
        foreach ($this->groupTokens($pairs) as $token) {
            if ($token['chain'] === $chain && $token['address'] === Chains::normalize($address)) {
                return $token;
            }
        }

        return null;
    }

    public function analyze(string $chain, string $address, array $blacklist): array
    {
        // Cache public facts only. Each caller's private blacklist is evaluated afresh.
        $key = 'memecoin:sources:v1:'.hash('sha256', $chain.':'.$address);
        $report = Cache::get($key);
        if (!$report) {
            $network = config('memecoin.chains.'.$chain);
            $safetySource = $network['family'] === 'solana' ? 'rugcheck' : 'goplus';
            $responses = Http::pool(fn (Pool $pool) => [
                $pool->as('dexscreener')->timeout(10)->connectTimeout(5)->get('https://api.dexscreener.com/token-pairs/v1/'.$chain.'/'.$address),
                $pool->as($safetySource)->timeout(30)->connectTimeout(5)->get($safetySource === 'rugcheck' ? 'https://api.rugcheck.xyz/v1/tokens/'.$address.'/report' : 'https://api.gopluslabs.io/api/v1/token_security/'.$network['goplus_id'], $safetySource === 'goplus' ? ['contract_addresses' => $address] : []),
            ]);
            $report = ['chain' => $chain, 'address' => $address, 'checked_at' => CarbonImmutable::now('UTC')->toISOString(), 'market' => null, 'safety' => null, 'web' => null, 'errors' => []];
            foreach (['dexscreener', $safetySource] as $source) {
                try {
                    $raw = $this->json($responses[$source] ?? null);
                    if ($source === 'dexscreener') {
                        $report['market'] = $this->tokenMarket($raw, $chain, $address);
                    } elseif ($source === 'rugcheck') {
                        if (($raw['mint'] ?? null) !== $address || !is_array($raw['token'] ?? null)) {
                            throw new RuntimeException('RugCheck returned no matching token report.');
                        }
                        $report['safety'] = $this->solanaSafety($raw);
                    } else {
                        $record = $raw['result'][strtolower($address)] ?? null;
                        if (($raw['code'] ?? null) != 1 || !$record) {
                            throw new RuntimeException('GoPlus has no security data for this token or is rate limited.');
                        }
                        $report['safety'] = $this->evmSafety($record, $address);
                    }
                } catch (Throwable $error) {
                    $report['errors'][$source] = $error instanceof RuntimeException ? $error->getMessage() : 'Provider data could not be processed.';
                }
            }
            $report['web'] = $this->website($report['market'], $report['errors']);
            if (!$report['errors']) {
                Cache::put($key, $report, (int) config('memecoin.report_cache_seconds', 300));
            }
        }
        $report['assessment'] = $this->rules->assess($report['market'], $report['safety'], $report['web'], $blacklist, config('memecoin.chains.'.$chain.'.family'));

        return $report;
    }

    private function safetyDefaults(): array
    {
        $keys = 'mint name symbol mint_authority freeze_authority mutable_metadata transfer_fee_pct lp_locked_pct total_market_liquidity total_holders top10_pct top10_insiders creator creator_pct insiders_detected launchpad rugcheck_score creator_tokens linked_wallets_pct honeypot buy_tax_pct sell_tax_pct open_source proxy owner owner_renounced owner_can_mint owner_can_change_balances hidden_owner can_reclaim_ownership transfers_pausable can_blacklist creator_made_honeypots';

        return array_merge(array_fill_keys(explode(' ', $keys), null), ['rugged' => false, 'top_holders' => [], 'risks' => [], 'insider_networks' => []]);
    }

    public function solanaSafety(array $raw): array
    {
        $s = $this->safetyDefaults();
        foreach (['mint' => 'mint', 'name' => 'tokenMeta.name', 'symbol' => 'tokenMeta.symbol', 'mint_authority' => 'mintAuthority', 'freeze_authority' => 'freezeAuthority', 'mutable_metadata' => 'tokenMeta.mutable', 'transfer_fee_pct' => 'transferFee.pct', 'total_holders' => 'totalHolders', 'creator' => 'creator', 'insiders_detected' => 'graphInsidersDetected', 'launchpad' => 'launchpad.name', 'rugged' => 'rugged', 'rugcheck_score' => 'score_normalised'] as $key => $path) {
            $s[$key] = data_get($raw, $path, $s[$key]);
        }
        foreach ($raw['topHolders'] ?? [] as $holder) {
            $label = data_get($raw, 'knownAccounts.'.($holder['owner'] ?? '').'.type');
            if ($label === 'AMM') {
                continue;
            }
            $s['top_holders'][] = ['owner' => $holder['owner'] ?? null, 'pct' => self::number($holder['pct'] ?? null) ?? 0, 'insider' => (bool) ($holder['insider'] ?? false), 'label' => $label];
            if (count($s['top_holders']) === 10) {
                break;
            }
        }
        if (!empty($raw['topHolders'])) {
            $s['top10_pct'] = array_sum(array_column($s['top_holders'], 'pct'));
            $s['top10_insiders'] = count(array_filter($s['top_holders'], fn ($h) => $h['insider']));
        }
        $total = self::number($raw['totalMarketLiquidity'] ?? null);
        $s['total_market_liquidity'] = !empty($raw['markets']) ? $total : null;
        $s['lp_locked_pct'] = $total > 0 ? array_sum(array_map(fn ($pool) => self::number(data_get($pool, 'lp.lpLockedUSD')) ?? 0, $raw['markets'] ?? [])) / $total * 100 : null;
        $supply = self::number(data_get($raw, 'token.supply'));
        $balance = self::number($raw['creatorBalance'] ?? null);
        $s['creator_pct'] = $supply > 0 && $balance !== null ? $balance / $supply * 100 : null;
        if ($s['creator']) {
            $s['creator_tokens'] = [];
            foreach ($raw['creatorTokens'] ?? [] as $token) {
                if (!empty($token['mint']) && $token['mint'] !== $s['mint']) {
                    $s['creator_tokens'][] = ['mint' => $token['mint'], 'market_cap' => self::number($token['marketCap'] ?? null), 'created_at' => $token['createdAt'] ?? null];
                }
            }
        }
        foreach ($raw['insiderNetworks'] ?? [] as $net) {
            $holding = self::number($net['currentHolding'] ?? null);
            $s['insider_networks'][] = ['size' => $net['size'] ?? 0, 'pct' => $supply > 0 && $holding !== null ? $holding / $supply * 100 : null];
        }
        $s['linked_wallets_pct'] = $supply > 0 ? array_sum(array_column($s['insider_networks'], 'pct')) : null;
        $s['risks'] = array_map(fn ($r) => ['name' => $r['name'] ?? 'Unknown risk', 'level' => $r['level'] ?? null, 'description' => $r['description'] ?? null], $raw['risks'] ?? []);

        return $s;
    }

    public function evmSafety(array $raw, string $address): array
    {
        $s = $this->safetyDefaults();
        $flag = fn ($key) => !isset($raw[$key]) || $raw[$key] === '' ? null : (string) $raw[$key] === '1';
        $pct = fn ($v) => self::number($v) === null ? null : (float) $v * 100;
        $burn = ['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead'];
        $owner = $raw['owner_address'] ?? null;
        $renounced = $owner === null ? null : ($owner === '' || in_array(strtolower($owner), $burn, true));
        $reclaimable = $flag('can_take_back_ownership');
        $power = fn ($key) => $flag($key) === null || !$flag($key) ? $flag($key) : !($renounced && !$reclaimable);
        $pairs = array_map(fn ($d) => strtolower($d['pair'] ?? ''), $raw['dex'] ?? []);
        foreach ($raw['holders'] ?? [] as $h) {
            if (empty($h['address']) || in_array(strtolower($h['address']), array_merge($burn, $pairs), true)) {
                continue;
            }
            $s['top_holders'][] = ['owner' => strtolower($h['address']), 'pct' => $pct($h['percent'] ?? null) ?? 0, 'label' => $h['tag'] ?? null, 'insider' => false];
            if (count($s['top_holders']) === 10) {
                break;
            }
        }
        $s['top10_pct'] = !empty($raw['holders']) ? array_sum(array_column($s['top_holders'], 'pct')) : null;
        $s['lp_locked_pct'] = !empty($raw['lp_holders']) ? array_sum(array_map(fn ($h) => (string) ($h['is_locked'] ?? '') === '1' || in_array(strtolower($h['address'] ?? ''), $burn, true) ? ($pct($h['percent'] ?? null) ?? 0) : 0, $raw['lp_holders'])) : null;
        foreach (['honeypot' => 'is_honeypot', 'open_source' => 'is_open_source', 'proxy' => 'is_proxy', 'hidden_owner' => 'hidden_owner', 'creator_made_honeypots' => 'honeypot_with_same_creator'] as $key => $field) {
            $s[$key] = $flag($field);
        }
        if ($flag('cannot_sell_all')) {
            $s['honeypot'] = true;
        }
        foreach (['owner_can_mint' => 'is_mintable', 'owner_can_change_balances' => 'owner_change_balance', 'transfers_pausable' => 'transfer_pausable', 'can_blacklist' => 'is_blacklisted'] as $key => $field) {
            $s[$key] = $power($field);
        }
        $taxes = array_filter([$pct($raw['buy_tax'] ?? null), $pct($raw['sell_tax'] ?? null), $pct($raw['transfer_tax'] ?? null)], fn ($v) => $v !== null);
        return array_merge($s, ['mint' => strtolower($address), 'name' => $raw['token_name'] ?? null, 'symbol' => $raw['token_symbol'] ?? null,
            'owner' => $owner ? strtolower($owner) : null, 'owner_renounced' => $renounced, 'can_reclaim_ownership' => $reclaimable,
            'creator' => !empty($raw['creator_address']) ? strtolower($raw['creator_address']) : null, 'creator_pct' => $pct($raw['creator_percent'] ?? null),
            'total_holders' => self::number($raw['holder_count'] ?? null), 'buy_tax_pct' => $pct($raw['buy_tax'] ?? null), 'sell_tax_pct' => $pct($raw['sell_tax'] ?? null), 'transfer_fee_pct' => $taxes ? max($taxes) : null,
        ]);
    }

    private function website(?array $market, array &$errors): ?array
    {
        if ($market === null) {
            return null;
        }
        $web = ['website' => $market['websites'][0] ?? null, 'domain' => null, 'hosted' => false, 'domain_registered_at' => null, 'domain_age_days' => null, 'wayback_first_at' => null, 'wayback_error' => null];
        if (!$web['website']) {
            return $web;
        }
        $host = strtolower(parse_url($web['website'], PHP_URL_HOST) ?? '');
        $labels = explode('.', $host);
        if (count($labels) < 2 || filter_var($host, FILTER_VALIDATE_IP)) {
            return $web;
        }
        $count = strlen(end($labels)) === 2 && in_array($labels[count($labels) - 2], ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'], true) ? 3 : 2;
        $web['domain'] = implode('.', array_slice($labels, -$count));
        $web['hosted'] = in_array($web['domain'], ['x.com', 'twitter.com', 't.me', 'telegram.me', 'discord.gg', 'discord.com', 'linktr.ee', 'medium.com', 'github.io', 'github.com', 'gitbook.io', 'notion.site', 'vercel.app', 'netlify.app', 'carrd.co', 'wixsite.com', 'pump.fun', 'youtube.com', 'tiktok.com', 'instagram.com', 'facebook.com', 'google.com'], true);
        if ($web['hosted']) {
            return $web;
        }
        // Query registries and archive.org only; never fetch a token's arbitrary website.
        $responses = Http::pool(fn (Pool $pool) => [
            $pool->as('rdap')->timeout(8)->connectTimeout(4)->get('https://rdap.org/domain/'.rawurlencode($web['domain'])),
            $pool->as('wayback')->timeout(8)->connectTimeout(4)->get('https://archive.org/wayback/available', ['url' => $web['domain'], 'timestamp' => '19960101']),
        ]);
        try {
            $rdap = $this->json($responses['rdap'] ?? null);
            foreach ($rdap['events'] ?? [] as $event) {
                if (($event['eventAction'] ?? '') === 'registration' && !empty($event['eventDate'])) {
                    $registered = CarbonImmutable::parse($event['eventDate'])->utc();
                    $web['domain_registered_at'] = $registered->toISOString();
                    $web['domain_age_days'] = max(0, (CarbonImmutable::now('UTC')->getTimestamp() - $registered->getTimestamp()) / 86400);
                    break;
                }
            }
        } catch (Throwable $error) {
            $errors['rdap'] = 'Domain registration data could not be retrieved.';
        }
        try {
            $snapshot = data_get($this->json($responses['wayback'] ?? null), 'archived_snapshots.closest');
            if (!empty($snapshot['available']) && !empty($snapshot['timestamp'])) {
                $web['wayback_first_at'] = CarbonImmutable::createFromFormat('YmdHis', $snapshot['timestamp'], 'UTC')->toISOString();
            }
        } catch (Throwable $error) {
            $web['wayback_error'] = 'Archive history is unavailable.';
        }

        return $web;
    }
}
