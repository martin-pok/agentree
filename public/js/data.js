import { startOfDay, hourTs, DAY, H, WEEKDAYS, WEEKDAYS_FULL, timeHM } from './format.js';
import { PROVIDERS, pkey } from './icons.js';

export const sessionTotal = (s) => (s.tokens?.input || 0) + (s.tokens?.output || 0) + (s.tokens?.cacheWrite || 0);

export const STATUS_ORDER = { needs_input: 0, limited: 1, working: 2, waiting: 3, idle: 4, archived: 5 };

export const CATEGORICAL = ['#D97757', '#16141D', '#22A38C', '#C2335A', '#4285F4', '#8250DF', '#C99A3E', '#1F8A96', '#615CED', '#8C8896'];

export function tokensSince(sessions, since, pred) {
  let sum = 0;
  for (const s of sessions) {
    if (pred && !pred(s)) continue;
    for (const k in s.hourly) if (hourTs(k) >= since) sum += s.hourly[k];
  }
  return sum;
}

export function periodBuckets(period, now) {
  if (period === 'day') {
    const h0 = Math.floor(now / H) * H - 23 * H;
    const starts = Array.from({ length: 24 }, (_, i) => h0 + i * H);
    return {
      starts,
      since: h0,
      indexOf: (ts) => Math.floor((ts - h0) / H),
      labels: starts.map((t) => timeHM(t)),
      tips: starts.map((t) => `${timeHM(t)}–${timeHM(t + H)}`),
    };
  }
  const days = period === 'month' ? 30 : 7;
  const today = startOfDay(now);
  const starts = Array.from({ length: days }, (_, i) => startOfDay(today - (days - 1 - i) * DAY + 2 * H));
  const index = new Map(starts.map((t, i) => [t, i]));
  return {
    starts,
    since: starts[0],
    indexOf: (ts) => index.get(startOfDay(ts)) ?? -1,
    labels: starts.map((t) => {
      const d = new Date(t);
      return days === 7 ? `${WEEKDAYS[d.getDay()]} ${d.getDate()}.` : `${d.getDate()}. ${d.getMonth() + 1}.`;
    }),
    tips: starts.map((t) => {
      const d = new Date(t);
      return `${WEEKDAYS_FULL[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
    }),
  };
}

export function providerSeries(sessions, period, now, hidden = new Set()) {
  const b = periodBuckets(period, now);
  const data = new Map();
  for (const s of sessions) {
    const key = pkey(s.provider);
    for (const k in s.hourly) {
      const i = b.indexOf(hourTs(k));
      if (i < 0 || i >= b.starts.length) continue;
      if (!data.has(key)) data.set(key, new Array(b.starts.length).fill(0));
      data.get(key)[i] += s.hourly[k];
    }
  }
  const keys = Object.keys(PROVIDERS).filter((k) => data.has(k));
  return {
    ...b,
    series: keys.map((k) => ({ key: k, label: PROVIDERS[k].label, color: PROVIDERS[k].color, stroke: PROVIDERS[k].ink, values: data.get(k), hidden: hidden.has(k) })),
  };
}

// Mřížka den v týdnu (pondělí první) × hodina.
export function heatGrid(sessions, now, days = 30) {
  const since = startOfDay(now - (days - 1) * DAY);
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const s of sessions) {
    for (const k in s.hourly) {
      const ts = hourTs(k);
      if (ts < since) continue;
      const d = new Date(ts);
      grid[(d.getDay() + 6) % 7][d.getHours()] += s.hourly[k];
    }
  }
  return grid;
}

export function groupTotals(sessions, since, keyOf) {
  const m = new Map();
  for (const s of sessions) {
    const value = tokensSince([s], since);
    if (!value) continue;
    const key = keyOf(s);
    if (!key) continue;
    const cur = m.get(key) || { key, value: 0, provider: pkey(s.provider), count: 0 };
    cur.value += value;
    cur.count++;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}

export function activeHours(sessions, since) {
  const set = new Set();
  for (const s of sessions) for (const k in s.hourly) if (s.hourly[k] > 0 && hourTs(k) >= since) set.add(k);
  return set.size;
}

export function isActiveSince(s, since) {
  if (s.lastAt >= since) return true;
  for (const k in s.hourly) if (hourTs(k) >= since) return true;
  return false;
}
