// calculator-config.js — pure data model for configurable clients & products.
//
// This module is intentionally FREE of any Firebase / DOM imports so the dough
// math can be unit-tested in isolation (see tests/calculator-config.test.mjs).
//
// A "tab" (focaccia | brioche | sourdough) owns a list of clients; each client
// owns a list of products; each product carries its own unit weight in grams.
// The recipe itself never lives here — it stays fixed per tab. Only the unit
// weights (which decide HOW MUCH total dough to make) are configurable.
//
// product.kind drives the input widget in the calculator, NOT the math:
//   'number'   → plain numeric quantity field (default)
//   'ciabatta' → quantity picked from a fixed dropdown + "boxes" helper
//   'panini'   → plain numeric field + "panini dough ÷ divisor" helper
//   'kg'       → quantity entered directly in kilograms (weight 1000 g/kg)

// Allowed weight range, in grams. Guards against a typo turning 150 into 15000
// and silently producing ten times the intended dough.
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 5000;

// Default configuration. It reproduces today's exact products, weights, ids and
// special widgets, so with defaults the calculator behaves identically. The four
// real wholesale client names are intentionally NOT shipped here (business data,
// P1/P8): they are entered once in Settings and stored in Firestore. Generic
// placeholders are used until the real configuration is loaded.
export const DEFAULT_CONFIG = {
  focaccia: {
    clients: [
      { id: 'f-bakery', name: 'Bakery', products: [
        { id: 'f-pizze',   name: 'Pizzas',    weight: 201, kind: 'number' },
        { id: 'f-focacce', name: 'Focaccias', weight: 181, kind: 'number' },
      ] },
      { id: 'f-client-1', name: 'Client 1', products: [
        { id: 'f-ciabatta', name: 'Ciabatta', weight: 151, kind: 'ciabatta' },
      ] },
      { id: 'f-client-2', name: 'Client 2', products: [
        { id: 'f-trayfocaccia', name: 'Tray focaccia', weight: 1800, kind: 'number' },
      ] },
      { id: 'f-client-3', name: 'Client 3', products: [
        { id: 'f-panini', name: 'Panini', weight: 131, kind: 'panini' },
      ] },
      { id: 'f-extra', name: 'Extra dough', products: [
        { id: 'f-kg', name: 'Kg', weight: 1000, kind: 'kg' },
      ] },
    ],
  },
  brioche: {
    clients: [
      { id: 'b-client-1', name: 'Client 1', products: [
        { id: 'b-burgerbuns', name: 'Burger buns', weight: 81,  kind: 'number' },
        { id: 'b-subrolls',   name: 'Sub rolls',   weight: 121, kind: 'number' },
      ] },
      { id: 'b-client-2', name: 'Client 2', products: [
        { id: 'b-bun',   name: 'Buns',  weight: 71, kind: 'number' },
        { id: 'b-rolls', name: 'Rolls', weight: 71, kind: 'number' },
      ] },
      { id: 'b-extra', name: 'Extra dough', products: [
        { id: 'b-kg', name: 'Kg', weight: 1000, kind: 'kg' },
      ] },
    ],
  },
  sourdough: {
    clients: [
      { id: 's-client-1', name: 'Loaves', products: [
        { id: 's-loaf', name: 'Loaf', weight: 905, kind: 'number' },
      ] },
    ],
  },
  // The WhatsApp order section. Not part of the dough math. It holds one or more
  // ordering "lists" (e.g. the market, and later other restaurants); each list has
  // a title (used as the WhatsApp message heading) and clients, whose products are
  // just { id (om-*), name }. Names are configurable, so none are hard-coded here.
  market: {
    lists: [
      { id: 'list-market', title: 'Market order', clients: [
        { id: 'm-1', name: 'Client 1', products: [
          { id: 'om-ciabatta',   name: 'Ciabatta' },
          { id: 'om-burgerbuns', name: 'Seeded burger buns' },
          { id: 'om-subrolls',   name: 'Brioche rolls' },
        ] },
        { id: 'm-2', name: 'Client 2', products: [
          { id: 'om-trayfocaccia', name: 'Tray focaccia' },
          { id: 'om-bun',          name: 'Buns' },
          { id: 'om-rolls',        name: 'Rolls' },
          { id: 'om-loaves',       name: 'Loaf of bread' },
        ] },
        { id: 'm-3', name: 'Client 3', products: [
          { id: 'om-panini', name: 'Panini' },
        ] },
      ] },
    ],
  },
};

export const TABS = ['focaccia', 'brioche', 'sourdough'];

// Deep clone via JSON — config is plain data (no functions/dates), so this is
// safe and keeps callers from mutating shared defaults.
export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

// Clamp a weight to the allowed range and coerce to a finite number. Returns
// WEIGHT_MIN for anything non-numeric so the math never sees NaN.
export function clampWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return WEIGHT_MIN;
  if (n < WEIGHT_MIN) return WEIGHT_MIN;
  if (n > WEIGHT_MAX) return WEIGHT_MAX;
  return n;
}

// Flatten a tab's products across all its clients into a single ordered list.
// Each item keeps a reference to its owning client for grouping (log, render).
export function getTabProducts(config, tab) {
  const tabConfig = config && config[tab];
  if (!tabConfig || !Array.isArray(tabConfig.clients)) return [];
  const out = [];
  for (const client of tabConfig.clients) {
    if (!client || !Array.isArray(client.products)) continue;
    for (const product of client.products) {
      out.push({ ...product, clientId: client.id, clientName: client.name });
    }
  }
  return out;
}

// Core dough math: total raw grams = Σ (quantity × unit weight) over all
// products in a tab. getQty(productId) returns the entered quantity (pieces, or
// kilograms for a 'kg' product — its weight is 1000 g/kg, so the product still
// resolves to grams). This is the ONLY math this feature changes; the recipe
// scaling that turns these grams into ingredients is untouched in calc.js.
export function computeTarget(config, tab, getQty) {
  let total = 0;
  for (const product of getTabProducts(config, tab)) {
    const qty = Number(getQty(product.id)) || 0;
    total += qty * clampWeight(product.weight);
  }
  return total;
}

const KINDS = ['number', 'ciabatta', 'panini', 'kg'];

function normalizeProduct(p) {
  if (!p || typeof p !== 'object' || !p.id) return null;
  return {
    id: String(p.id),
    name: String(p.name || 'Product'),
    weight: clampWeight(p.weight),
    kind: KINDS.includes(p.kind) ? p.kind : 'number',
  };
}

function normalizeClient(client) {
  if (!client || typeof client !== 'object') return null;
  const products = Array.isArray(client.products)
    ? client.products.map(normalizeProduct).filter(Boolean)
    : [];
  return {
    id: String(client.id || ''),
    name: String(client.name || 'Client'),
    products,
  };
}

// A WhatsApp client: like a dough client but its products carry no weight/kind
// (they are just names in the order message), so it is normalized separately to
// avoid injecting a weight that would be meaningless here.
function normalizeMarketClient(client) {
  if (!client || typeof client !== 'object') return null;
  const products = Array.isArray(client.products)
    ? client.products.filter(p => p && p.id).map(p => ({ id: String(p.id), name: String(p.name || 'Product') }))
    : [];
  return { id: String(client.id || ''), name: String(client.name || 'Client'), products };
}

function normalizeMarketList(list) {
  if (!list || typeof list !== 'object') return null;
  const clients = Array.isArray(list.clients)
    ? list.clients.map(normalizeMarketClient).filter(Boolean)
    : [];
  return { id: String(list.id || 'list'), title: String(list.title || 'Order'), clients };
}

// Normalize the WhatsApp section, migrating the legacy single-order shape
// ({ title, clients }) into the new multi-list shape ({ lists: [...] }) so old
// Firestore data keeps working. Missing/garbage falls back to the default.
function normalizeMarket(raw) {
  if (raw && Array.isArray(raw.lists)) {
    const lists = raw.lists.map(normalizeMarketList).filter(Boolean);
    return { lists: lists.length ? lists : cloneConfig(DEFAULT_CONFIG).market.lists };
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.clients)) {
    // Legacy shape → wrap the existing order as the first list (data preserved).
    return { lists: [normalizeMarketList({ id: 'list-market', title: raw.title || 'Market order', clients: raw.clients })] };
  }
  return cloneConfig(DEFAULT_CONFIG).market;
}

// Produce a safe, well-formed config from arbitrary (e.g. Firestore) input: the
// three dough tabs always exist with a clients array, every product has a
// clamped numeric weight and a valid kind, and the WhatsApp `market` section is
// migrated/normalized into its multi-list shape. A missing/malformed tab falls
// back to its default so the calculator can always render something usable.
export function normalizeConfig(raw) {
  const base = cloneConfig(DEFAULT_CONFIG);
  if (!raw || typeof raw !== 'object') return base;
  const out = {};
  for (const tab of TABS) {
    const rawTab = raw[tab];
    out[tab] = rawTab && Array.isArray(rawTab.clients)
      ? { clients: rawTab.clients.map(normalizeClient).filter(Boolean) }
      : { clients: base[tab].clients };
  }
  out.market = normalizeMarket(raw.market);
  return out;
}
