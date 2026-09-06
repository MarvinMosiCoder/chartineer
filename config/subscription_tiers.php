<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Subscription tiers
    |--------------------------------------------------------------------------
    |
    | Single source of truth for what each paid tier may do. Enforcement
    | (EnsureReplayAccess, the controllers' quota checks) and display
    | (SubscriptionModal's feature list) both read from here, so the advertised
    | capabilities cannot drift away from the enforced ones — which is exactly
    | how the display-only `subscription_plans.features` list ended up saying
    | the same thing for all three plans.
    |
    | Plans map to a level through `subscription_plans.tier_level`:
    |   0 no access · 1 Starter (weekly) · 2 Pro (monthly) · 3 Elite (yearly)
    |
    | Retuning which tier owns a capability is a one-line edit here. It needs no
    | migration, no route change, and no frontend redeploy.
    |
    */

    'trial_level' => 3,

    'names' => [
        1 => 'Starter',
        2 => 'Pro',
        3 => 'Elite',
    ],

    /*
    | Minimum tier required for each capability. A capability absent from this
    | map fails closed (treated as unreachable), never open.
    */
    'capabilities' => [
        // Starter — the core practice loop.
        'replay'          => 1,
        'backtest'        => 1,
        'journal'         => 1,
        'challenges'      => 1,

        // Pro — systematic practice.
        'playbooks'       => 2,
        'risk_guardrails' => 2,
        'analytics'       => 2,
        'insights'        => 2,
        'export'          => 2,
        'deep_history'    => 2,

        // Elite — advanced instruments, real trades, and coaching.
        'cross_margin'    => 3,
        'monte_carlo'     => 3,
        'imported_trades' => 3,
        'mentor_share'    => 3,
    ],

    /*
    | Per-tier creation quotas. `null` means unlimited. A user who drops below
    | the tier that granted their current count keeps every existing row and is
    | only refused new ones — nothing is deleted on downgrade.
    */
    'limits' => [
        1 => ['alerts' => 5,   'playbooks' => 0,    'share_links' => 0],
        2 => ['alerts' => 25,  'playbooks' => 10,   'share_links' => 0],
        3 => ['alerts' => 100, 'playbooks' => null, 'share_links' => null],
    ],

    /*
    | Candle ceiling for an unauthenticated or sub-`deep_history` caller of the
    | public /api/klines endpoint. Requests above this are capped rather than
    | rejected, so the public contract keeps returning usable data.
    */
    'public_max_candles' => 5000,

];
