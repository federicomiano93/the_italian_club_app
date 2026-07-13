// day.js — local-day helpers for the Orders system.
//
// An order is filed under the DAY it was placed ("2026-07-13"), per supplier.
// Everything here works in LOCAL time: the bakery's day is the day the operator
// sees on the wall, not a UTC day. Two rules keep BST from shifting a date:
//   - never `new Date('2026-07-13')` — that parses as UTC midnight, which is the
//     previous day locally for any negative offset. Always parse with an explicit
//     time (`T00:00:00`), which the spec reads as local.
//   - move by days with setDate(), never by adding 86 400 000 ms (a DST day is
//     23 or 25 hours long).
// Comparing two "YYYY-MM-DD" strings with < is exact, so isBefore is a string
// compare on purpose.

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A Date → "YYYY-MM-DD", read with local getters.
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "YYYY-MM-DD" → a Date at local midnight (see the T00:00:00 note above).
export function parseISODate(iso) {
  return new Date(`${iso}T00:00:00`);
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

// `days` may be negative. DST-safe.
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// True when ISO day `a` falls strictly before ISO day `b`.
export function isBefore(a, b) {
  return Boolean(a) && Boolean(b) && String(a) < String(b);
}

// The weekday NAME of an ISO day ("Monday"), matching the supplier orderDays /
// deliveryDays vocabulary used across the Orders feature.
export function weekdayOf(iso) {
  return WEEKDAY_LONG[parseISODate(iso).getDay()];
}

// A day spelled out: "Mon 6 Jul 2026". Formatted by hand rather than with
// toLocaleDateString, so the output is identical on every device and locale (and
// assertable in a test).
export function spellDay(iso) {
  if (!iso) return '';
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// Human label for a day section: "Today" / "Yesterday" / "Mon 6 Jul 2026".
export function dayLabel(iso, now = new Date()) {
  if (!iso) return '';
  if (iso === toISODate(now)) return 'Today';
  if (iso === toISODate(addDays(now, -1))) return 'Yesterday';
  return spellDay(iso);
}

// The local day an ISO TIMESTAMP (e.g. draft.updatedAt, "2026-07-12T21:04:00Z")
// happened on. Used as the fallback stamp for a draft written before the app
// started recording a per-supplier day. Returns '' when there is nothing to read.
export function localDayOf(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? '' : toISODate(d);
}
