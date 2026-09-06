<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Prop-firm challenge templates
    |--------------------------------------------------------------------------
    |
    | Rule shapes only. **No template may carry a real firm's name.** The rule
    | shapes themselves are not proprietary and traders recognise them on sight,
    | but shipping a branded preset inside a paid product invites a trademark
    | dispute for no product benefit. Reject any UI copy naming a specific firm
    | for the same reason.
    |
    | A null rule is not evaluated. Percentages are of the challenge's own
    | starting balance, and every figure is balance-based (closed trades only) —
    | see the spec for why equity-based rules are a separate feature.
    |
    */

    'templates' => [

        'two_step_eval' => [
            'name' => 'Two-Step Evaluation',
            'description' => 'The common two-phase shape: a moderate target with a fixed drawdown floor.',
            'profit_target_percent' => 8,
            'max_daily_loss_percent' => 5,
            'max_total_drawdown_percent' => 10,
            'drawdown_type' => 'static',
            'min_trading_days' => 4,
            'max_calendar_days' => null,
            'consistency_percent' => null,
        ],

        'one_step_express' => [
            'name' => 'One-Step Express',
            'description' => 'A single phase with a higher target and a trailing floor that follows your peak.',
            'profit_target_percent' => 10,
            'max_daily_loss_percent' => 5,
            'max_total_drawdown_percent' => 6,
            'drawdown_type' => 'trailing',
            'min_trading_days' => 5,
            'max_calendar_days' => null,
            'consistency_percent' => 40,
        ],

        'custom' => [
            'name' => 'Custom',
            'description' => 'Set your own rules. Any rule left blank is not evaluated.',
            'profit_target_percent' => null,
            'max_daily_loss_percent' => null,
            'max_total_drawdown_percent' => null,
            'drawdown_type' => 'static',
            'min_trading_days' => null,
            'max_calendar_days' => null,
            'consistency_percent' => null,
        ],

    ],

    /* Account sizes offered when starting a challenge. */
    'account_sizes' => [10000, 25000, 50000, 100000, 200000],

    'default_account_size' => 50000,

];
