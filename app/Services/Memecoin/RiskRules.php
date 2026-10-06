<?php

namespace App\Services\Memecoin;

class RiskRules
{
    /** Null means unchecked. Missing evidence must never become a pass. */
    public function assess(?array $market, ?array $safety, ?array $web, array $blacklist, string $family): array
    {
        $rules = [];
        $add = function (string $name, string $severity, string $message, ?bool $flag, ?string $establishedSeverity = null) use (&$rules) {
            $rules[] = compact('name', 'severity', 'message', 'flag', 'establishedSeverity');
        };
        $value = fn (string $key, callable $check) => ($safety[$key] ?? null) === null ? null : $check($safety[$key]);
        $m = fn (string $key, callable $check) => ($market[$key] ?? null) === null ? null : $check($market[$key]);
        $liquidity = $safety['total_market_liquidity'] ?? (($market['liquidity_usd'] ?? null) !== null ? ($market['total_liquidity_usd'] ?? null) : null);

        if ($family === 'solana') {
            $add('mint_authority', 'fail', 'The dev can still mint new tokens', $safety === null ? null : ($safety['mint_authority'] ?? null) !== null);
            $add('freeze_authority', 'fail', 'The dev can freeze holders’ tokens so they cannot sell', $safety === null ? null : ($safety['freeze_authority'] ?? null) !== null);
            $add('rugged', 'fail', 'RugCheck marks this token as rugged', $value('rugged', fn ($v) => (bool) $v));
            $add('creator_rugged_before', 'fail', 'RugCheck says this creator has rugged tokens before', $safety === null ? null : in_array('Creator history of rugged tokens', array_column($safety['risks'] ?? [], 'name'), true));
        }
        $add('liquidity_too_low', 'fail', 'Less than $1,000 of liquidity: selling may be impossible', $liquidity === null ? null : $liquidity < 1000);
        $add('lp_unlocked', 'fail', 'Less than 90% of liquidity is locked or burned', $value('lp_locked_pct', fn ($v) => $v < 90), 'warn');
        $add('top10_concentrated', 'fail', 'The top 10 holders own more than 30% (pools excluded)', $value('top10_pct', fn ($v) => $v > 30), 'warn');
        $add('thin_liquidity', 'warn', 'Less than $10,000 of liquidity', $liquidity === null ? null : ($liquidity >= 1000 && $liquidity < 10000));
        $add('young_pair', 'warn', 'The main pool is less than 24 hours old', $m('age_hours', fn ($v) => $v < 24));
        $add('low_volume', 'warn', 'Less than $1,000 traded in 24 hours', $m('total_volume_24h', fn ($v) => $v < 1000));
        $add('few_holders', 'warn', 'Fewer than 100 holders', $value('total_holders', fn ($v) => $v < 100));
        $add('creator_holds_supply', 'warn', 'The creator still holds more than 5% of the supply', $value('creator_pct', fn ($v) => $v > 5));
        $add('transfer_fee', 'warn', 'Every transfer pays a fee to the token’s authority', $value('transfer_fee_pct', fn ($v) => $v > 0));
        $add('creator_blacklisted', 'fail', 'The creator wallet is on your blacklist', !$blacklist ? false : $value('creator', fn ($v) => in_array(Chains::normalize($v), $blacklist, true)));
        $add('holder_blacklisted', 'warn', 'A top-10 holder is on your blacklist (for example a bundle wallet)', !$blacklist ? false : $value('top10_pct', fn ($v) => count(array_filter($safety['top_holders'] ?? [], fn ($h) => in_array(Chains::normalize($h['owner'] ?? ''), $blacklist, true))) > 0));
        if ($family === 'solana') {
            $add('insiders_in_top10', 'warn', 'RugCheck links some top-10 holders to each other (insiders)', $value('top10_insiders', fn ($v) => $v > 0));
            $add('mutable_metadata', 'warn', 'The owner can change the token’s name, symbol, and image', $value('mutable_metadata', fn ($v) => (bool) $v));
            $add('creator_dead_tokens', 'fail', 'The creator launched 5+ other tokens and most are worth under $10,000', $value('creator_tokens', fn ($v) => count($v) >= 5 && count(array_filter($v, fn ($t) => ($t['market_cap'] ?? null) !== null && $t['market_cap'] < 10000)) >= .8 * count($v)));
            $add('creator_many_launches', 'warn', 'The creator has launched 5 or more other tokens', $value('creator_tokens', fn ($v) => count($v) >= 5));
            $add('linked_wallets_hold', 'warn', 'Wallets linked by transfers hold 10% or more together (a possible bundle)', $value('linked_wallets_pct', fn ($v) => $v >= 10));
        }
        $add('no_socials', 'warn', 'DexScreener lists no website and no social accounts', $market === null ? null : empty($market['websites']) && empty($market['socials']));
        $add('new_domain', 'warn', 'The website’s domain was registered less than 30 days ago', $market === null ? null : (empty($market['websites']) || ($web['hosted'] ?? false) ? false : (($web['domain_age_days'] ?? null) === null ? null : $web['domain_age_days'] < 30)));
        if ($family === 'evm') {
            foreach ([
                ['honeypot', 'honeypot', 'GoPlus flags a honeypot: buyers may not be able to sell'],
                ['owner_can_mint', 'owner_can_mint', 'The owner can still mint new tokens'],
                ['owner_changes_balances', 'owner_can_change_balances', 'The owner can change holders’ balances'],
                ['can_reclaim_ownership', 'can_reclaim_ownership', 'Renounced ownership can be taken back'],
                ['creator_made_honeypots', 'creator_made_honeypots', 'GoPlus says this creator has made honeypots before'],
            ] as [$name, $field, $message]) {
                $add($name, 'fail', $message, $value($field, fn ($v) => (bool) $v));
            }
            $add('sell_tax_too_high', 'fail', 'Selling costs a tax above 10%', $value('sell_tax_pct', fn ($v) => $v > 10));
            $add('not_open_source', 'fail', 'The contract’s source code is not verified, so nobody can check it', $value('open_source', fn ($v) => !$v));
            foreach ([
                ['hidden_owner', 'hidden_owner', 'The contract has a hidden owner'],
                ['upgradeable_proxy', 'proxy', 'The contract is an upgradeable proxy: its code can be replaced'],
                ['transfers_pausable', 'transfers_pausable', 'The owner can pause transfers'],
                ['can_blacklist', 'can_blacklist', 'The owner can blacklist wallets from trading'],
            ] as [$name, $field, $message]) {
                $add($name, 'warn', $message, $value($field, fn ($v) => (bool) $v));
            }
        }

        $findings = [];
        $unchecked = [];
        $missingFail = false;
        $missingWarnings = 0;
        $established = ($market['age_hours'] ?? 0) >= 720;
        foreach ($rules as $rule) {
            if ($rule['flag'] === null) {
                $unchecked[] = $rule['name'];
                $missingFail = $missingFail || $rule['severity'] === 'fail';
                $missingWarnings += $rule['severity'] === 'warn' ? 10 : 0;
            } elseif ($rule['flag']) {
                $findings[] = ['rule' => $rule['name'], 'severity' => $established ? ($rule['establishedSeverity'] ?? $rule['severity']) : $rule['severity'], 'message' => $rule['message']];
            }
        }
        $score = min(100, array_sum(array_map(fn ($f) => $f['severity'] === 'fail' ? 40 : 10, $findings)));
        $failed = in_array('fail', array_column($findings, 'severity'), true);

        return ['score' => $score, 'verdict' => $failed ? 'Avoid' : ($missingFail || $score + $missingWarnings >= 40 ? 'High risk' : 'Watch'), 'findings' => $findings, 'unchecked' => $unchecked];
    }
}
