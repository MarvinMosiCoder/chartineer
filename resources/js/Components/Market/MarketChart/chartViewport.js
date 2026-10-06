// Frame the recent market at a readable density instead of shrinking thousands
// of loaded bars to fit the canvas. The full history remains available to pan.
export function recentChartRange(count, width, barSpacing = 8, rightOffset = 8) {
  if (!Number.isFinite(count) || count < 1) return null;
  const spacing = Math.max(3, Number(barSpacing) || 8);
  const bars = Math.max(12, Math.floor(Math.max(0, Number(width) || 0) / spacing));
  const to = count - 1 + Math.min(rightOffset, Math.floor(bars / 4));
  return { from: to - bars, to };
}

export function frameRecentCandles(chart, count, barSpacing) {
  const timeScale = chart.timeScale();
  const range = recentChartRange(count, timeScale.width(), barSpacing);
  if (range) timeScale.setVisibleLogicalRange(range);
}
