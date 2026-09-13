import { decodeMexcSpotMessage } from './mexcProtobuf';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];
const FIRST_CANDLE_TIMEOUT = 10000;
const STALE_CANDLE_TIMEOUT = 45000;

const EXCHANGE_INTERVALS = {
  binance: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h',
    '1d': '1d', '1w': '1w', '1M': '1M',
  },
  bybit: {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
    '1d': 'D', '1w': 'W', '1M': 'M',
  },
  okx: {
    '1m': 'candle1m', '3m': 'candle3m', '5m': 'candle5m', '15m': 'candle15m', '30m': 'candle30m',
    '1h': 'candle1H', '2h': 'candle2H', '4h': 'candle4H', '6h': 'candle6H', '12h': 'candle12H',
    '1d': 'candle1D', '1w': 'candle1W', '1M': 'candle1M',
  },
  bingx: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h',
    '1d': '1d', '1w': '1w', '1M': '1M',
  },
  mexc: {
    '1m': 'Min1', '3m': 'Min3', '5m': 'Min5', '15m': 'Min15', '30m': 'Min30',
    '1h': 'Min60', '2h': 'Hour2', '4h': 'Hour4', '6h': 'Hour6', '12h': 'Hour12',
    '1d': 'Day1', '1w': 'Week1', '1M': 'Month1',
  },
};

// BingX Spot and BingX Perpetual are separate products that happen to share a
// `symbol@kline_interval` subscription string, and their interval vocabularies do
// not overlap: Spot rejects the `1m`/`4h` forms above outright with
// `dataType is error: <symbol>@kline_1m` and wants these instead. Verified against
// the live socket — `60min` is the only accepted spelling of one hour (`1h` and
// `1hour` are both refused), while 2h-12h want the `Nhour` form.
const BINGX_SPOT_INTERVALS = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '60min', '2h': '2hour', '4h': '4hour', '6h': '6hour', '12h': '12hour',
  '1d': '1day', '1w': '1week', '1M': '1mon',
};

function candle(time, open, high, low, close, volume = 0) {
  const normalized = {
    time: Math.floor(Number(time) > 9999999999 ? Number(time) / 1000 : Number(time)),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume ?? 0),
  };

  return Object.values(normalized).every(Number.isFinite) ? normalized : null;
}

async function decodeMessage(data) {
  if (typeof data === 'string') return data;
  if (!(data instanceof Blob) && !(data instanceof ArrayBuffer)) return '';

  const blob = data instanceof Blob ? data : new Blob([data]);
  if (typeof DecompressionStream === 'function') {
    try {
      return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } catch {}
  }
  return blob.text();
}

function buildAdapter({ exchange, category, symbol, exchangeSymbol, timeframe }) {
  const nativeSymbol = exchangeSymbol || symbol;
  const interval = EXCHANGE_INTERVALS[exchange]?.[timeframe];
  if (!interval) return null;

  if (exchange === 'binance') {
    return {
      url: category === 'spot'
        ? `wss://stream.binance.com:9443/ws/${nativeSymbol.toLowerCase()}@kline_${interval}`
        : `wss://fstream.binance.com/ws/${nativeSymbol.toLowerCase()}@kline_${interval}`,
      parse: (message) => {
        const kline = message?.k;
        return kline ? candle(kline.t, kline.o, kline.h, kline.l, kline.c, kline.v) : null;
      },
      error: (message) => message?.code != null && message?.msg ? message.msg : null,
    };
  }

  if (exchange === 'bybit') {
    return {
      url: `wss://stream.bybit.com/v5/public/${category === 'spot' ? 'spot' : category}`,
      subscribe: { op: 'subscribe', args: [`kline.${interval}.${nativeSymbol}`] },
      parse: (message) => {
        const row = message?.data?.[0];
        return row ? candle(row.start, row.open, row.high, row.low, row.close, row.volume) : null;
      },
      error: (message) => message?.success === false ? (message?.ret_msg || 'Bybit rejected the subscription.') : null,
    };
  }

  if (exchange === 'okx') {
    return {
      url: 'wss://ws.okx.com:8443/ws/v5/business',
      subscribe: { op: 'subscribe', args: [{ channel: interval, instId: nativeSymbol }] },
      parse: (message) => {
        const row = message?.data?.[0];
        return row ? candle(row[0], row[1], row[2], row[3], row[4], row[5]) : null;
      },
      error: (message) => message?.event === 'error' ? (message?.msg || 'OKX rejected the subscription.') : null,
    };
  }

  if (exchange === 'bingx') {
    const bingxSymbol = nativeSymbol.includes('-')
      ? nativeSymbol
      : nativeSymbol.replace(/(USDT|USDC|USD)$/i, '-$1');
    const isSpot = category === 'spot';
    const bingxInterval = isSpot ? BINGX_SPOT_INTERVALS[timeframe] : interval;
    if (!bingxInterval) return null;

    return {
      url: isSpot
        ? 'wss://open-api-ws.bingx.com/market'
        : 'wss://open-api-swap.bingx.com/swap-market',
      subscribe: { id: `kline-${Date.now()}`, reqType: 'sub', dataType: `${bingxSymbol}@kline_${bingxInterval}` },
      parse: (message) => {
        // Neither product sends `time`/`open`/`volume` keys. Spot nests a single
        // object at `data.K` and stamps the bucket as `t`; the swap market sends a
        // one-element `data` array that stamps it as `T`. Both use single-letter
        // OHLC keys, so the previous shared shape matched neither and every
        // message parsed to null — the socket looked connected and never ticked.
        const row = isSpot ? message?.data?.K : message?.data?.[0];
        if (!row) return null;
        return candle(isSpot ? row.t : row.T, row.o, row.h, row.l, row.c, row.v);
      },
      error: (message) => message?.code != null && Number(message.code) !== 0 ? (message?.msg || 'BingX rejected the subscription.') : null,
    };
  }

  if (exchange === 'mexc') {
    if (category === 'spot') {
      return {
        url: 'wss://wbs-api.mexc.com/ws',
        subscribe: { method: 'SUBSCRIPTION', params: [`spot@public.kline.v3.api.pb@${nativeSymbol}@${interval}`] },
        decode: decodeMexcSpotMessage,
        parse: (message) => {
          const row = message?.publicSpotKline;
          return row ? candle(row.windowStart, row.openingPrice, row.highestPrice, row.lowestPrice, row.closingPrice, row.volume) : null;
        },
        error: (message) => message?.code != null && Number(message.code) !== 0 ? (message?.msg || 'MEXC rejected the subscription.') : null,
      };
    }
    const contractInterval = {
      '1m': 'Min1', '3m': 'Min3', '5m': 'Min5', '15m': 'Min15', '30m': 'Min30',
      '1h': 'Min60', '2h': 'Hour2', '4h': 'Hour4', '6h': 'Hour6', '12h': 'Hour12',
      '1d': 'Day1', '1w': 'Week1', '1M': 'Month1',
    }[timeframe];
    return {
      url: 'wss://contract.mexc.com/edge',
      subscribe: { method: 'sub.kline', param: { symbol: nativeSymbol, interval: contractInterval } },
      parse: (message) => {
        // `push.kline` is single-letter keyed — `t` is the bucket in seconds,
        // `o/h/l/c` the prices and `q` the contract volume (`a` is quote turnover,
        // and `ro/rh/rl/rc` repeat the prices unrounded). None of `time`, `open`,
        // `vol` or `amount` exists on this payload.
        const row = message?.channel === 'push.kline' ? message?.data : null;
        return row ? candle(row.t, row.o, row.h, row.l, row.c, row.q) : null;
      },
      error: (message) => message?.success === false ? (message?.message || 'MEXC rejected the subscription.') : null,
    };
  }

  return null;
}

export function createLiveCandleStream(options) {
  const adapter = buildAdapter(options);
  let socket = null;
  let stopped = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let firstCandleTimer = null;
  let staleCandleTimer = null;
  let receivedCandle = false;

  const setStatus = (status) => options.onStatus?.(status);
  const reportError = (message, cause = null) => options.onError?.({ message, cause });

  const clearSocketTimers = () => {
    window.clearInterval(heartbeatTimer);
    window.clearTimeout(firstCandleTimer);
    window.clearTimeout(staleCandleTimer);
    heartbeatTimer = null;
    firstCandleTimer = null;
    staleCandleTimer = null;
  };

  const reconnectSocket = (message, cause = null) => {
    if (stopped) return;
    reportError(message, cause);
    setStatus('polling');
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
      socket.close();
    } else {
      scheduleReconnect();
    }
  };

  const armStaleCandleTimer = () => {
    window.clearTimeout(staleCandleTimer);
    staleCandleTimer = window.setTimeout(() => {
      reconnectSocket('The live candle stream became stale.');
    }, STALE_CANDLE_TIMEOUT);
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    window.clearTimeout(reconnectTimer);
    setStatus('reconnecting');
    const baseDelay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    const delay = Math.round(baseDelay * (0.8 + (Math.random() * 0.4)));
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(connect, delay);
  };

  const connect = () => {
    if (stopped || !adapter) {
      setStatus('polling');
      return;
    }

    try {
      receivedCandle = false;
      setStatus(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
      socket = new WebSocket(adapter.url);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        setStatus('connecting');
        options.onOpen?.();
        if (adapter.subscribe) socket.send(JSON.stringify(adapter.subscribe));
        firstCandleTimer = window.setTimeout(() => {
          if (!receivedCandle) reconnectSocket('The exchange connected but did not send a valid candle.');
        }, FIRST_CANDLE_TIMEOUT);
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState !== WebSocket.OPEN) return;
          if (options.exchange === 'bybit') socket.send(JSON.stringify({ op: 'ping' }));
          if (options.exchange === 'okx') socket.send('ping');
          if (options.exchange === 'bingx') socket.send('Ping');
          if (options.exchange === 'mexc') socket.send(JSON.stringify({ method: 'ping' }));
        }, 20000);
      };
      socket.onmessage = async (event) => {
        try {
          const text = adapter.decode ? null : await decodeMessage(event.data);
          if (text === 'Ping') {
            socket?.send('Pong');
            return;
          }
          if (text === 'pong') return;
          const message = adapter.decode ? await adapter.decode(event.data) : JSON.parse(text);
          if (!message) return;
          const subscriptionError = adapter.error?.(message);
          if (subscriptionError) {
            reconnectSocket(subscriptionError);
            return;
          }
          const nextCandle = adapter.parse(message);
          if (!nextCandle) return;
          receivedCandle = true;
          reconnectAttempt = 0;
          window.clearTimeout(firstCandleTimer);
          firstCandleTimer = null;
          setStatus('live');
          armStaleCandleTimer();
          options.onCandle?.(nextCandle);
        } catch (error) {
          reportError('Unable to parse a live exchange message.', error);
        }
      };
      socket.onerror = (error) => {
        reportError('The live exchange connection failed.', error);
        socket?.close();
      };
      socket.onclose = () => {
        clearSocketTimers();
        scheduleReconnect();
      };
    } catch {
      scheduleReconnect();
    }
  };

  connect();

  return () => {
    stopped = true;
    window.clearTimeout(reconnectTimer);
    clearSocketTimers();
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  };
}
