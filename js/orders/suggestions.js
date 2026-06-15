// suggestions.js — smart order suggestion engine.
//
// Per Federico: the app learns a target "par" level from history and suggests
// how much to order so that, after the stock on hand, you reach that level —
// always topping up to your usual amount.
//
//   par         = average over recent weeks of (stock on hand + quantity ordered)
//   suggestion  = round( par − current stock ), floored at 0
//
// Hidden until 4 weeks of history exist for that ingredient; weeks 1-3 show a
// countdown. The average uses only the most recent weeks so it tracks current
// conditions (busy periods, menu changes) rather than the whole history.
//
// Bank holidays do NOT change the suggestion — they are alert-only (Phase 6:
// a week-before notice and a delivery-day-conflict notice).

const MIN_WEEKS = 4;        // weeks of history before suggestions activate
const WINDOW_WEEKS = 8;     // average over at most this many recent weeks

// history: array of { weekStart, quantities:{id:qty}, stock:{id:qty} }
// Returns one of:
//   { active: false, weeksRemaining: N }      — not enough history yet
//   { active: true, suggestion, par }         — ready
export function computeSuggestion(ingredientId, currentStock, history) {
  const weeks = (history || [])
    .filter(w => w.quantities && Object.prototype.hasOwnProperty.call(w.quantities, ingredientId))
    .sort((a, b) => String(b.weekStart || '').localeCompare(String(a.weekStart || '')));

  if (weeks.length < MIN_WEEKS) {
    return { active: false, weeksRemaining: MIN_WEEKS - weeks.length };
  }

  const recent = weeks.slice(0, WINDOW_WEEKS);
  const levels = recent.map(w => {
    const qty = w.quantities[ingredientId] || 0;
    const stock = (w.stock && w.stock[ingredientId]) || 0;
    return qty + stock;
  });
  const par = levels.reduce((sum, v) => sum + v, 0) / levels.length;
  const suggestion = Math.max(0, Math.round(par - (Number(currentStock) || 0)));

  return { active: true, suggestion, par: Math.round(par) };
}
