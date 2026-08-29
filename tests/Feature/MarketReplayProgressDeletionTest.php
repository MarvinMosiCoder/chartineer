<?php

namespace Tests\Feature;

use App\Models\AdmModels\AdmPrivileges;
use App\Models\AdmUser;
use App\Models\MarketReplayProgress;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * Covers the Back-to-Live checkpoint delete. Runs against the real schema (like
 * BacktestTradeNotificationTest) rather than the sqlite-backed feature tests,
 * which skip in this environment.
 */
class MarketReplayProgressDeletionTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(bool $withReplayAccess = true): AdmUser
    {
        return AdmUser::query()->create([
            'name' => 'Replay Progress Test',
            'email' => uniqid('replay-progress-', true).'@example.test',
            'password' => bcrypt('password'),
            'status' => 'ACTIVE',
            'replay_trial_ends_at' => $withReplayAccess ? now()->addDays(7) : null,
            'id_adm_privileges' => AdmPrivileges::query()->where('is_superadmin', false)->value('id'),
        ]);
    }

    private function makeProgress(AdmUser $user, string $symbol = 'BTCUSDT'): MarketReplayProgress
    {
        return MarketReplayProgress::query()->create([
            'adm_user_id' => $user->id,
            'symbol' => $symbol,
            'exchange' => 'bybit',
            'category' => 'spot',
            'timeframe' => '15m',
            'replay_time' => 1756000000,
            'selected_price' => 61000.5,
            'client_saved_at' => 1756000000000,
        ]);
    }

    public function test_going_back_to_live_deletes_that_markets_checkpoint(): void
    {
        $user = $this->makeUser();
        $progress = $this->makeProgress($user);

        $this->actingAs($user)->deleteJson('/market-replay-progress', [
            // The chart sends whatever case the UI holds; the controller normalizes.
            'symbol' => 'btcusdt', 'exchange' => 'BYBIT', 'category' => 'SPOT',
        ])->assertOk()->assertJson(['success' => true, 'deleted' => 1]);

        $this->assertDatabaseMissing('market_replay_progress', ['id' => $progress->id]);

        // The chart's own reload path must now report no saved progress at all,
        // which is what keeps the market in Live on the next visit.
        $this->actingAs($user)->getJson('/market-replay-progress?symbol=BTCUSDT&exchange=bybit&category=spot')
            ->assertOk()
            ->assertJson(['progress' => null]);
    }

    public function test_delete_is_scoped_to_the_caller_and_the_market(): void
    {
        $user = $this->makeUser();
        $other = $this->makeUser();
        $mine = $this->makeProgress($user);
        $otherMarket = $this->makeProgress($user, 'ETHUSDT');
        $theirs = $this->makeProgress($other);

        $this->actingAs($user)->deleteJson('/market-replay-progress', [
            'symbol' => 'BTCUSDT', 'exchange' => 'bybit', 'category' => 'spot',
        ])->assertOk();

        $this->assertDatabaseMissing('market_replay_progress', ['id' => $mine->id]);
        // Back to Live ends one market's replay, not every saved replay.
        $this->assertDatabaseHas('market_replay_progress', ['id' => $otherMarket->id]);
        $this->assertDatabaseHas('market_replay_progress', ['id' => $theirs->id]);
    }

    public function test_deleting_a_checkpoint_that_is_already_gone_succeeds(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->deleteJson('/market-replay-progress', [
            'symbol' => 'BTCUSDT', 'exchange' => 'bybit', 'category' => 'spot',
        ])->assertOk()->assertJson(['success' => true, 'deleted' => 0]);
    }

    public function test_clearing_stays_possible_after_replay_access_lapses(): void
    {
        $user = $this->makeUser(withReplayAccess: false);
        $progress = $this->makeProgress($user);

        // Saving is gated by replay.access...
        $this->actingAs($user)->putJson('/market-replay-progress', [
            'symbol' => 'BTCUSDT', 'exchange' => 'bybit', 'category' => 'spot',
            'timeframe' => '15m', 'replay_time' => 1756000900, 'client_saved_at' => 1756000900000,
        ])->assertStatus(402);

        // ...but clearing a stale row must not be.
        $this->actingAs($user)->deleteJson('/market-replay-progress', [
            'symbol' => 'BTCUSDT', 'exchange' => 'bybit', 'category' => 'spot',
        ])->assertOk();

        $this->assertDatabaseMissing('market_replay_progress', ['id' => $progress->id]);
    }

    public function test_delete_requires_authentication(): void
    {
        $user = $this->makeUser();
        $progress = $this->makeProgress($user);

        $this->deleteJson('/market-replay-progress', [
            'symbol' => 'BTCUSDT', 'exchange' => 'bybit', 'category' => 'spot',
        ])->assertUnauthorized();

        $this->assertDatabaseHas('market_replay_progress', ['id' => $progress->id]);
    }

    public function test_delete_validates_the_market_identity(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->deleteJson('/market-replay-progress', ['symbol' => 'BTCUSDT'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['exchange', 'category']);
    }
}
