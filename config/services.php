<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    'apple' => [
        'client_id' => env('APPLE_CLIENT_ID'),
        'client_secret' => env('APPLE_CLIENT_SECRET'),
        'redirect' => env('APPLE_REDIRECT_URI'),
        'team_id' => env('APPLE_TEAM_ID'),
        'key_id' => env('APPLE_KEY_ID'),
        'private_key' => env('APPLE_PRIVATE_KEY_PATH'),
    ],

    'market_data' => [
        'verify_tls' => env('MARKET_HTTP_VERIFY', true),
    ],

    'coinmarketcap' => [
        'api_key' => env('COINMARKETCAP_API_KEY'),
    ],

    'coingecko' => [
        'api_key' => env('COINGECKO_API_KEY'),
        'mode' => env('COINGECKO_MODE', 'demo'),
    ],

    'paymongo' => [
        'enabled' => env('PAYMONGO_ENABLED', false),
        'mode' => env('PAYMONGO_MODE', 'test'),
        'secret_key' => env('PAYMONGO_SECRET_KEY'),
        'webhook_secret' => env('PAYMONGO_WEBHOOK_SECRET'),
        'payment_methods' => array_values(array_filter(array_map('trim', explode(',', env('PAYMONGO_PAYMENT_METHODS', 'card,gcash'))))),
        'test_bypass_capabilities' => env('PAYMONGO_TEST_BYPASS_CAPABILITIES', false),
        'live_enabled' => env('PAYMONGO_LIVE_ENABLED', false),
        'base_url' => env('PAYMONGO_BASE_URL', 'https://api.paymongo.com/v1'),
        'signature_tolerance' => (int) env('PAYMONGO_SIGNATURE_TOLERANCE', 300),
    ],

    'subscriptions' => [
        'renewal_reminder_days' => (int) env('SUBSCRIPTION_RENEWAL_REMINDER_DAYS', 3),
    ],

    'apple_api' => [
        'base_url' => env('APPLE_API_BASE_URL'),
        'bulk_enroll_endpoint' => env('APPLE_API_BULK_ENROLL_ENDPOINT'),
        'show_order_details_endpoint' => env('APPLE_API_SHOW_ORDER_DETAILS_ENDPOINT'),
        'check_transaction_status_endpoint' => env('APPLE_API_CHECK_TRANSACTION_STATUS_ENDPOINT'),
        'certificate_path' => env('APPLE_API_CERTIFICATE_PATH', ''),
        'certificate_key_path' => env('APPLE_API_CERTIFICATE_KEY_PATH', ''),
        'ship_to' => env('APPLE_API_SHIP_TO'),
        'timezone' => env('APPLE_API_TIMEZONE', '420'),
        'langCode' => env('APPLE_API_LANGUAGE', 'en'),
    ],


];
