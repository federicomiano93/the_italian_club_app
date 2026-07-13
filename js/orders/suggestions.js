// suggestions.js — smart order suggestion engine.
//
// Per Federico: the app learns a target "par" level from history and suggests
// how much to order so that, after the stock on hand, you reach that level —
// always topping up to your usual amount.
//
//   par         = average, over the recent ORDERS of that ingredient, of
//                 (stock on hand + quantity ordered)
//   suggestion  = round( par − current stock ), floored at 0
//
// The window counts ORDERS, not weeks. An order is now one day and one supplier
// (archive.js), and suppliers are not all weekly: Salvo is ordered on Mondays,
// Caterite almost daily. Averaging "the last 8 weeks" would silently mean
// something different for each supplier. "The last 8 times you ordered this
// ingredient" means the same thing for all of them — and for a weekly supplier it
// is the same window as before.
//
// Records that predate the per-day model (one document per ISO week, every
// supplier merged) still count as one order each: they carry the same
// quantities/stock maps and sort on weekStart instead of date.
//
// Bank holidays do NOT change the suggestion — they are alert-only (a week-before
// notice and a delivery-day-conflict notice).

const MIN_ORDERS = 4;       // orders of this ingredient before suggestions activate
const WINDOW_ORDERS = 8;    // average over at most this many recent orders

// history: array of { date | weekStart, quantities:{id:qty}, stock:{id:qty} }
// Returns one of:
//   { active: false, ordersRemaining: N }     — not enough history yet
//   { active: true, suggestion, par }         — ready
//
// Only records that actually ORDERED this ingredient count: `quantities` holds
// ordered rows only, so a day the shelf was full and nothing was ordered is
// absent, and correctly does not drag the par level around.
export function computeSuggestion(ingredientId, currentStock, history) {
  const orders = (history || [])
    .filter(r => r.quantities && Object.prototype.hasOwnProperty.call(r.quantities, ingredientId))
    .sort((a, b) => String(b.date || b.weekStart || '').localeCompare(String(a.date || a.weekStart || '')));

  if (orders.length < MIN_ORDERS) {
    return { active: false, ordersRemaining: MIN_ORDERS - orders.length };
  }

  const recent = orders.slice(0, WINDOW_ORDERS);
  const levels = recent.map(r => {
    const qty = r.quantities[ingredientId] || 0;
    const stock = (r.stock && r.stock[ingredientId]) || 0;
    return qty + stock;
  });
  const par = levels.reduce((sum, v) => sum + v, 0) / levels.length;
  const suggestion = Math.max(0, Math.round(par - (Number(currentStock) || 0)));

  return { active: true, suggestion, par: Math.round(par) };
}
