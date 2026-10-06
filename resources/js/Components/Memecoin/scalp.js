export const DEFAULT_FILTERS = { market_cap: 1e5, liquidity_usd: 75e3, volume_1h: 5e4, volume_5m: 1e4, trades_5m: 100, liquidity_mc_pct: 10 };
export const FILTER_LABELS = {
  market_cap: "Market cap",
  liquidity_usd: "Pool liquidity",
  volume_1h: "Volume 1h",
  volume_5m: "Volume 5m",
  trades_5m: "Trades 5m",
  liquidity_mc_pct: "Liquidity / market cap"
};
function valid(value) {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}
export function scalpSetup(market, verdict, filters = DEFAULT_FILTERS, stale = false) {
  const buys = valid(market?.buys_5m), sells = valid(market?.sells_5m);
  const cap = valid(market?.market_cap), liquidity = valid(market?.liquidity_usd);
  const ratio = cap !== null && cap > 0 && liquidity !== null ? valid(liquidity / cap * 100) : null;
  const values = { market_cap: cap, liquidity_usd: liquidity, volume_1h: valid(market?.volume_1h), volume_5m: valid(market?.volume_5m), trades_5m: buys === null || sells === null ? null : buys + sells, liquidity_mc_pct: ratio };
  const checks = Object.keys(filters).map((key) => ({ key, value: values[key], minimum: filters[key], pass: values[key] === null ? null : values[key] >= filters[key] }));
  const h1 = values.volume_1h, m5 = values.volume_5m;
  const momentum = h1 === null || m5 === null || h1 < m5 || (market?.age_hours ?? 0) < 1 ? null : m5 > (h1 - m5) / 11;
  const status = verdict === "Avoid" ? "Blocked by risk assessment" : verdict === "High risk" ? "High risk \u2014 not a scalp match" : stale ? "Refresh needed" : checks.some((check) => check.pass === false) || momentum === false ? "Does not match filters" : checks.some((check) => check.pass === null) || momentum === null ? "Insufficient data" : "Matches scalp filters";
  return { checks, momentum, status };
}
