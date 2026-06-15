// week.js — ISO week helpers for the Orders system.
//
// Weekly orders are keyed by ISO week id (e.g. "2026-W25"). currentWeekStartISO
// returns the Monday of the current week as "YYYY-MM-DD". Browser Date is fine
// here (this is app code, not a workflow script).

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Monday (00:00) of the week containing `d`, as "YYYY-MM-DD".
export function currentWeekStartISO(d = new Date()) {
  const date = new Date(d);
  const mondayOffset = (date.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0, ...
  date.setDate(date.getDate() - mondayOffset);
  date.setHours(0, 0, 0, 0);
  return toISODate(date);
}

// ISO-8601 week id, e.g. "2026-W25".
export function currentWeekId(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // Shift to the Thursday of this week, then count weeks from Jan 4th.
  const dayNr = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayNr + 3);
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * 86400000));
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
