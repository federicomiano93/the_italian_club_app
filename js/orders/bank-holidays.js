// bank-holidays.js — UK bank holidays (England & Wales).
//
// Source of truth is the official gov.uk calendar (always correct, including
// one-off holidays). It is fetched at startup, cached in localStorage for
// offline use, and falls back to a built-in 2025-2026 list if the network and
// cache are both unavailable. Used by Phase 6 alerts (a week-before notice and
// a delivery-day-conflict notice). It does NOT affect order suggestions.

const SOURCE_URL = 'https://www.gov.uk/bank-holidays.json';
const CACHE_KEY = 'uk-bank-holidays';

// Built-in fallback so the app still works offline before the first fetch.
const FALLBACK_HOLIDAYS = [
  '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
];

function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
}

// Current list: cached official dates if present, otherwise the fallback.
let holidays = loadFromCache() || FALLBACK_HOLIDAYS.slice();

// Fetch the official calendar and refresh the cache. Safe to call fire-and-forget;
// on any failure the cached/fallback list is kept. Resolves to the active list.
export async function refreshBankHolidays() {
  try {
    const res = await fetch(SOURCE_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const events = data['england-and-wales']?.events || [];
    const dates = events.map(e => e.date).filter(Boolean);
    if (dates.length) {
      holidays = dates;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(dates)); } catch { /* storage full/blocked */ }
    }
  } catch (err) {
    console.warn('Bank holidays: keeping cached/fallback list —', err.message);
  }
  return holidays;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Is there a UK bank holiday within the next `days` days (from tomorrow)?
export function isBankHolidayWithinNextDays(from = new Date(), days = 7) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  for (let i = 1; i <= days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (holidays.includes(toISODate(d))) return true;
  }
  return false;
}

// The next bank holiday on/after `from` as an ISO string, or null.
export function nextBankHoliday(from = new Date()) {
  const today = toISODate(new Date(from.getFullYear(), from.getMonth(), from.getDate()));
  return holidays.slice().sort().find(h => h >= today) || null;
}

// Is the given ISO date (YYYY-MM-DD) a bank holiday?
export function isBankHoliday(isoDate) {
  return holidays.includes(isoDate);
}
