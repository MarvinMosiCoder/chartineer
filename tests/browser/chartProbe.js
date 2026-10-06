export * from '../../node_modules/lightweight-charts/dist/lightweight-charts.production.mjs';
import { createChart as create } from '../../node_modules/lightweight-charts/dist/lightweight-charts.production.mjs';
export function createChart(...args) {
  const chart = create(...args);
  window.chartProbe = { chart, series: [] };
  const addSeries = chart.addSeries.bind(chart);
  chart.addSeries = (...params) => {
    const series = addSeries(...params);
    const record = { series, resets: 0, updates: 0, count: 0 };
    window.chartProbe.series.push(record);
    const setData = series.setData.bind(series);
    const update = series.update.bind(series);
    series.setData = (data) => { record.resets++; record.count = data.length; return setData(data); };
    series.update = (...updateArgs) => { record.updates++; return update(...updateArgs); };
    return series;
  };
  return chart;
}
