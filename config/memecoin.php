<?php

return [
    'report_cache_seconds' => 300,
    'solana_rpc_url' => env('MEMECOIN_SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
    'watch_enabled' => (bool) env('MEMECOIN_WATCH_ENABLED', false),
    'watch_batch_size' => 10,
    // A dedicated recipient receives only this user's alerts, never shared data.
    'telegram_user_id' => env('MEMECOIN_TELEGRAM_USER_ID'),
    'telegram_bot_token' => env('MEMECOIN_TELEGRAM_BOT_TOKEN'),
    'telegram_chat_id' => env('MEMECOIN_TELEGRAM_CHAT_ID'),
    'chains' => [
        'solana' => ['name' => 'Solana', 'family' => 'solana', 'goplus_id' => null],
        'ethereum' => ['name' => 'Ethereum', 'family' => 'evm', 'goplus_id' => '1'],
        'bsc' => ['name' => 'BNB Smart Chain', 'family' => 'evm', 'goplus_id' => '56'],
        'base' => ['name' => 'Base', 'family' => 'evm', 'goplus_id' => '8453'],
        'polygon' => ['name' => 'Polygon', 'family' => 'evm', 'goplus_id' => '137'],
        'arbitrum' => ['name' => 'Arbitrum', 'family' => 'evm', 'goplus_id' => '42161'],
        'robinhood' => ['name' => 'Robinhood Chain', 'family' => 'evm', 'goplus_id' => '4663'],
    ],
];
