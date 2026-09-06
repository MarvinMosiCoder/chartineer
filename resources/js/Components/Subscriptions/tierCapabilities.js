/**
 * Display labels for capability names.
 *
 * Only the wording lives here. Which tier owns a capability is decided by
 * `config/subscription_tiers.php` and reaches the client through the API, so a
 * capability retuned on the server needs no change in this file — an unknown
 * name simply falls back to a readable version of itself.
 */
export const CAPABILITY_LABELS = {
    replay: 'Replay any market',
    backtest: 'Simulated trading with SL/TP',
    journal: 'Trade journal',
    challenges: 'Training challenges',

    playbooks: 'Strategy playbooks & pre-trade checklist',
    risk_guardrails: 'Risk guardrails & loss-streak limits',
    analytics: 'Advanced analytics & drawdown',
    insights: 'Coaching insights',
    export: 'Report export (CSV/PDF)',
    deep_history: 'Deep replay history (20,000 candles)',

    cross_margin: 'Cross Margin & liquidation engine',
    monte_carlo: 'Monte Carlo risk simulation',
    imported_trades: 'Import your real broker trades',
    mentor_share: 'Mentor review share links',
};

export function capabilityLabel(name) {
    if (CAPABILITY_LABELS[name]) return CAPABILITY_LABELS[name];

    return String(name)
        .replace(/_/g, ' ')
        .replace(/^./, (character) => character.toUpperCase());
}
