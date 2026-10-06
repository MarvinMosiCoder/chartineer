<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Jobs\ScanMemecoinWallets;
use App\Models\AdmUser;
use App\Models\MemecoinAlert;
use App\Models\MemecoinReport;
use App\Models\MemecoinTrade;
use App\Models\MemecoinWallet;
use App\Services\Memecoin\WalletWatcher;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MemecoinTest extends TestCase
{
    private const MINT = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    private const OWNER = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

    protected function setUp(): void
    {
        parent::setUp();
        if (!in_array('sqlite', \PDO::getAvailableDrivers(), true)) $this->markTestSkipped('pdo_sqlite is needed for isolated memecoin feature tests.');
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        config()->set('database.connections.sqlite.foreign_key_constraints', true);
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->withoutMiddleware(HandleInertiaRequests::class);
        Http::preventStrayRequests();
        Cache::flush();
        Schema::create('adm_users', function (Blueprint $table) {
            $table->id(); $table->string('name'); $table->string('email')->unique(); $table->string('password'); $table->string('status')->default('ACTIVE'); $table->rememberToken(); $table->timestamps();
        });
        (require database_path('migrations/2026_10_06_000001_create_memecoin_tables.php'))->up();
    }

    private function user(string $name = 'owner'): AdmUser
    {
        return AdmUser::create(['name' => $name, 'email' => $name.'@example.test', 'password' => bcrypt('test-password'), 'status' => 'ACTIVE']);
    }

    private function pair(): array
    {
        return ['chainId' => 'solana', 'baseToken' => ['address' => self::MINT, 'name' => 'Test coin', 'symbol' => 'TEST'], 'liquidity' => ['usd' => 80000], 'volume' => ['h24' => 100000, 'h1' => 50000, 'm5' => 10000], 'txns' => ['m5' => ['buys' => 60, 'sells' => 40]], 'marketCap' => 500000, 'pairCreatedAt' => (time() - 172800) * 1000, 'info' => ['websites' => [['url' => 'https://x.com/test']]]];
    }

    private function fakeAnalysis(int $rugStatus = 200): void
    {
        Http::fake([
            'api.dexscreener.com/token-pairs/*' => Http::response([$this->pair()]),
            'api.rugcheck.xyz/*' => Http::response(['mint' => self::MINT, 'token' => ['supply' => 1000], 'creator' => self::OWNER, 'mintAuthority' => null, 'freezeAuthority' => null, 'tokenMeta' => ['mutable' => false], 'rugged' => false, 'totalMarketLiquidity' => 80000, 'markets' => [['lp' => ['lpLockedUSD' => 80000]]], 'totalHolders' => 500, 'topHolders' => [['owner' => self::OWNER, 'pct' => 1]], 'creatorBalance' => 1, 'transferFee' => ['pct' => 0]], $rugStatus),
        ]);
    }

    private function analyze(AdmUser $user): array
    {
        return $this->actingAs($user)->getJson('/memecoin-api/analyze/solana/'.self::MINT)->assertOk()->json();
    }

    public function test_anonymous_and_inactive_users_cannot_use_the_feature(): void
    {
        $this->getJson('/memecoin-api/reports')->assertUnauthorized();
        $this->get('/memecoin')->assertRedirect('/login');
        $user = $this->user();
        $user->update(['status' => 'INACTIVE']);
        $this->actingAs($user)->getJson('/memecoin-api/reports')->assertForbidden();
    }

    public function test_actual_page_routes_pass_correct_views_and_market_identity(): void
    {
        $this->actingAs($this->user())->get('/memecoin/solana/'.self::MINT, ['X-Inertia' => 'true'])->assertOk()->assertJsonPath('component', 'Memecoin/Index')->assertJsonPath('props.view', 'report')->assertJsonPath('props.chain', 'solana')->assertJsonPath('props.address', self::MINT);
        $this->get('/memecoin/journal', ['X-Inertia' => 'true'])->assertOk()->assertJsonPath('props.view', 'journal');
    }

    public function test_chain_address_mismatch_and_bad_query_are_rejected_before_network_calls(): void
    {
        $this->actingAs($this->user())->getJson('/memecoin-api/analyze/ethereum/'.self::MINT)->assertUnprocessable();
        $this->getJson('/memecoin-api/analyze/unsupported/'.self::MINT)->assertUnprocessable();
        $this->getJson('/memecoin-api/search?q=a')->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_search_and_market_failures_return_retryable_errors(): void
    {
        Http::fake(['api.dexscreener.com/*' => Http::response([], 503)]);
        $this->actingAs($this->user())->getJson('/memecoin-api/search?q=test')->assertStatus(502);
        $this->getJson('/memecoin-api/market/solana/'.self::MINT)->assertStatus(502);
    }

    public function test_search_deduplicates_pools_and_filters_the_selected_chain(): void
    {
        Http::fake(['api.dexscreener.com/*' => Http::response(['pairs' => [$this->pair(), $this->pair()]])]);
        $this->actingAs($this->user())->getJson('/memecoin-api/search?q=test&chain=solana')->assertOk()->assertJsonCount(1)->assertJsonPath('0.pools', 2);
    }

    public function test_analysis_is_cached_and_saved_once_and_blacklists_remain_private(): void
    {
        $this->fakeAnalysis();
        $owner = $this->user();
        $other = $this->user('other');
        $this->assertSame('Watch', $this->analyze($owner)['assessment']['verdict']);
        $this->analyze($owner);
        $this->assertSame(1, MemecoinReport::count());
        $this->actingAs($owner)->postJson('/memecoin-api/wallets', ['address' => self::OWNER, 'list' => 'blacklist'])->assertCreated();
        $this->assertSame('Avoid', $this->analyze($owner)['assessment']['verdict']);
        $this->assertSame('Watch', $this->analyze($other)['assessment']['verdict']);
        Http::assertSentCount(2);
        $this->actingAs($other)->getJson('/memecoin-api/wallets')->assertJsonCount(0);
        $this->getJson('/memecoin-api/reports')->assertJsonCount(1);
    }

    public function test_safety_outage_stays_unchecked_and_incomplete_reports_are_not_cached(): void
    {
        $this->fakeAnalysis(503);
        $user = $this->user();
        $report = $this->analyze($user);
        $this->assertSame('High risk', $report['assessment']['verdict']);
        $this->assertContains('mint_authority', $report['assessment']['unchecked']);
        $this->assertArrayHasKey('rugcheck', $report['errors']);
        $this->analyze($user);
        Http::assertSentCount(4);
    }

    public function test_reports_and_wallets_cannot_be_read_or_deleted_by_another_user(): void
    {
        $this->fakeAnalysis();
        $owner = $this->user();
        $this->analyze($owner);
        $reportId = MemecoinReport::first()->id;
        $walletId = $this->actingAs($owner)->postJson('/memecoin-api/wallets', ['address' => self::OWNER, 'list' => 'watch'])->json('id');
        $this->actingAs($this->user('other'))->getJson('/memecoin-api/reports/'.$reportId)->assertNotFound();
        $this->deleteJson('/memecoin-api/reports/'.$reportId)->assertNotFound();
        $this->deleteJson('/memecoin-api/wallets/'.$walletId)->assertNotFound();
    }

    public function test_clear_history_only_deletes_own_reports_and_preserves_journal_entries(): void
    {
        $this->fakeAnalysis();
        $owner = $this->user();
        $other = $this->user('other');
        $this->analyze($owner);
        $reportId = MemecoinReport::first()->id;
        $this->actingAs($owner)->postJson('/memecoin-api/trades', ['chain' => 'solana', 'address' => self::MINT, 'entry_price' => .0000036, 'entry_reason' => 'Momentum', 'report_id' => $reportId])->assertCreated();
        $this->analyze($other);
        $this->actingAs($owner)->deleteJson('/memecoin-api/reports', ['confirm' => 'wrong'])->assertUnprocessable();
        $this->deleteJson('/memecoin-api/reports', ['confirm' => 'clear_all_reports'])->assertOk()->assertJsonPath('deleted', 1);
        $this->assertSame(1, MemecoinReport::count());
        $this->assertNull(MemecoinTrade::first()->report_id);
        $this->assertSame(1, MemecoinTrade::count());
    }

    public function test_wallet_duplicates_normalize_evm_but_preserve_solana_case(): void
    {
        $this->actingAs($this->user())->postJson('/memecoin-api/wallets', ['address' => '0x'.str_repeat('A', 40), 'list' => 'blacklist'])->assertCreated();
        $this->postJson('/memecoin-api/wallets', ['address' => '0x'.str_repeat('a', 40), 'list' => 'blacklist'])->assertStatus(409);
        $this->postJson('/memecoin-api/wallets', ['address' => self::MINT, 'list' => 'watch'])->assertCreated();
        $this->postJson('/memecoin-api/wallets', ['address' => strtolower(self::MINT), 'list' => 'watch'])->assertCreated();
    }

    public function test_journal_close_is_atomic_and_scoped_to_the_owner(): void
    {
        $owner = $this->user();
        $id = $this->actingAs($owner)->postJson('/memecoin-api/trades', ['chain' => 'solana', 'address' => self::MINT, 'entry_price' => .0000036, 'entry_reason' => 'Momentum'])->assertCreated()->json('id');
        $this->patchJson('/memecoin-api/trades/'.$id, ['exit_price' => .0000072])->assertUnprocessable();
        $this->assertNull(MemecoinTrade::find($id)->exit_price);
        $this->patchJson('/memecoin-api/trades/'.$id, ['exit_price' => .0000072, 'exit_reason' => 'Target reached'])->assertOk()->assertJsonPath('pnl_pct', 100);
        $this->actingAs($this->user('other'))->patchJson('/memecoin-api/trades/'.$id, ['entry_reason' => 'Spoof'])->assertNotFound();
        $this->deleteJson('/memecoin-api/trades/'.$id)->assertNotFound();
    }

    public function test_creator_lookup_only_uses_callers_reports_and_distinguishes_owner(): void
    {
        $this->fakeAnalysis();
        $owner = $this->user();
        $this->analyze($owner);
        $this->actingAs($owner)->getJson('/memecoin-api/wallet-tokens/solana/'.self::OWNER)->assertOk()->assertJsonPath('total', 1)->assertJsonPath('coverage', 'saved_reports');
        $this->getJson('/memecoin-api/wallet-tokens/solana/'.self::OWNER.'?relationship=owner')->assertUnprocessable();
        $this->actingAs($this->user('other'))->getJson('/memecoin-api/wallet-tokens/solana/'.self::OWNER)->assertOk()->assertJsonPath('total', 0);
    }

    public function test_wallet_check_is_queued_once_for_the_authenticated_user(): void
    {
        Bus::fake();
        $owner = $this->user();
        $this->actingAs($owner)->postJson('/memecoin-api/watch/check')->assertStatus(202)->assertJsonPath('queued', true);
        $this->postJson('/memecoin-api/watch/check')->assertStatus(409);
        Bus::assertDispatched(ScanMemecoinWallets::class, fn ($job) => $job->userId === $owner->id && $job->connection === 'database' && $job->queue === 'memecoin');
        $this->getJson('/memecoin-api/watch')->assertOk()->assertJsonPath('checking', true);
        Http::assertNothingSent();
    }

    public function test_wallet_baseline_gains_and_alert_ownership(): void
    {
        $owner = $this->user();
        $wallet = MemecoinWallet::create(['adm_user_id' => $owner->id, 'address' => self::OWNER, 'address_hash' => hash('sha256', self::OWNER), 'list' => 'watch']);
        Http::fake(function ($request) {
            if ($request['method'] === 'getSignaturesForAddress') {
                $signature = isset($request['params'][1]['until']) ? 'new' : 'baseline';
                return Http::response(['result' => [['signature' => $signature, 'err' => null]]]);
            }
            return Http::response(['result' => ['meta' => ['err' => null, 'preTokenBalances' => [], 'postTokenBalances' => [['owner' => self::OWNER, 'mint' => self::MINT, 'uiTokenAmount' => ['uiAmountString' => '25']]]]]]);
        });
        app(WalletWatcher::class)->run($owner->id);
        $this->assertSame('baseline', $wallet->fresh()->last_signature);
        $this->assertSame(0, MemecoinAlert::count());
        $result = app(WalletWatcher::class)->run($owner->id);
        $this->assertSame(1, $result['new_alerts']);
        app(WalletWatcher::class)->run($owner->id);
        $this->assertSame(1, MemecoinAlert::count());
        $this->actingAs($this->user('other'))->getJson('/memecoin-api/alerts')->assertJsonPath('unseen', 0);
        $this->postJson('/memecoin-api/alerts/seen')->assertNoContent();
        $this->assertFalse(MemecoinAlert::first()->seen);
        $this->actingAs($owner)->postJson('/memecoin-api/alerts/seen')->assertNoContent();
        $this->assertTrue(MemecoinAlert::first()->seen);
    }

    public function test_unavailable_transaction_does_not_advance_checkpoint(): void
    {
        $owner = $this->user();
        $wallet = MemecoinWallet::create(['adm_user_id' => $owner->id, 'address' => self::OWNER, 'address_hash' => hash('sha256', self::OWNER), 'list' => 'watch', 'last_signature' => 'baseline']);
        Http::fake(fn ($request) => Http::response(['result' => $request['method'] === 'getSignaturesForAddress' ? [['signature' => 'new', 'err' => null]] : null]));
        app(WalletWatcher::class)->run($owner->id);
        $this->assertSame('baseline', $wallet->fresh()->last_signature);
        $this->assertSame(0, MemecoinAlert::count());
    }
}
