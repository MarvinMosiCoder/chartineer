import { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText } from 'lucide-react';
import { IconTooltipButton } from '../../Tooltip/AnchoredTooltip';

const TABS = [
  { key: 'positions', label: 'Positions' },
  { key: 'openOrders', label: 'Open Orders' },
  { key: 'orderHistory', label: 'Order History' },
  { key: 'positionHistory', label: 'Position History' },
  { key: 'tradeHistory', label: 'Trade History' },
];

const ORDER_TYPE_LABELS = {
  market: ['Market', 'IOC'],
  limit: ['Limit', 'GTC'],
  trigger: ['Trigger', 'GTC'],
  conditional: ['Trigger', 'GTC'],
};

function formatNum(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '---';
  return number.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatOrderTime(epochSeconds) {
  const seconds = Number(epochSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return '---';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '---';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function estimateLiquidationPrice(position) {
  if (position?.category === 'spot') return null;
  const entry = Number(position?.entryPrice);
  const leverage = Number(position?.leverage);
  if (!Number.isFinite(entry) || !Number.isFinite(leverage) || leverage <= 0) return null;
  const buffer = 1 / leverage;
  return position?.side === 'short' ? entry * (1 + buffer) : entry * (1 - buffer);
}

function positionSideLabel(item) {
  if (item?.category === 'spot') return 'Buy';
  return item?.side === 'short' ? 'Short' : 'Long';
}

function computeRoi(position, pnl) {
  const margin = Number(position?.margin);
  if (!Number.isFinite(margin) || margin <= 0 || pnl == null || !Number.isFinite(Number(pnl))) return null;
  return (Number(pnl) / margin) * 100;
}

function getBaseAsset(symbol, quoteCurrency) {
  if (!symbol) return '';
  const quote = (quoteCurrency ?? 'USDT').toUpperCase();
  return symbol.toUpperCase().endsWith(quote) ? symbol.slice(0, symbol.length - quote.length) : symbol;
}

function getTakerOrMaker(order) {
  if (order.action === 'close') return 'Taker';
  return order.orderType === 'market' ? 'Taker' : 'Maker';
}

function EmptyState({ label = 'No Data', isDark }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg border ${isDark ? 'border-gray-700 text-gray-600' : 'border-slate-300 text-slate-400'}`}>
        <FileText size={20} />
      </div>
      <span className={`text-sm ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

export default function PositionsPanel({
  backtestAccount,
  symbol,
  executionPrice,
  chartTheme,
  onClosePosition,
  onCancelOrder,
}) {
  const [activeTab, setActiveTab] = useState('positions');
  const [orderHistory, setOrderHistory] = useState([]);
  const [isOrderHistoryLoading, setIsOrderHistoryLoading] = useState(false);
  const [orderHistoryError, setOrderHistoryError] = useState('');
  const [positionHistory, setPositionHistory] = useState([]);
  const [isPositionHistoryLoading, setIsPositionHistoryLoading] = useState(false);
  const [positionHistoryError, setPositionHistoryError] = useState('');
  const isDark = chartTheme?.mode !== 'light';

  const openPositions = backtestAccount?.openPositions ?? [];
  const pendingPositions = backtestAccount?.pendingPositions ?? [];
  const quoteCurrency = backtestAccount?.quoteCurrency ?? 'USDT';
  const activeSessionId = backtestAccount?.activeSession?.id ?? null;

  useEffect(() => {
    if (!['orderHistory', 'tradeHistory'].includes(activeTab)) return;

    let cancelled = false;
    setIsOrderHistoryLoading(true);
    setOrderHistoryError('');

    axios
      .get('/market-backtest/order-history', { params: { session_id: activeSessionId ?? undefined } })
      .then((response) => {
        if (cancelled) return;
        setOrderHistory(response.data?.orders ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setOrderHistoryError(err.response?.data?.message ?? err.message ?? 'Failed to load order history');
      })
      .finally(() => {
        if (!cancelled) setIsOrderHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeSessionId]);

  useEffect(() => {
    if (activeTab !== 'positionHistory') return;

    let cancelled = false;
    setIsPositionHistoryLoading(true);
    setPositionHistoryError('');

    axios
      .get('/market-backtest/report', { params: { session_id: activeSessionId ?? undefined, limit: 50 } })
      .then((response) => {
        if (cancelled) return;
        setPositionHistory(response.data?.trades ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setPositionHistoryError(err.response?.data?.message ?? err.message ?? 'Failed to load position history');
      })
      .finally(() => {
        if (!cancelled) setIsPositionHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeSessionId]);

  const tabCounts = {
    positions: openPositions.length,
    openOrders: pendingPositions.length,
    bots: 0,
  };

  const headerClass = isDark ? 'text-gray-500' : 'text-slate-500';
  const cellClass = isDark ? 'text-gray-200' : 'text-slate-800';
  const rowBorderClass = isDark ? 'border-gray-800' : 'border-slate-200';

  return (
    <div className={`mt-2 flex min-h-[240px] flex-col rounded-lg border ${isDark ? 'border-gray-800 bg-[#151617]' : 'border-slate-200 bg-white'}`}>
      <div className={`flex items-center gap-5 overflow-x-auto border-b px-3 ${rowBorderClass}`}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`relative -mb-px whitespace-nowrap border-b-2 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? isDark
                  ? 'border-white text-white'
                  : 'border-slate-900 text-slate-900'
                : isDark
                  ? 'border-transparent text-gray-500 hover:text-gray-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] != null ? ` (${tabCounts[tab.key]})` : ''}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-x-auto">
        {activeTab === 'positions' && (
          openPositions.length ? (
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <thead>
                <tr className={headerClass}>
                  {['Symbol', 'Side', 'Size', 'Entry Price', 'Mark Price', 'PnL (ROI%)', 'Margin', 'Liq. Price (est.)', 'TP / SL', ''].map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-2 font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openPositions.map((position) => {
                  const isActiveSymbol = position.symbol === symbol;
                  const markPrice = isActiveSymbol ? Number(executionPrice) : null;
                  const pnl = position.unrealizedPnl;
                  const roi = computeRoi(position, pnl);
                  const liqPrice = estimateLiquidationPrice(position);
                  const pnlPositive = Number(pnl) >= 0;

                  return (
                    <tr key={position.id} className={`border-t ${rowBorderClass}`}>
                      <td className={`px-3 py-2.5 font-semibold ${cellClass}`}>{position.symbol}</td>
                      <td className={`px-3 py-2.5 font-semibold ${position.side === 'short' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {positionSideLabel(position)}
                      </td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(position.quantity, 4)}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(position.entryPrice)}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{markPrice != null && Number.isFinite(markPrice) ? formatNum(markPrice) : '---'}</td>
                      <td className={`px-3 py-2.5 font-semibold ${pnl == null ? cellClass : pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnl == null ? '---' : `${pnlPositive ? '+' : ''}${formatNum(pnl)} ${quoteCurrency}`}
                        {roi != null ? <span className="ml-1 opacity-80">({pnlPositive ? '+' : ''}{formatNum(roi)}%)</span> : null}
                      </td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(position.margin)} {quoteCurrency}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{liqPrice != null ? formatNum(liqPrice) : '---'}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>
                        {position.takeProfit ? formatNum(position.takeProfit) : '--'} / {position.stopLoss ? formatNum(position.stopLoss) : '--'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <IconTooltipButton
                          label={isActiveSymbol ? 'Close position' : `Switch to ${position.symbol} to close`}
                          isDark={isDark}
                          onClick={() => isActiveSymbol && onClosePosition?.(position.id)}
                          disabled={!isActiveSymbol}
                          className={`rounded border px-2.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                            isDark ? 'border-gray-700 text-gray-200 hover:bg-white/10' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Close
                        </IconTooltipButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState isDark={isDark} />
          )
        )}

        {activeTab === 'openOrders' && (
          pendingPositions.length ? (
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className={headerClass}>
                  {['Symbol', 'Side', 'Trigger Price', 'Size', 'Margin', 'SL', 'TP', ''].map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-2 font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingPositions.map((position) => (
                  <tr key={position.id} className={`border-t ${rowBorderClass}`}>
                    <td className={`px-3 py-2.5 font-semibold ${cellClass}`}>{position.symbol}</td>
                    <td className={`px-3 py-2.5 font-semibold ${position.side === 'short' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {positionSideLabel(position)}
                    </td>
                    <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(position.entryPrice)}</td>
                    <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(position.quantity, 4)}</td>
                    <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(position.margin)} {quoteCurrency}</td>
                    <td className={`px-3 py-2.5 ${cellClass}`}>{position.stopLoss ? formatNum(position.stopLoss) : '--'}</td>
                    <td className={`px-3 py-2.5 ${cellClass}`}>{position.takeProfit ? formatNum(position.takeProfit) : '--'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onCancelOrder?.(position.id)}
                        className={`rounded border px-2.5 py-1 text-[11px] font-semibold ${
                          isDark ? 'border-gray-700 text-gray-200 hover:bg-white/10' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState isDark={isDark} />
          )
        )}

        {activeTab === 'orderHistory' && (
          isOrderHistoryLoading ? (
            <EmptyState label="Loading..." isDark={isDark} />
          ) : orderHistoryError ? (
            <EmptyState label={orderHistoryError} isDark={isDark} />
          ) : orderHistory.length ? (
            <table className="w-full min-w-[980px] border-collapse text-left text-xs">
              <thead>
                <tr className={headerClass}>
                  {['Futures', 'Order Time', 'Side', 'Type / Expiration', 'Avg. Price / Price', 'Filled / Quantity', 'PnL', 'Fees', 'Reduce Only', 'Status'].map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-2 font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderHistory.map((order) => {
                  const [typeLabel, expiryLabel] = ORDER_TYPE_LABELS[order.orderType] ?? ORDER_TYPE_LABELS.market;
                  const isSpotOrder = order.category === 'spot';
                  const orderSideLabel = `${order.action === 'close' ? 'Close' : 'Open'} ${positionSideLabel(order)}`;
                  const pnl = order.pnl;
                  const pnlPositive = Number(pnl) >= 0;
                  const isCancelled = order.status === 'cancelled';

                  return (
                    <tr key={order.id} className={`border-t ${rowBorderClass}`}>
                      <td className={`px-3 py-2.5 ${cellClass}`}>
                        <div className="font-semibold">{order.symbol}</div>
                        <div className="mt-1 flex items-center gap-1 text-[10px]">
                          {!isSpotOrder && (
                            <span className={`rounded px-1.5 py-0.5 ${isDark ? 'bg-white/10 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>Isolated</span>
                          )}
                          {!isSpotOrder && order.leverage != null && (
                            <span className={`rounded px-1.5 py-0.5 ${isDark ? 'bg-white/10 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>{formatNum(order.leverage, 0)}X</span>
                          )}
                          {order.hasStopLoss && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-400">SL</span>}
                          {order.hasTakeProfit && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">TP</span>}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2.5 ${cellClass}`}>{formatOrderTime(order.time)}</td>
                      <td className={`px-3 py-2.5 font-semibold ${order.action === 'close' ? 'text-red-400' : 'text-emerald-400'}`}>{orderSideLabel}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>
                        <div>{typeLabel}</div>
                        <div className="opacity-70">{expiryLabel}</div>
                      </td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>
                        <div>{order.avgPrice != null ? `${formatNum(order.avgPrice)} ${quoteCurrency}` : `0.00 ${quoteCurrency}`}</div>
                        <div className="opacity-70">{order.targetPrice != null ? `${formatNum(order.targetPrice)} ${quoteCurrency}` : 'Market'}</div>
                      </td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>
                        <div>{formatNum(order.filledQuantity, 4)}</div>
                        <div className="opacity-70">{formatNum(order.quantity, 4)}</div>
                      </td>
                      <td className={`px-3 py-2.5 font-semibold ${pnl == null ? cellClass : pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatNum(pnl ?? 0, 8)}
                      </td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(order.fee, 8)} {quoteCurrency}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>No</td>
                      <td className={`px-3 py-2.5 font-semibold ${isCancelled ? (isDark ? 'text-gray-400' : 'text-slate-500') : 'text-emerald-400'}`}>
                        {isCancelled ? 'Cancelled' : 'Complete'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState isDark={isDark} />
          )
        )}

        {activeTab === 'tradeHistory' && (() => {
          const fills = orderHistory.filter((order) => order.status !== 'cancelled');

          return isOrderHistoryLoading ? (
            <EmptyState label="Loading..." isDark={isDark} />
          ) : orderHistoryError ? (
            <EmptyState label={orderHistoryError} isDark={isDark} />
          ) : fills.length ? (
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead>
                <tr className={headerClass}>
                  {['Futures', 'Date', 'Side', 'Average Price', 'Volume', 'Closed Value', 'Realized PnL', 'Fee', 'Taker / Maker'].map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-2 font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fills.map((order) => {
                  const isSpotOrder = order.category === 'spot';
                  const orderSideLabel = `${order.action === 'close' ? 'Close' : 'Open'} ${positionSideLabel(order)}`;
                  const pnl = order.pnl;
                  const pnlPositive = Number(pnl) >= 0;

                  return (
                    <tr key={order.id} className={`border-t ${rowBorderClass}`}>
                      <td className={`px-3 py-2.5 ${cellClass}`}>
                        <div className="font-semibold">{order.symbol}</div>
                        <div className="mt-1 flex items-center gap-1 text-[10px]">
                          {!isSpotOrder && (
                            <span className={`rounded px-1.5 py-0.5 ${isDark ? 'bg-white/10 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>Isolated</span>
                          )}
                          {!isSpotOrder && order.leverage != null && (
                            <span className={`rounded px-1.5 py-0.5 ${isDark ? 'bg-white/10 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>{formatNum(order.leverage, 0)}X</span>
                          )}
                          {order.hasStopLoss && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-400">SL</span>}
                          {order.hasTakeProfit && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">TP</span>}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2.5 ${cellClass}`}>{formatOrderTime(order.time)}</td>
                      <td className={`px-3 py-2.5 font-semibold ${order.action === 'close' ? 'text-red-400' : 'text-emerald-400'}`}>{orderSideLabel}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(order.avgPrice)}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(order.filledQuantity, 4)} {getBaseAsset(order.symbol, quoteCurrency)}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{order.notional != null ? `${formatNum(order.notional)} ${quoteCurrency}` : '---'}</td>
                      <td className={`px-3 py-2.5 font-semibold ${pnl == null ? cellClass : pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatNum(pnl ?? 0, 8)} {quoteCurrency}
                      </td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{formatNum(order.fee, 8)} {quoteCurrency}</td>
                      <td className={`px-3 py-2.5 ${cellClass}`}>{getTakerOrMaker(order)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState isDark={isDark} />
          );
        })()}

        {activeTab === 'positionHistory' && (
          isPositionHistoryLoading ? (
            <EmptyState label="Loading..." isDark={isDark} />
          ) : positionHistoryError ? (
            <EmptyState label={positionHistoryError} isDark={isDark} />
          ) : positionHistory.length ? (
            <div className="flex flex-col divide-y" style={{ borderColor: 'inherit' }}>
              {positionHistory.map((position) => {
                const pnlPositive = Number(position.pnl) >= 0;
                const pnlColor = pnlPositive ? 'text-emerald-400' : 'text-red-400';

                return (
                  <div key={position.id} className={`border-t px-3 py-3 first:border-t-0 ${rowBorderClass}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-semibold ${cellClass}`}>{position.symbol}</span>
                        <span className={`font-semibold ${position.side === 'short' ? 'text-red-400' : 'text-emerald-400'}`}>
                          {positionSideLabel(position)}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${isDark ? 'bg-white/10 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>Isolated</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${isDark ? 'bg-white/10 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>{formatNum(position.leverage, 0)}X</span>
                      </div>
                      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>Closed</span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                      <div>
                        <div className={headerClass}>Time Opened</div>
                        <div className={`font-semibold ${cellClass}`}>{formatOrderTime(position.openedAtTime)}</div>
                        <div className={`mt-1.5 ${headerClass}`}>Time Closed</div>
                        <div className={`font-semibold ${cellClass}`}>{formatOrderTime(position.closedAtTime)}</div>
                      </div>
                      <div>
                        <div className={headerClass}>Entry Price</div>
                        <div className={`font-semibold ${cellClass}`}>{formatNum(position.entryPrice)} {quoteCurrency}</div>
                        <div className={`mt-1.5 ${headerClass}`}>Close Price</div>
                        <div className={`font-semibold ${cellClass}`}>{position.exitPrice != null ? `${formatNum(position.exitPrice)} ${quoteCurrency}` : '---'}</div>
                      </div>
                      <div>
                        <div className={headerClass}>Position PnL</div>
                        <div className={`font-semibold ${pnlColor}`}>{formatNum(position.pnl, 8)} {quoteCurrency}</div>
                        <div className={`mt-1.5 ${headerClass}`}>ROI</div>
                        <div className={`font-semibold ${pnlColor}`}>{pnlPositive ? '+' : ''}{formatNum(position.pnlPercent)}%</div>
                      </div>
                      <div>
                        <div className={headerClass}>Max held</div>
                        <div className={`font-semibold ${cellClass}`}>{formatNum(position.quantity, 4)} {getBaseAsset(position.symbol, quoteCurrency)}</div>
                        <div className={`mt-1.5 ${headerClass}`}>Closed Qty.</div>
                        <div className={`font-semibold ${cellClass}`}>{formatNum(position.quantity, 4)} {getBaseAsset(position.symbol, quoteCurrency)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState isDark={isDark} />
          )
        )}

        {!['positions', 'openOrders', 'orderHistory', 'tradeHistory', 'positionHistory'].includes(activeTab) && (
          <EmptyState label="Coming soon" isDark={isDark} />
        )}
      </div>
    </div>
  );
}
