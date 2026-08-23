<?php

namespace Tests\Feature;

use App\Http\Controllers\MarketDataController;
use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use App\Models\MarketSymbol;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MarketSymbolFavoriteTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (!in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated market-symbol feature tests.');
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
            $table->string('password');
            $table->string('status')->default('ACTIVE');
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('market_symbols', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('adm_user_id')->nullable();
            $table->string('symbol', 32);
            $table->string('exchange', 24)->default('bybit');
            $table->string('exchange_symbol', 64)->nullable();
            $table->string('coin_name', 64)->nullable();
            $table->string('base_coin', 32)->nullable();
            $table->string('quote_coin', 32)->nullable();
            $table->string('category', 16)->default('spot');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_favorite')->default(false);
            $table->timestamps();
            $table->unique(['adm_user_id', 'exchange', 'category', 'symbol']);
        });

        Route::middleware(['web', 'auth'])->group(function () {
            Route::put('/_test/market-symbols/favorite', [MarketDataController::class, 'toggleFavoriteSymbol']);
            Route::delete('/_test/market-symbols/favorites', [MarketDataController::class, 'clearAllFavorites']);
        });
    }

    public function test_favoriting_an_unsaved_symbol_creates_and_favorites_it_in_one_call(): void
    {
        $user = $this->user('owner@example.test');

        $this->actingAs($user)->putJson('/_test/market-symbols/favorite', [
            'symbol' => 'BTCUSDT',
            'exchange' => 'bybit',
            'category' => 'spot',
            'is_favorite' => true,
        ])->assertOk()
            ->assertJsonPath('symbol.symbol', 'BTCUSDT')
            ->assertJsonPath('symbol.is_favorite', true);

        $this->assertDatabaseCount('market_symbols', 1);
        $this->assertDatabaseHas('market_symbols', [
            'adm_user_id' => $user->id,
            'symbol' => 'BTCUSDT',
            'is_favorite' => true,
        ]);
    }

    public function test_toggling_favorite_off_leaves_the_saved_symbol_in_place(): void
    {
        $user = $this->user('owner@example.test');
        $saved = MarketSymbol::create([
            'adm_user_id' => $user->id,
            'symbol' => 'ETHUSDT',
            'exchange' => 'bybit',
            'category' => 'spot',
            'is_active' => true,
            'is_favorite' => true,
        ]);

        $this->actingAs($user)->putJson('/_test/market-symbols/favorite', [
            'symbol' => 'ETHUSDT',
            'exchange' => 'bybit',
            'category' => 'spot',
            'is_favorite' => false,
        ])->assertOk()->assertJsonPath('symbol.is_favorite', false);

        $this->assertDatabaseCount('market_symbols', 1);
        $this->assertDatabaseHas('market_symbols', [
            'id' => $saved->id,
            'is_favorite' => false,
        ]);
    }

    public function test_clear_all_favorites_only_unfavorites_and_never_deletes_rows(): void
    {
        $user = $this->user('owner@example.test');
        $favoritedOne = MarketSymbol::create(['adm_user_id' => $user->id, 'symbol' => 'BTCUSDT', 'exchange' => 'bybit', 'category' => 'spot', 'is_active' => true, 'is_favorite' => true]);
        $favoritedTwo = MarketSymbol::create(['adm_user_id' => $user->id, 'symbol' => 'ETHUSDT', 'exchange' => 'bybit', 'category' => 'spot', 'is_active' => true, 'is_favorite' => true]);
        $notFavorited = MarketSymbol::create(['adm_user_id' => $user->id, 'symbol' => 'SOLUSDT', 'exchange' => 'bybit', 'category' => 'spot', 'is_active' => true, 'is_favorite' => false]);

        $this->actingAs($user)->deleteJson('/_test/market-symbols/favorites')
            ->assertOk()
            ->assertJsonPath('cleared', 2);

        $this->assertDatabaseCount('market_symbols', 3);
        $this->assertDatabaseHas('market_symbols', ['id' => $favoritedOne->id, 'is_favorite' => false]);
        $this->assertDatabaseHas('market_symbols', ['id' => $favoritedTwo->id, 'is_favorite' => false]);
        $this->assertDatabaseHas('market_symbols', ['id' => $notFavorited->id, 'is_favorite' => false]);
    }

    public function test_clear_all_favorites_does_not_touch_another_users_favorites(): void
    {
        $owner = $this->user('owner@example.test');
        $other = $this->user('other@example.test');
        $othersFavorite = MarketSymbol::create(['adm_user_id' => $other->id, 'symbol' => 'BTCUSDT', 'exchange' => 'bybit', 'category' => 'spot', 'is_active' => true, 'is_favorite' => true]);

        $this->actingAs($owner)->deleteJson('/_test/market-symbols/favorites')
            ->assertOk()
            ->assertJsonPath('cleared', 0);

        $this->assertDatabaseHas('market_symbols', ['id' => $othersFavorite->id, 'is_favorite' => true]);
    }

    private function user(string $email): AdmUser
    {
        return AdmUser::create([
            'name' => 'Trader',
            'email' => $email,
            'password' => 'password',
            'status' => 'ACTIVE',
        ]);
    }
}
