import test from 'node:test';
import assert from 'node:assert/strict';
import { scalpSetup } from '../../resources/js/Components/Memecoin/scalp.js';

const market = { market_cap: 100000, liquidity_usd: 75000, volume_1h: 50000, volume_5m: 10000, buys_5m: 60, sells_5m: 40, age_hours: 2 };
test('inclusive boundaries qualify; risk and stale data override', () => {
  assert.equal(scalpSetup(market, 'Watch').status, 'Matches scalp filters');
  assert.equal(scalpSetup(market, 'Avoid').status, 'Blocked by risk assessment');
  assert.equal(scalpSetup(market, 'High risk').status, 'High risk — not a scalp match');
  assert.equal(scalpSetup(market, 'Watch', undefined, true).status, 'Refresh needed');
});
test('missing cap cannot use FDV and missing transactions are unknown', () => {
  assert.equal(scalpSetup({ ...market, market_cap: null, fdv: 1000000 }, 'Watch').status, 'Insufficient data');
  assert.equal(scalpSetup({ ...market, sells_5m: null }, 'Watch').status, 'Insufficient data');
  assert.equal(scalpSetup(null, 'Watch').status, 'Insufficient data');
});
test('uses the selected pool, not aggregate liquidity, and custom minimums', () => {
  assert.equal(scalpSetup({ ...market, liquidity_usd: 10000, total_liquidity_usd: 1000000 }, 'Watch').status, 'Does not match filters');
  const result = scalpSetup(market, 'Watch');
  const filters = Object.fromEntries(result.checks.map(c => [c.key, c.minimum]));
  assert.equal(scalpSetup(market, 'Watch', { ...filters, market_cap: 100001 }).status, 'Does not match filters');
});
test('momentum excludes the overlapping five minutes and rejects incomplete windows', () => {
  assert.equal(scalpSetup({ ...market, volume_1h: 120000 }, 'Watch').momentum, false);
  assert.equal(scalpSetup({ ...market, volume_1h: 119999 }, 'Watch').momentum, true);
  assert.equal(scalpSetup({ ...market, volume_1h: 4000 }, 'Watch').momentum, null);
  assert.equal(scalpSetup({ ...market, age_hours: 0.5 }, 'Watch').momentum, null);
});

test('stricter liquidity, volume and trade defaults reject below-minimum values', () => {
  for (const change of [{ liquidity_usd: 74999 }, { volume_5m: 9999 }, { buys_5m: 59 }]) {
    assert.equal(scalpSetup({ ...market, ...change }, 'Watch').status, 'Does not match filters');
  }
});

test('liquidity / market cap requires 10 percent, never substitutes FDV or totals', () => {
  const atBoundary = { ...market, market_cap: 750000 };
  assert.equal(scalpSetup(atBoundary, 'Watch').status, 'Matches scalp filters');
  assert.equal(scalpSetup({ ...atBoundary, market_cap: 750001 }, 'Watch').status, 'Does not match filters');
  const ratio = (value) => scalpSetup(value, 'Watch').checks.find(c => c.key === 'liquidity_mc_pct');
  assert.equal(ratio(atBoundary).value, 10);
  assert.equal(ratio({ ...market, market_cap: null, fdv: 100000 }).value, null);
  assert.equal(ratio({ ...market, market_cap: 0 }).value, null);
  assert.equal(ratio({ ...market, liquidity_usd: null, total_liquidity_usd: 100000 }).value, null);
  assert.equal(ratio({ ...market, liquidity_usd: 0 }).value, 0);
});

