// Market session windows for the chart overlay and the status-bar badge.
//
// These mirror `app/Services/MarketSessionService.php`, which does the same job
// for the trade report so both surfaces agree on where a session starts. Change
// one and you must change the other — the PHP test and `marketSessions.test.js`
// each pin the resulting UTC boundaries in winter and summer to catch a drift.
//
// Windows are local trading hours in the session's own zone, not fixed UTC
// offsets, so London and New York follow BST/EDT instead of sliding by an hour
// for half the year. Bounds are minutes from local midnight.

export const MARKET_SESSIONS = {
  asian: { label: 'Asian', short: 'ASIA', timeZone: 'Asia/Tokyo', start: 540, end: 1080, color: '#f59e0b' },
  london: { label: 'London', short: 'LDN', timeZone: 'Europe/London', start: 480, end: 1020, color: '#3b82f6' },
  newYork: { label: 'New York', short: 'NY', timeZone: 'America/New_York', start: 480, end: 1020, color: '#22c55e' },
};

export const SESSION_KEYS = Object.keys(MARKET_SESSIONS);

export const OVERLAP_LABEL = 'London / New York';
export const OVERLAP_SHORT = 'LDN/NY';
export const OFF_SESSION_LABEL = 'Off-session';
export const OFF_SESSION_SHORT = 'OFF';

// Most specific first: an overlapping instant reads as New York, not London.
const LABEL_PRIORITY = ['newYork', 'london', 'asian'];

const DAY_MS = 86400000;

// A visible range wider than this stops being worth walking day by day; the
// chart gates on timeframe long before it gets here, this is just a backstop.
const MAX_DAYS_PER_SESSION = 400;

const formatters = new Map();

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }

  return formatter;
}

function zonedParts(timeZone, ms) {
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const out = {};

  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }

  return out;
}

function offsetMinutes(timeZone, ms) {
  const parts = zonedParts(timeZone, ms);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUtc - Math.floor(ms / 1000) * 1000) / 60000;
}

/** UTC instant of a local wall-clock time on a given local calendar date. */
function zonedTimeToUtc(timeZone, year, month, day, minutesFromMidnight) {
  const naive = Date.UTC(year, month - 1, day) + (minutesFromMidnight * 60000);
  const firstPass = naive - (offsetMinutes(timeZone, naive) * 60000);

  // Re-resolve against the corrected instant: the first sample reads the wrong
  // side of the offset when the window straddles a DST transition.
  return naive - (offsetMinutes(timeZone, firstPass) * 60000);
}

function withinWindow(minutes, start, end) {
  // A window that wraps past local midnight (start > end) is open on both sides
  // of the boundary. None of the built-ins wrap today, but Sydney would.
  return start <= end
    ? (minutes >= start && minutes < end)
    : (minutes >= start || minutes < end);
}

/** Session keys open at this instant, in definition order. */
export function sessionsActiveAt(timeSeconds) {
  const ms = Number(timeSeconds) * 1000;
  if (!Number.isFinite(ms)) return [];

  return SESSION_KEYS.filter((key) => {
    const definition = MARKET_SESSIONS[key];
    const parts = zonedParts(definition.timeZone, ms);
    return withinWindow((parts.hour * 60) + parts.minute, definition.start, definition.end);
  });
}

/**
 * Single label for a moment. London and New York open together for several
 * hours and that overlap is the highest-volume window of the day, so it reads
 * as its own thing rather than being absorbed into New York.
 */
export function resolveSession(timeSeconds) {
  const active = sessionsActiveAt(timeSeconds);

  if (active.includes('london') && active.includes('newYork')) {
    return { key: 'londonNewYork', label: OVERLAP_LABEL, short: OVERLAP_SHORT, color: MARKET_SESSIONS.newYork.color, active };
  }

  for (const key of LABEL_PRIORITY) {
    if (active.includes(key)) {
      const definition = MARKET_SESSIONS[key];
      return { key, label: definition.label, short: definition.short, color: definition.color, active };
    }
  }

  return { key: 'off', label: OFF_SESSION_LABEL, short: OFF_SESSION_SHORT, color: null, active };
}

/**
 * Contiguous [start, end) windows for each enabled session across a time range,
 * clipped to that range. Walks local calendar days in each session's own zone,
 * because a Tokyo day and a UTC day do not line up and the window is defined in
 * local time.
 */
export function buildSessionSegments(fromSeconds, toSeconds, enabledKeys = SESSION_KEYS) {
  const fromMs = Number(fromSeconds) * 1000;
  const toMs = Number(toSeconds) * 1000;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];

  const segments = [];

  for (const key of enabledKeys) {
    const definition = MARKET_SESSIONS[key];
    if (!definition) continue;

    const anchor = zonedParts(definition.timeZone, fromMs);
    // Start a day early so a window already open at fromMs is not missed.
    let cursor = Date.UTC(anchor.year, anchor.month - 1, anchor.day) - DAY_MS;
    const limit = toMs + DAY_MS;
    let days = 0;

    while (cursor <= limit && days < MAX_DAYS_PER_SESSION) {
      const date = new Date(cursor);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();

      const openMs = zonedTimeToUtc(definition.timeZone, year, month, day, definition.start);
      let closeMs = zonedTimeToUtc(definition.timeZone, year, month, day, definition.end);
      if (closeMs <= openMs) closeMs += DAY_MS;

      const start = Math.max(openMs, fromMs);
      const end = Math.min(closeMs, toMs);

      if (end > start) {
        segments.push({
          key,
          label: definition.label,
          short: definition.short,
          color: definition.color,
          start: start / 1000,
          end: end / 1000,
        });
      }

      cursor += DAY_MS;
      days += 1;
    }
  }

  return segments.sort((a, b) => a.start - b.start);
}
