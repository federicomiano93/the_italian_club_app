// calculator-config.js — pure data model for the single client address book.
//
// This module is intentionally FREE of any Firebase / DOM imports so the dough
// math can be unit-tested in isolation (see tests/calculator-config.test.mjs).
//
// THE MODEL: one address book of clients. Each client owns a list of products;
// each product knows which dough it belongs to (`dough`: focaccia | brioche |
// sourdough) and carries its own unit weight in grams. The three dough tabs are
// just FILTERED VIEWS of this single list (the products whose `dough` matches).
// A product is never duplicated per tab any more — it lives once, on its client.
//
// The recipe itself never lives here — it stays fixed per dough. Only the unit
// weights (which decide HOW MUCH total dough to make) are configurable.
//
// product.kind drives the input widget in the calculator, NOT the math:
//   'number'   → plain numeric quantity field (default)
//   'ciabatta' → quantity picked from a fixed dropdown + "boxes" helper
//   'panini'   → plain numeric field + "panini dough ÷ divisor" helper
//   'kg'       → quantity entered directly in kilograms (weight 1000 g/kg)
//
// WhatsApp orders reuse the SAME clients/products: `groups` are saved lists of
// client ids (e.g. the market's stalls) sent in one message. Sending a single
// client needs no config — it is chosen at send time.

export const TABS = ['focaccia', 'brioche', 'sourdough'];

// Allowed weight range, in grams. Guards against a typo turning 150 into 15000
// and silently producing ten times the intended dough.
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 5000;

// Default configuration. It reproduces today's exact products, weights, ids and
// special widgets, reorganised into the single address book, so with defaults
// the calculator behaves identically. The four real wholesale client names are
// intentionally NOT shipped here (business data, P1/P8): they are entered once in
// Settings and stored in Firestore. Generic placeholders are used until the real
// configuration is loaded. Product ids are kept identical to the old per-tab ones
// so cached quantities and the special widgets (f-panini, f-ciabatta) keep working.
export const DEFAULT_CONFIG = {
  clients: [
    { id: 'c-bakery', name: 'Bakery', products: [
      { id: 'f-pizze',   name: 'Pizzas',    dough: 'focaccia', weight: 201, kind: 'number' },
      { id: 'f-focacce', name: 'Focaccias', dough: 'focaccia', weight: 181, kind: 'number' },
    ] },
    { id: 'c-client-1', name: 'Client 1', products: [
      { id: 'f-ciabatta',   name: 'Ciabatta',    dough: 'focaccia', weight: 151, kind: 'ciabatta' },
      { id: 'b-burgerbuns', name: 'Burger buns', dough: 'brioche',  weight: 81,  kind: 'number' },
      { id: 'b-subrolls',   name: 'Sub rolls',   dough: 'brioche',  weight: 121, kind: 'number' },
    ] },
    { id: 'c-client-2', name: 'Client 2', products: [
      { id: 'f-trayfocaccia', name: 'Tray focaccia', dough: 'focaccia',  weight: 1800, kind: 'number' },
      { id: 'b-bun',          name: 'Buns',          dough: 'brioche',   weight: 71,   kind: 'number' },
      { id: 'b-rolls',        name: 'Rolls',         dough: 'brioche',   weight: 71,   kind: 'number' },
      { id: 's-loaf',         name: 'Loaf',          dough: 'sourdough', weight: 905,  kind: 'number' },
    ] },
    { id: 'c-client-3', name: 'Client 3', products: [
      { id: 'f-panini', name: 'Panini', dough: 'focaccia', weight: 131, kind: 'panini' },
    ] },
  ],
  // Saved WhatsApp order lists: each groups several address-book clients into one
  // message (e.g. the market and its three stalls). Sending a single client needs
  // no group. clientIds reference clients above; dangling ids are dropped.
  groups: [
    { id: 'g-market', title: 'Market order', clientIds: ['c-client-1', 'c-client-2', 'c-client-3'] },
  ],
  // Whether the per-tab "Extra dough" box is shown in each dough tab. Toggled from
  // a separate Settings screen. Default: shown everywhere.
  extraDough: { focaccia: true, brioche: true, sourdough: true },
};

const KINDS = ['number', 'ciabatta', 'panini', 'kg'];

// Deep clone via JSON — config is plain data (no functions/dates), so this is
// safe and keeps callers from mutating shared defaults.
export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

// "Extra dough" is a free amount of dough to make, NOT tied to any product — it
// is entered directly in each tab and added on top of the products' total. Capped
// to guard against an extreme typo (e.g. 1 kg mistyped as 1000 kg).
export const EXTRA_MAX_G = 500000; // 500 kg

// Convert an extra-dough entry to grams. unit 'kg' multiplies by 1000; anything
// non-numeric or negative becomes 0 so the math never sees NaN.
export function doughExtraGrams(value, unit) {
  let g = Number(value);
  if (!Number.isFinite(g) || g < 0) return 0;
  if (unit === 'kg') g *= 1000;
  return Math.min(g, EXTRA_MAX_G);
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

// ── Read helpers (used by the calculator, settings and WhatsApp) ──────────────

// The whole address book (empty array for a missing/garbage config).
export function getClients(config) {
  return (config && Array.isArray(config.clients)) ? config.clients : [];
}

export function getClientById(config, id) {
  return getClients(config).find(c => c && c.id === id) || null;
}

// The saved WhatsApp groups (empty array for a missing/garbage config).
export function getGroups(config) {
  return (config && Array.isArray(config.groups)) ? config.groups : [];
}

// Whether the per-tab "Extra dough" box is shown for a given tab. Defaults to
// shown (true) unless explicitly turned off in the config.
export function isExtraDoughEnabled(config, tab) {
  return !(config && config.extraDough && config.extraDough[tab] === false);
}

// The actual client objects a group points at, skipping ids no longer in the
// address book (e.g. a client deleted after the group was created).
export function resolveGroupClients(config, group) {
  if (!group || !Array.isArray(group.clientIds)) return [];
  return group.clientIds.map(id => getClientById(config, id)).filter(Boolean);
}

// A dough tab's products: every product, across all clients, whose `dough`
// matches `tab`. Each item keeps a reference to its owning client for grouping
// (cards, log). This is the single place the per-tab "view" is derived; the math
// below and calc.js consume exactly this shape, unchanged from before.
export function getTabProducts(config, tab) {
  const out = [];
  for (const client of getClients(config)) {
    if (!client || !Array.isArray(client.products)) continue;
    for (const product of client.products) {
      if (product && product.dough === tab) {
        out.push({ ...product, clientId: client.id, clientName: client.name });
      }
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

// ── Normalisation & migration ─────────────────────────────────────────────────

function normalizeProduct(p) {
  if (!p || typeof p !== 'object' || !p.id) return null;
  return {
    id: String(p.id),
    name: String(p.name || 'Product'),
    dough: TABS.includes(p.dough) ? p.dough : 'focaccia',
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

function normalizeGroup(raw, validIds) {
  if (!raw || typeof raw !== 'object') return null;
  const clientIds = Array.isArray(raw.clientIds)
    ? raw.clientIds.map(String).filter(id => validIds.has(id))
    : [];
  return { id: String(raw.id || 'group'), title: String(raw.title || 'Order'), clientIds };
}

function normalizeGroups(raw, clients) {
  if (!Array.isArray(raw)) return [];
  const validIds = new Set(clients.map(c => c.id));
  return raw.map(g => normalizeGroup(g, validIds)).filter(Boolean);
}

// Per-tab "show Extra dough box" flags. Each tab defaults to shown (true) unless
// the stored value is explicitly false.
function normalizeExtraDough(raw) {
  const out = {};
  for (const tab of TABS) out[tab] = !(raw && raw[tab] === false);
  return out;
}

// Pull the legacy market section into a flat list of {id,title,clients} shapes,
// covering both the multi-list ({lists}) and the older single-order
// ({title,clients}) variants.
function legacyMarketLists(market) {
  if (!market || typeof market !== 'object') return [];
  if (Array.isArray(market.lists)) return market.lists;
  if (Array.isArray(market.clients)) {
    return [{ id: 'list-market', title: market.title || 'Market order', clients: market.clients }];
  }
  return [];
}

// Migrate the old per-tab shape ({focaccia,brioche,sourdough}.clients + market)
// into the unified address book. Clients with the same name across tabs/market
// are merged into one (their products combined, each tagged with its dough), and
// each market list becomes a group referencing those clients. Best-effort: the
// old market-only product names (om-*) cannot become dough products and are
// dropped — acceptable because no real data exists yet (placeholders only).
function migrateLegacy(raw) {
  const byName = new Map(); // lowercased name -> client object
  const order = [];         // preserves first-seen order

  function findOrCreateClient(name, idHint) {
    const key = String(name || 'Client').trim().toLowerCase();
    let client = byName.get(key);
    if (!client) {
      client = { id: String(idHint || 'c-' + (key.replace(/\s+/g, '-') || 'client')), name: String(name || 'Client'), products: [] };
      byName.set(key, client);
      order.push(client);
    }
    return client;
  }

  for (const tab of TABS) {
    const tabConf = raw[tab];
    if (!tabConf || !Array.isArray(tabConf.clients)) continue;
    for (const legacyClient of tabConf.clients) {
      if (!legacyClient || typeof legacyClient !== 'object') continue;
      const client = findOrCreateClient(legacyClient.name, legacyClient.id);
      const products = Array.isArray(legacyClient.products) ? legacyClient.products : [];
      for (const p of products) {
        const np = normalizeProduct({ ...p, dough: tab });
        if (np) client.products.push(np);
      }
    }
  }

  const groups = legacyMarketLists(raw.market).map((list, li) => {
    const clientIds = [];
    for (const mc of (Array.isArray(list.clients) ? list.clients : [])) {
      const client = findOrCreateClient(mc && mc.name, mc && mc.id);
      if (!clientIds.includes(client.id)) clientIds.push(client.id);
    }
    return { id: String(list.id || 'g-' + li), title: String(list.title || 'Market order'), clientIds };
  });

  const clients = order.map(normalizeClient);
  return { clients, groups: normalizeGroups(groups, clients), extraDough: normalizeExtraDough(raw.extraDough) };
}

// Produce a safe, well-formed config from arbitrary (e.g. Firestore) input. A
// new unified document is validated (clamped weights, valid dough/kind, groups
// pruned of dangling client ids); a legacy per-tab document is migrated; missing
// or garbage input falls back to the default so the app can always render.
export function normalizeConfig(raw) {
  const base = cloneConfig(DEFAULT_CONFIG);
  if (!raw || typeof raw !== 'object') return base;

  if (Array.isArray(raw.clients)) {
    const clients = raw.clients.map(normalizeClient).filter(Boolean);
    return { clients, groups: normalizeGroups(raw.groups, clients), extraDough: normalizeExtraDough(raw.extraDough) };
  }

  if (raw.focaccia || raw.brioche || raw.sourdough || raw.market) {
    return migrateLegacy(raw);
  }

  return base;
}
