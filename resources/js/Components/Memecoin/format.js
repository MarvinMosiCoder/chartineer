const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});
export function usd(value) {
  return value === null ? "?" : compactUsd.format(value);
}
export function liquidity(token) {
  return usd(token.liquidity_usd === null ? null : token.total_liquidity_usd);
}
export function age(hours) {
  if (hours === null) return "?";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}
export function shortAddress(address) {
  return `${address.slice(0, 4)}\u2026${address.slice(-4)}`;
}
const priceUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 4
});
export function price(value) {
  return value === null ? "?" : priceUsd.format(value);
}
export function pct(value) {
  return value === null ? "?" : `${value.toFixed(1)}%`;
}
export function count(value) {
  return value === null ? "?" : value.toLocaleString("en-US");
}
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export function tokens(value) {
  return compactNumber.format(value);
}
export function date(value) {
  return value === null ? "?" : new Date(value).toLocaleDateString();
}
export function yesNo(value) {
  return value === null ? "?" : value ? "Yes" : "No";
}
