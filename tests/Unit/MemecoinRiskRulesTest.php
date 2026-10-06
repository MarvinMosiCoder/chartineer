<?php

namespace Tests\Unit;

use App\Services\Memecoin\Analyzer;
use App\Services\Memecoin\Chains;
use App\Services\Memecoin\RiskRules;
use App\Services\Memecoin\WalletWatcher;
use Tests\TestCase;

class MemecoinRiskRulesTest extends TestCase
{
    private function fixture(string $name): array
    {
        return json_decode(file_get_contents(base_path('tests/Fixtures/Memecoin/'.$name.'.json')), true, 512, JSON_THROW_ON_ERROR);
    }

    private function evidence(string $coin, float $age, string $chain = 'solana'): array
    {
        $analyzer = app(Analyzer::class);
        $pairs = $this->fixture($coin.'-dexscreener');
        $market = $analyzer->groupTokens($pairs)[0];
        $market['age_hours'] = $age;
        $safety = $chain === 'solana' ? $analyzer->solanaSafety($this->fixture($coin.'-rugcheck')) : $analyzer->evmSafety(array_values($this->fixture($coin.'-goplus')['result'])[0], $market['address']);
        return [$market, $safety, ['hosted' => false, 'domain_age_days' => 1000]];
    }

    public function test_saved_solana_coins_preserve_the_source_verdicts(): void
    {
        foreach (['bonk-DezXAZ8z' => 24000, 'epump-7haJedyf' => 2] as $coin => $age) {
            [$market, $safety, $web] = $this->evidence($coin, $age);
            $result = app(RiskRules::class)->assess($market, $safety, $web, [], 'solana');
            $this->assertSame('Watch', $result['verdict'], $coin);
            $this->assertNotSame('Watch', app(RiskRules::class)->assess($market, null, $web, [], 'solana')['verdict']);
        }
    }

    public function test_established_liquidity_and_holder_rules_warn_but_young_tokens_fail(): void
    {
        [$market, $safety, $web] = $this->evidence('bonk-DezXAZ8z', 24000);
        $result = app(RiskRules::class)->assess($market, $safety, $web, [], 'solana');
        $severities = array_column($result['findings'], 'severity', 'rule');
        $this->assertSame('warn', $severities['lp_unlocked']);
        $this->assertSame('warn', $severities['top10_concentrated']);
        $market['age_hours'] = 2;
        $this->assertSame('Avoid', app(RiskRules::class)->assess($market, $safety, $web, [], 'solana')['verdict']);
    }

    public function test_missing_hard_check_is_unchecked_and_cannot_earn_watch(): void
    {
        [$market, $safety, $web] = $this->evidence('epump-7haJedyf', 2);
        $safety['lp_locked_pct'] = null;
        $result = app(RiskRules::class)->assess($market, $safety, $web, [], 'solana');
        $this->assertSame('High risk', $result['verdict']);
        $this->assertContains('lp_unlocked', $result['unchecked']);
    }

    public function test_missing_market_warnings_do_not_improve_a_verdict(): void
    {
        [$market, $safety, $web] = $this->evidence('epump-7haJedyf', 2);
        $safety['mutable_metadata'] = true;
        $safety['transfer_fee_pct'] = 1;
        $this->assertSame('High risk', app(RiskRules::class)->assess($market, $safety, $web, [], 'solana')['verdict']);
        $this->assertSame('High risk', app(RiskRules::class)->assess(null, $safety, null, [], 'solana')['verdict']);
    }

    public function test_creator_blacklist_is_a_hard_failure_and_score_is_capped(): void
    {
        [$market, $safety, $web] = $this->evidence('bonk-DezXAZ8z', 24000);
        $result = app(RiskRules::class)->assess($market, $safety, $web, [$safety['creator']], 'solana');
        $this->assertSame('Avoid', $result['verdict']);
        $this->assertContains('creator_blacklisted', array_column($result['findings'], 'rule'));
        $safety['mint_authority'] = 'enabled';
        $safety['freeze_authority'] = 'enabled';
        $safety['rugged'] = true;
        $this->assertSame(100, app(RiskRules::class)->assess($market, $safety, $web, [], 'solana')['score']);
    }

    public function test_evm_renunciation_disarms_powers_but_reclaimable_ownership_does_not(): void
    {
        [$market, $safety, $web] = $this->evidence('pepe-0x698250', 24000, 'ethereum');
        $this->assertTrue($safety['open_source']);
        $this->assertTrue($safety['owner_renounced']);
        $this->assertFalse($safety['transfers_pausable']);
        $this->assertSame('Watch', app(RiskRules::class)->assess($market, $safety, $web, [], 'evm')['verdict']);
        $power = app(Analyzer::class)->evmSafety(['owner_address' => '0x'.str_repeat('0', 40), 'is_mintable' => '1', 'can_take_back_ownership' => '1'], $market['address']);
        $this->assertTrue($power['owner_can_mint']);
    }

    public function test_unverified_evm_contract_is_avoid_with_unknown_powers(): void
    {
        [$market, $safety, $web] = $this->evidence('unverified-0x8562c3', 24000, 'ethereum');
        $this->assertFalse($safety['open_source']);
        $this->assertNull($safety['owner_can_mint']);
        $this->assertSame('Avoid', app(RiskRules::class)->assess($market, $safety, $web, [], 'evm')['verdict']);
    }

    public function test_deepest_pool_retains_its_own_scalp_metrics_and_case_is_chain_specific(): void
    {
        $mint = str_repeat('A', 32);
        $pair = ['chainId' => 'solana', 'baseToken' => ['address' => $mint], 'liquidity' => ['usd' => 80000], 'volume' => ['h24' => 100, 'm5' => 10]];
        $other = array_replace_recursive($pair, ['liquidity' => ['usd' => 1000], 'volume' => ['h24' => 200, 'm5' => 99999]]);
        $result = app(Analyzer::class)->groupTokens([$other, $pair])[0];
        $this->assertSame(10.0, $result['volume_5m']);
        $this->assertSame(81000.0, $result['total_liquidity_usd']);
        $this->assertSame(2, $result['pools']);
        $this->assertSame($mint, Chains::normalize($mint));
        $this->assertSame('0x'.str_repeat('a', 40), Chains::normalize('0x'.str_repeat('A', 40)));
    }

    public function test_wallet_gains_aggregate_accounts_and_exclude_quote_assets_and_failed_transactions(): void
    {
        $mint = str_repeat('A', 32);
        $balance = fn ($amount) => ['mint' => $mint, 'owner' => 'wallet', 'uiTokenAmount' => ['uiAmountString' => (string) $amount]];
        $tx = ['meta' => ['err' => null, 'preTokenBalances' => [$balance(10), $balance(20)], 'postTokenBalances' => [$balance(40), $balance(50), ['owner' => 'wallet', 'mint' => 'So11111111111111111111111111111111111111112', 'uiTokenAmount' => ['uiAmountString' => '100']]]]];
        $this->assertSame([$mint => 60.0], app(WalletWatcher::class)->tokenGains($tx, 'wallet'));
        $tx['meta']['err'] = ['InstructionError' => []];
        $this->assertSame([], app(WalletWatcher::class)->tokenGains($tx, 'wallet'));
    }
}
