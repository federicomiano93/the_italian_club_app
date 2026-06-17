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
// product.kind drives the INPUT WIDGET in the calculator, NOT the math:
//   'number'   → plain numeric quantity field (default)
//   'dropdown' → quantity picked from a fixed preset dropdown (0/20/40/60/80/100)
//   'kg'       → quantity entered directly in kilograms (weight 1000 g/kg)
// Legacy kinds are migrated on load: 'ciabatta' → 'dropdown', 'panini' → 'number'.
// A product can also opt into a "crate box" (product.crate = { show, perBox }): a
// display-only helper showing how many crates its order fills. It is bound to the
// product's identity (not kind, not name), so renaming never breaks it.
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
// configuration is loaded. Product ids are kept identical to the old per-tab ones so
// cached quantities keep working; the ciabatta product ships with its crate box on.
export const DEFAULT_CONFIG = {
  clients: [
    { id: 'c-bakery', name: 'Bakery', products: [
      { id: 'f-pizze',   name: 'Pizzas',    dough: 'focaccia', weight: 201, kind: 'number' },
      { id: 'f-focacce', name: 'Focaccias', dough: 'focaccia', weight: 181, kind: 'number' },
    ] },
    { id: 'c-client-1', name: 'Client 1', products: [
      { id: 'f-ciabatta',   name: 'Ciabatta',    dough: 'focaccia', weight: 151, kind: 'dropdown', crate: { show: true, perBox: 20 } },
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
      { id: 'f-panini', name: 'Panini', dough: 'focaccia', weight: 131, kind: 'number' },
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
  // Products INCLUDED in each tab's divisor box (the box that splits dough into
  // crates). Opt-in by design: an empty list means NO product is in the divisor —
  // a product only joins once the user ticks it in Settings. Edited from a separate
  // Settings screen.
  divisorIncluded: { focaccia: [], brioche: [], sourdough: [] },
};

const KINDS = ['number', 'dropdown', 'kg'];

// Migrate a stored kind to the current taxonomy. The old 'ciabatta'/'panini'
// values conflated the input widget with a helper box; they now map to their pure
// input widget (the helper boxes live on the product id in calc.js). Anything
// unknown falls back to a plain number field so the math always has a widget.
const LEGACY_KIND = { ciabatta: 'dropdown', panini: 'number' };
function normalizeKind(kind) {
  const migrated = LEGACY_KIND[kind] || kind;
  return KINDS.includes(migrated) ? migrated : 'number';
}

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

// The divisor box splits dough into up to this many crates (a 0–4 dropdown, 0 = no
// split shown). Display-only — it never affects the dough math.
export const DIVISOR_MAX = 4;

// The per-product "crate box" helper: how many pieces fit in one crate. Default 20,
// clamped to a sane range so a typo can never produce an absurd crate count.
export const CRATE_PERBOX_MIN = 1;
export const CRATE_PERBOX_MAX = 1000;
export const CRATE_PERBOX_DEFAULT = 20;

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

// ── Divisor (display-only crate split) ────────────────────────────────────────
// The divisor box is a kitchen helper: it sums the dough of the SELECTED products
// of a tab and divides it into N crates. It NEVER touches the recipe or the log.

// Product ids included in a tab's divisor (safe empty array). Opt-in: nothing is
// in the divisor until the user ticks it in Settings.
export function getDivisorIncluded(config, tab) {
  const inc = config && config.divisorIncluded;
  return inc && Array.isArray(inc[tab]) ? inc[tab] : [];
}

// Whether a product is counted in its tab's divisor (opt-in: only if ticked).
export function isInDivisor(config, tab, productId) {
  return getDivisorIncluded(config, tab).includes(productId);
}

// The tab's products currently in the divisor (the ones whose dough is split).
export function getDivisorProducts(config, tab) {
  const included = getDivisorIncluded(config, tab);
  return getTabProducts(config, tab).filter(p => included.includes(p.id));
}

// Total raw grams the divisor splits: Σ (quantity × unit weight) over the INCLUDED
// products only. Same shape as computeTarget but limited to the divisor selection.
export function divisorTotal(config, tab, getQty) {
  let total = 0;
  for (const product of getDivisorProducts(config, tab)) {
    const qty = Number(getQty(product.id)) || 0;
    total += qty * clampWeight(product.weight);
  }
  return total;
}

// Grams per crate = total ÷ n, or 0 when n is 0/invalid (nothing to split into).
// Unrounded; the display rounds it. Never returns NaN.
export function splitDough(total, n) {
  const parts = Number(n);
  if (!Number.isFinite(parts) || parts <= 0) return 0;
  const grams = Number(total);
  if (!Number.isFinite(grams) || grams < 0) return 0;
  return grams / parts;
}

// ── Crate boxes (display-only, per product) ───────────────────────────────────
// A per-product helper that tells the baker how many crates an order fills, where
// each crate holds a configurable number of pieces (default 20). Enabled per product
// (product.crate.show) and bound to the product's identity, not its name — robust to
// renames. The crate weight shown is perBox × the product's unit weight, so changing
// the weight updates the box automatically. Display-only — never touches recipe/log.

// Clamp the pieces-per-crate to a sane range, defaulting on anything non-numeric.
export function clampCratePerBox(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return CRATE_PERBOX_DEFAULT;
  if (n < CRATE_PERBOX_MIN) return CRATE_PERBOX_MIN;
  if (n > CRATE_PERBOX_MAX) return CRATE_PERBOX_MAX;
  return n;
}

// Whether a product shows its crate box (off unless explicitly enabled).
export function isCrateEnabled(product) {
  return !!(product && product.crate && product.crate.show);
}

// A product's configured pieces per crate (clamped, default 20).
export function getCratePerBox(product) {
  return clampCratePerBox(product && product.crate ? product.crate.perBox : undefined);
}

// How many crates an order fills = quantity ÷ pieces per box. Safe at the edges
// (0 for invalid/zero box size). Unrounded; the display rounds it.
export function crateCount(qty, perBox) {
  const n = Number(qty);
  const per = Number(perBox);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (!Number.isFinite(per) || per <= 0) return 0;
  return n / per;
}

// ── Normalisation & migration ─────────────────────────────────────────────────

// A product's optional crate box: shown only when explicitly enabled; perBox always
// clamped to a sane range so the math never sees a zero/garbage divisor.
function normalizeCrate(raw) {
  return {
    show: !!(raw && raw.show),
    perBox: clampCratePerBox(raw && raw.perBox),
  };
}

function normalizeProduct(p) {
  if (!p || typeof p !== 'object' || !p.id) return null;
  return {
    id: String(p.id),
    name: String(p.name || 'Product'),
    dough: TABS.includes(p.dough) ? p.dough : 'focaccia',
    weight: clampWeight(p.weight),
    kind: normalizeKind(p.kind),
    crate: normalizeCrate(p.crate),
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

// The set of product ids that exist in a given tab (across all clients).
function tabProductIds(clients, tab) {
  const ids = new Set();
  for (const client of clients) {
    for (const product of (client.products || [])) {
      if (product.dough === tab) ids.add(product.id);
    }
  }
  return ids;
}

// Per-tab divisor inclusions, pruned to ids that still exist in that tab so a
// deleted product never lingers as a stale inclusion. Defaults to none included.
function normalizeDivisorIncluded(raw, clients) {
  const out = {};
  for (const tab of TABS) {
    const ids = tabProductIds(clients, tab);
    const stored = raw && Array.isArray(raw[tab]) ? raw[tab].map(String) : [];
    out[tab] = stored.filter(id => ids.has(id));
  }
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
  return {
    clients,
    groups: normalizeGroups(groups, clients),
    extraDough: normalizeExtraDough(raw.extraDough),
    divisorIncluded: normalizeDivisorIncluded(raw.divisorIncluded, clients),
  };
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
    return {
      clients,
      groups: normalizeGroups(raw.groups, clients),
      extraDough: normalizeExtraDough(raw.extraDough),
      divisorIncluded: normalizeDivisorIncluded(raw.divisorIncluded, clients),
    };
  }

  if (raw.focaccia || raw.brioche || raw.sourdough || raw.market) {
    return migrateLegacy(raw);
  }

  return base;
}
