<?php

use App\Http\Controllers\MemecoinController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'account.active'])->group(function () {
    Route::get('/memecoin', [MemecoinController::class, 'page'])->defaults('view', 'search')->name('memecoin');
    foreach (['history', 'wallets', 'creators', 'journal', 'watch'] as $view) {
        Route::get('/memecoin/'.$view, [MemecoinController::class, 'page'])->defaults('view', $view)->name('memecoin.'.$view);
    }
    Route::get('/memecoin/history/{id}', [MemecoinController::class, 'page'])->whereNumber('id')->defaults('view', 'saved')->name('memecoin.saved');
    Route::get('/memecoin/{chain}/{address}', [MemecoinController::class, 'page'])->defaults('view', 'report')->name('memecoin.report');

    Route::prefix('memecoin-api')->name('memecoin-api.')->group(function () {
        Route::get('/search', [MemecoinController::class, 'search'])->middleware('throttle:memecoin-search')->name('search');
        Route::get('/analyze/{chain}/{address}', [MemecoinController::class, 'analyze'])->middleware('throttle:memecoin-analyze')->name('analyze');
        Route::get('/market/{chain}/{address}', [MemecoinController::class, 'market'])->middleware('throttle:memecoin-search')->name('market');
        Route::get('/wallet-tokens/{chain}/{address}', [MemecoinController::class, 'walletTokens'])->middleware('throttle:backtest-read')->name('wallet-tokens');
        Route::middleware('throttle:backtest-read')->group(function () {
            Route::get('/reports', [MemecoinController::class, 'reports'])->name('reports');
            Route::get('/reports/{id}', [MemecoinController::class, 'report'])->whereNumber('id')->name('report');
            Route::get('/wallets', [MemecoinController::class, 'wallets'])->name('wallets');
            Route::get('/trades', [MemecoinController::class, 'trades'])->name('trades');
            Route::get('/watch', [MemecoinController::class, 'watchStatus'])->name('watch');
            Route::get('/alerts', [MemecoinController::class, 'alerts'])->name('alerts');
        });
        Route::middleware('throttle:market-write')->group(function () {
            Route::delete('/reports', [MemecoinController::class, 'clearReports'])->name('reports.clear');
            Route::delete('/reports/{id}', [MemecoinController::class, 'deleteReport'])->whereNumber('id')->name('report.delete');
            Route::post('/wallets', [MemecoinController::class, 'addWallet'])->name('wallet.add');
            Route::delete('/wallets/{id}', [MemecoinController::class, 'deleteWallet'])->whereNumber('id')->name('wallet.delete');
            Route::post('/trades', [MemecoinController::class, 'addTrade'])->name('trade.add');
            Route::patch('/trades/{id}', [MemecoinController::class, 'updateTrade'])->whereNumber('id')->name('trade.update');
            Route::delete('/trades/{id}', [MemecoinController::class, 'deleteTrade'])->whereNumber('id')->name('trade.delete');
            Route::post('/alerts/seen', [MemecoinController::class, 'markSeen'])->name('alerts.seen');
        });
        Route::post('/watch/check', [MemecoinController::class, 'checkWatch'])->middleware('throttle:memecoin-watch')->name('watch.check');
    });
});
