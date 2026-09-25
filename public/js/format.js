import { tr, mnozne, LOCALE, podleJazyka } from './i18n.js';

export const MIN = 60e3;
export const H = 3600e3;
export const DAY = 86400e3;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const norm = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const ODDELOVAC = podleJazyka(',', '.');
const dec = (n, d) => n.toFixed(d).replace('.', ODDELOVAC).replace(/[.,]0+$/, '');

export function fmtTok(n) {
  n = Math.max(0, Math.round(n || 0));
  if (n < 1000) return String(n);
  if (n < 1e6) return podleJazyka(`${dec(n / 1e3, n < 1e4 ? 1 : 0)} tis.`, `${dec(n / 1e3, n < 1e4 ? 1 : 0)}k`);
  if (n < 1e9) return `${dec(n / 1e6, n < 1e7 ? 2 : 1)} M`;
  return podleJazyka(`${dec(n / 1e9, 2)} mld.`, `${dec(n / 1e9, 2)} bn`);
}

export function fmtAxis(n) {
  if (n >= 1e9) return `${dec(n / 1e9, 1)}B`;
  if (n >= 1e6) return `${dec(n / 1e6, 1)}M`;
  if (n >= 1e3) return `${dec(n / 1e3, 1)}k`;
  return String(Math.round(n));
}

export const fmtNum = (n) => Math.round(n || 0).toLocaleString(LOCALE);

export function fmtMoney(v, currency = 'CZK', { compact = false } = {}) {
  const opts = { style: 'currency', currency, maximumFractionDigits: currency === 'CZK' ? 0 : 2, minimumFractionDigits: 0 };
  if (compact && Math.abs(v) >= 10000) {
    opts.notation = 'compact';
    opts.maximumFractionDigits = 1;
  }
  try {
    return new Intl.NumberFormat(LOCALE, opts).format(v || 0);
  } catch {
    return `${fmtNum(v)} ${currency}`;
  }
}

// Tvar slova podle počtu; v angličtině ze slovníku (viz i18n.js).
export const plural = mnozne;

export function rel(ts, now = Date.now()) {
  if (!ts) return '–';
  const d = now - ts;
  if (d < 45e3) return tr('právě teď');
  // Číslo a jednotka se v české sazbě nerozdělují na dva řádky – proto nezlomitelná mezera.
  if (d < H) return tr('před {0}\u00a0min', Math.max(1, Math.round(d / MIN)));
  if (d < DAY) return tr('před {0}\u00a0h', Math.round(d / H));
  if (d < 2 * DAY) return tr('včera');
  return tr('před {0}\u00a0dny', Math.round(d / DAY));
}

export function dur(ms) {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

// Krátká doba běhu: „23 s“, „4 min 12 s“, „2 h 5 min“.
export function durShort(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return m < 10 && s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  return dur(ms);
}

export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
}

export const dateTime = (ts) =>
  ts ? new Date(ts).toLocaleString(LOCALE, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
export const dateLong = (ts) => new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric', year: 'numeric' });
export const timeHM = (ts) => new Date(ts).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
// Cesty chodí ze serveru tak, jak je napsal systém uživatele: na Macu a Linuxu
// „/Users/jana/web“, na Windows „C:\\Users\\jana\\web“ nebo „\\\\server\\sdileni“.
// Rozhraní je jedno a totéž, takže musí umět obojí – jinak by se na Windows ztratila
// tlačítka u session i návrhy projektů, protože nic „nezačíná lomítkem“.
export const jeAbsolutniCesta = (p) => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(String(p || ''));

/** Rozdělí cestu na části bez ohledu na to, jakým oddělovačem je psaná. */
export const castiCesty = (p) => String(p || '').split(/[\\/]+/).filter(Boolean);

export const shortPath = (p) => String(p || '').replace(/^(\/Users\/[^/]+|[A-Za-z]:\\Users\\[^\\]+|\/home\/[^/]+)/, '~');

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name || '?').slice(0, 2).toUpperCase();
}

export const WEEKDAYS = podleJazyka(['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
export const WEEKDAYS_FULL = podleJazyka(['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'], ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
export const MONTHS = podleJazyka(['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'], ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
export const MONTHS_SHORT = podleJazyka(['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

export const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
export const hourTs = (key) => Date.parse(`${key}:00:00Z`);

export function localDate(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function resetsLabel(ts, now = Date.now()) {
  if (!ts) return '';
  const d = new Date(ts);
  // Jednopísmenná předložka „v“ nezůstává na konci řádku a datum se nerozděluje – česká sazba.
  if (startOfDay(ts) === startOfDay(now)) return tr('dnes v\u00a0{0}', timeHM(ts));
  if (startOfDay(ts) === startOfDay(now + DAY)) return tr('zítra v\u00a0{0}', timeHM(ts));
  return tr('{0} {1}.\u00a0{2}. v\u00a0{3}', WEEKDAYS[d.getDay()], d.getDate(), d.getMonth() + 1, timeHM(ts));
}

export const STATUS = {
  needs_input: { label: tr('Potřebuje tebe') },
  limited: { label: tr('Vyčerpaný limit') },
  failed: { label: tr('Selhalo') },
  working: { label: tr('Pracuje') },
  waiting: { label: tr('Čeká na zadání') },
  idle: { label: tr('Nečinný') },
  archived: { label: tr('Archiv') },
};
