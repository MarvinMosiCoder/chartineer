# Live chart future drawing projection

## Purpose

Allow drawing tools on live charts to retain the exact future-whitespace position selected by the user on every timeframe. The current coarse-timeframe mapping collapses timestamps after the newest 15-minute-or-higher candle onto that candle, so drawings appear to end at the live-price edge. One-minute and five-minute charts do not enter that branch and already project correctly.

## Scope

- Correct future-anchor projection for drawing tools on 15m and higher timeframes.
- Preserve existing containing-candle snapping for historical anchors between known coarse candles.
- Preserve the existing behavior on timeframes below 15m.
- Add focused regression coverage for the pure coordinate helper.
- Update the trading-chart maintenance documentation.

No candle data, replay behavior, drawing persistence format, or chart viewport policy will change.

## Design

### Coordinate mapping

`estimateDrawingLogicalFromTime()` in `resources/js/Components/Market/MarketChart/utils.js` remains the authoritative conversion from a saved drawing timestamp to a logical chart coordinate.

For 15m and higher timeframes, containing-candle snapping will apply only where the timestamp is bounded by known candle data. A timestamp later than the newest candle start will use the existing `estimateLogicalFromTime()` extrapolation path instead of matching the unbounded final-candle condition.

This preserves the exact fractional or whole-bar distance selected in future whitespace. As live candles arrive, the timestamp remains authoritative and naturally moves from extrapolated space into the known candle timeline without changing the saved drawing format.

### Alternatives rejected

- Prefer the stored `point.logical`: logical indexes can drift when a different history window is loaded, while timestamps remain stable.
- Add synthetic future candles: this would mix drawing support into market data and could affect indicators, replay, and execution markers.

### Error handling

The helper will retain its current null behavior for empty candle arrays, invalid timestamps, and invalid logical inputs. No new runtime failure mode or user-facing error state is introduced.

## Testing

Focused helper assertions will verify:

- A future timestamp on a 15m series extrapolates past the last logical index.
- Multiple future intervals preserve their distance from the last candle.
- Historical timestamps between known 15m candles still snap to the containing candle.
- A 1m/5m timestamp continues using normal interpolation/extrapolation.

Run the focused JavaScript regression check and `npm run build`. Manually verify a line, rectangle, and position tool can be placed past the last live candle on 15m and a higher timeframe, then confirm incoming candles do not collapse the anchors back to the live edge.
