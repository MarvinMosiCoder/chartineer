import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const server = await createServer({ configFile: false, root: path.join(root, 'tests/browser'), publicDir: false, cacheDir: path.join(root, 'node_modules/.vite-chart-preview'), plugins: [react()], resolve: { alias: { 'lightweight-charts': path.join(root, 'tests/browser/chartProbe.js'), '@': path.join(root, 'resources/js') } }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } } });
let browser;
const lastTime = Math.floor(Date.now() / 900000) * 900;
const candles = Array.from({ length: 20000 }, (_, i) => {
  const open = 60000 + Math.sin(i / 21) * 500 + i / 8;
  const close = open + Math.sin(i / 5) * 60;
  return { time: lastTime - (19999 - i) * 900, open, high: Math.max(open, close) + 30, low: Math.min(open, close) - 30, close, volume: 1000 + i % 700 };
});
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR', error.stack); });
  const sockets = [];
  await page.routeWebSocket(/binance\.com/, socket => sockets.push(socket));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    let body;
    if (p === '/api/klines') body = { success: true, candles };
    else if (p === '/market-symbols' || p === '/market-price-alerts') body = [];
    else if (p === '/api/market-symbol-options') body = { symbols: ['BTCUSDT', 'ETHUSDT'] };
    else if (p === '/market-tool-settings') body = { settings: {} };
    else if (p === '/market-drawings') body = { drawings: [], exists: true };
    else if (p === '/market-backtest/account') body = { account: null };
    else if (p === '/replay-access') body = { access: { can_replay: true, can_trade: true }, can_replay: true };
    else if (p === '/market-replay-progress') body = { progress: null };
    else if (p === '/notifications/feed') body = { notifications: [], unread_notifications: 0 };
    else if (!url.hostname.includes('127.0.0.1')) return route.abort();
    if (body !== undefined) return route.fulfill({ json: body });
    return route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('market-chart-indicators:999999', JSON.stringify({ sma: true, ema: true, rsi: true, macd: true, volume: true })));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chartRendering.html`);
  try {
    await page.waitForFunction(() => window.chartProbe?.series[0]?.count === 20000, null, { timeout: 30000 });
  } catch (error) {
    console.log(await page.evaluate(() => ({ body: document.body.innerText.slice(0, 1500), series: window.chartProbe?.series.map(({ count }) => count) })));
    throw error;
  }
  await page.waitForTimeout(1500);
  assert.deepEqual(errors, []);
  const range = await page.evaluate(() => window.chartProbe.chart.timeScale().getVisibleLogicalRange());
  assert(range.to - range.from < 250, 'Initial view must show readable recent bars');
  assert(range.to > 19999 && range.from < 19999);
  assert.equal(await page.evaluate(() => window.chartProbe.chart.options().layout.fontSize), 11);
  const before = await page.evaluate(() => window.chartProbe.series.map(({ resets, updates }) => ({ resets, updates })));
  const last = candles.at(-1);
  for (let i = 0; i < 12; i++) {
    const message = JSON.stringify({ e: 'kline', E: Date.now(), s: 'BTCUSDT', k: { t: last.time * 1000, o: String(last.open), h: String(last.high + 20), l: String(last.low), c: String(last.close + i), v: '1900', i: '15m', x: false } });
    for (const socket of sockets) { try { socket.send(message); } catch {} }
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.chartProbe.series.map(({ resets, updates }) => ({ resets, updates })));
  assert(after[0].updates > before[0].updates, 'Real chart must consume the mocked exchange ticks');
  after.forEach((record, i) => {
    assert.equal(record.resets, before[i].resets, `Series ${i} must not rebuild on ticks`);
    assert(record.updates > before[i].updates, `Series ${i} must receive incremental updates`);
  });
  await page.evaluate(() => window.chartProbe.chart.timeScale().setVisibleLogicalRange({ from: 19000, to: 19120 }));
  await page.mouse.move(700, 250);
  await page.mouse.wheel(-200, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  const size = await page.evaluate(() => ({ width: window.chartProbe.chart.timeScale().width(), range: window.chartProbe.chart.timeScale().getVisibleLogicalRange() }));
  assert(size.width > 100 && size.width < 390);
  assert(Number.isFinite(size.range.from) && Number.isFinite(size.range.to));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chartRendering.html?theme=light`);
  await page.waitForFunction(() => window.chartProbe?.series[0]?.count === 20000);
  await page.waitForFunction(() => window.chartProbe?.chart.options().layout.background.color === '#ffffff');
  const mobileRange = await page.evaluate(() => window.chartProbe.chart.timeScale().getVisibleLogicalRange());
  assert(mobileRange.to - mobileRange.from < 80);
  assert.equal(await page.evaluate(() => window.chartProbe.chart.options().layout.fontSize), 10);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', candles: 20000, initialVisibleBars: range.to - range.from, incrementalSeries: after.length, mobilePlotWidth: size.width, errors }));
} finally {
  if (browser) await browser.close();
  await server.close();
}
