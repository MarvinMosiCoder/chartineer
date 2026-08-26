<?php

namespace Tests\Feature;

use App\Http\Controllers\Users\ProfilePageController;
use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LastMarketSymbolPreferenceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (!in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for this isolated feature test.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        $this->withoutMiddleware(HandleInertiaRequests::class);

        Schema::create('adm_users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password')->nullable();
            $table->string('status')->default('ACTIVE');
            $table->string('last_market_symbol', 32)->nullable();
            $table->string('last_market_exchange', 32)->nullable();
            $table->string('last_market_category', 16)->nullable();
            $table->string('last_market_timeframe', 8)->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Route::middleware(['web', 'auth'])->patch(
            '/_test/profile/last-market-symbol',
            [ProfilePageController::class, 'updateLastMarketSymbol']
        );
    }

    public function test_it_persists_a_valid_last_market_symbol_onto_the_authenticated_user(): void
    {
        $user = $this->user();

        $this->actingAs($user)->patchJson('/_test/profile/last-market-symbol', [
            'symbol' => 'ethusdt',
            'exchange' => 'BYBIT',
            'category' => 'linear',
            'timeframe' => '4h',
        ])->assertOk()->assertJsonPath('status', 'success');

        $user->refresh();
        $this->assertSame('ETHUSDT', $user->last_market_symbol);
        $this->assertSame('bybit', $user->last_market_exchange);
        $this->assertSame('linear', $user->last_market_category);
        $this->assertSame('4h', $user->last_market_timeframe);
    }

    public function test_it_rejects_an_invalid_category(): void
    {
        $user = $this->user();

        $this->actingAs($user)->patchJson('/_test/profile/last-market-symbol', [
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'futures-but-not-really',
            'timeframe' => '15m',
        ])->assertUnprocessable()->assertJsonValidationErrors('category');

        $this->assertNull($user->fresh()->last_market_symbol);
    }

    public function test_it_rejects_a_malformed_timeframe(): void
    {
        $user = $this->user();

        $this->actingAs($user)->patchJson('/_test/profile/last-market-symbol', [
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'linear',
            'timeframe' => 'fifteen-minutes',
        ])->assertUnprocessable()->assertJsonValidationErrors('timeframe');

        $this->assertNull($user->fresh()->last_market_timeframe);
    }

    public function test_it_never_updates_another_users_preference(): void
    {
        $user = $this->user();
        $other = $this->user('other@example.test');
        $other->update([
            'last_market_symbol' => 'SOLUSDT',
            'last_market_exchange' => 'okx',
            'last_market_category' => 'spot',
            'last_market_timeframe' => '1h',
        ]);

        $this->actingAs($user)->patchJson('/_test/profile/last-market-symbol', [
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'linear',
            'timeframe' => '15m',
        ])->assertOk();

        $this->assertSame('BTCUSDT', $user->fresh()->last_market_symbol);
        $this->assertSame('SOLUSDT', $other->fresh()->last_market_symbol);
    }

    private function user(string $email = 'trader@example.test'): AdmUser
    {
        return AdmUser::query()->create([
            'name' => 'Trader',
            'email' => $email,
            'password' => 'password',
            'status' => 'ACTIVE',
        ]);
    }
}
