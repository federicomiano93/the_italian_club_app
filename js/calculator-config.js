// calculator-config.js — pure data model for the calculator's catalogue.
//
// This module is intentionally FREE of any Firebase / DOM imports so the dough
// math and the data model can be unit-tested in isolation (see
// tests/calculator-config.test.mjs). The owner cannot read code, so these tests
// are the safety net (P15).
//
// THE MODEL (Stage 3 — shared product catalogue):
//   • config.products[] is the CATALOGUE: every product exists once, here, with a
//     name, the recipe it belongs to (`recipeId`: focaccia | brioche | sourdough)
//     and its own unit weight in grams. A product is never duplicated.
//   • config.clients[] is the address book. Each client has `items[]`: the products
//     it orders. An item is an ASSOCIATION client↔product carrying how the quantity
//     is entered (`kind`) and the optional crate box (`crate`) — these can differ
//     per client, so the SAME catalogue product can be a dropdown for one client and
//     a number field for another. The product's name/weight/recipe always come from
//     the catalogue.
//   • A recipe tab is a FILTERED VIEW: getTabProducts(config, recipeId) walks every
//     client's items, resolves each to its catalogue product, and emits one row per
//     association whose product belongs to that recipe. The SAME product ordered by
//     two clients yields TWO rows (one per client), each with its own quantity — so
//     quantities are per (client, product) pair, keyed by `qtyId`.
//
// Stage 3 keeps the three recipes fixed (focaccia/brioche/sourdough as recipe ids);
// Stage 4 turns them into editable config entities. Migration from the previous
// nested shape (clients[].products[]) is additive and lossless: the catalogue and
// items are built from the nested products, and the nested `products[]` are LEFT in
// place as a revert safety window (the new code ignores them; the old code, if
// reverted, can still read them).
//
// item.kind drives the INPUT WIDGET in the calculator, NOT the math:
//   'number'   → plain numeric quantity field (default)
//   'dropdown' → quantity picked from a fixed preset dropdown (0/20/40/60/80/100)
//   'kg'       → quantity entered directly in kilograms (weight 1000 g/kg)
// Legacy kinds are migrated on load: 'ciabatta' → 'dropdown', 'panini' → 'number'.
// An association can opt into a "crate box" (item.crate = { show, perBox }): a
// display-only helper showing how many crates its order fills.
//
// WhatsApp orders are INDEPENDENT of the recipe tabs. There are two kinds, both sent
// from the WhatsApp button and edited in the WhatsApp settings screen:
//   • `whatsappLists` — a list has a title and a set of client entries; each entry
//     references an address-book client (by id, for its name) and an explicitly
//     chosen set of catalogue product ids.
//   • `whatsappClients` — a standalone "direct client": a TYPED name plus catalogue
//     product ids. Sent on its own, without a list.
// Product ids are resolved live from the catalogue (a rename propagates; a deleted
// product is pruned). The dough math never reads this — it is purely for the order
// message.

export const TABS = ['focaccia', 'brioche', 'sourdough'];

// Allowed weight range, in grams. Guards against a typo turning 150 into 15000
// and silently producing ten times the intended dough.
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 5000;

// Separator for a per (client, product) quantity key. Chosen so it cannot occur in
// generated ids (which are lowercase letters, digits and single hyphens).
const PAIR_SEP = '::';

// The quantity key for a (client, product) association: the id of the input/select
// the calculator renders for that pair, and the localStorage key it persists under.
export function pairId(clientId, productId) {
  return String(clientId) + PAIR_SEP + String(productId);
}

// Default configuration. It reproduces today's exact products, weights, ids and
// associations, reorganised into the catalogue + items shape, so with defaults the
// calculator behaves identically. The four real wholesale client names are
// intentionally NOT shipped here (business data, P1/P8): they are entered once in
// Settings and stored in Firestore. Generic placeholders are used until the real
// configuration is loaded. Product ids are kept identical to the old ones so cached
// quantities keep working; the ciabatta association ships with its crate box on.
export const DEFAULT_CONFIG = {
  products: [
    { id: 'f-pizze',        name: 'Pizzas',        recipeId: 'focaccia',  weight: 201 },
    { id: 'f-focacce',      name: 'Focaccias',     recipeId: 'focaccia',  weight: 181 },
    { id: 'f-ciabatta',     name: 'Ciabatta',      recipeId: 'focaccia',  weight: 151 },
    { id: 'f-trayfocaccia', name: 'Tray focaccia', recipeId: 'focaccia',  weight: 1800 },
    { id: 'f-panini',       name: 'Panini',        recipeId: 'focaccia',  weight: 131 },
    { id: 'b-burgerbuns',   name: 'Burger buns',   recipeId: 'brioche',   weight: 81 },
    { id: 'b-subrolls',     name: 'Sub rolls',     recipeId: 'brioche',   weight: 121 },
    { id: 'b-bun',          name: 'Buns',          recipeId: 'brioche',   weight: 71 },
    { id: 'b-rolls',        name: 'Rolls',         recipeId: 'brioche',   weight: 71 },
    { id: 's-loaf',         name: 'Loaf',          recipeId: 'sourdough', weight: 905 },
  ],
  clients: [
    { id: 'c-bakery', name: 'Bakery', items: [
      { productId: 'f-pizze',   kind: 'number' },
      { productId: 'f-focacce', kind: 'number' },
    ] },
    { id: 'c-client-1', name: 'Client 1', items: [
      { productId: 'f-ciabatta',   kind: 'dropdown', crate: { show: true, perBox: 20 } },
      { productId: 'b-burgerbuns', kind: 'number' },
      { productId: 'b-subrolls',   kind: 'number' },
    ] },
    { id: 'c-client-2', name: 'Client 2', items: [
      { productId: 'f-trayfocaccia', kind: 'number' },
      { productId: 'b-bun',          kind: 'number' },
      { productId: 'b-rolls',        kind: 'number' },
      { productId: 's-loaf',         kind: 'number' },
    ] },
    { id: 'c-client-3', name: 'Client 3', items: [
      { productId: 'f-panini', kind: 'number' },
    ] },
  ],
  // Independent WhatsApp order lists (decoupled from the recipe tabs): a title plus
  // client entries, each naming an address-book client and the catalogue product ids
  // it should show. References are resolved live; deleted clients/products are pruned.
  whatsappLists: [
    { id: 'wl-market', title: 'Market order', clients: [
      { clientId: 'c-client-1', products: ['f-ciabatta', 'b-burgerbuns', 'b-subrolls'] },
      { clientId: 'c-client-2', products: ['f-trayfocaccia', 'b-bun', 'b-rolls', 's-loaf'] },
      { clientId: 'c-client-3', products: ['f-panini'] },
    ] },
  ],
  // Direct WhatsApp clients: a standalone recipient with a TYPED name and catalogue
  // product ids. Empty by default. Product ids are resolved live; deleted ids pruned.
  whatsappClients: [],
  // Whether the per-tab "Extra dough" box is shown in each recipe tab. Default: shown.
  extraDough: { focaccia: true, brioche: true, sourdough: true },
  // Catalogue product ids INCLUDED in each tab's divisor box. Opt-in: an empty list
  // means NO product is split until the user ticks it in Settings.
  divisorIncluded: { focaccia: [], brioche: [], sourdough: [] },
  // Which recipes' logs are SHOWN in the app's Log list (display-only filter).
  logVisibility: { focaccia: true, brioche: true, sourdough: true },
  // How long (in hours) a log stays in the app's Log list. 24 or 48.
  logRetentionHours: 24,
  logRetentionByDough: { focaccia: 24, brioche: 24, sourdough: 24 },
};

const KINDS = ['number', 'dropdown', 'kg'];

// Migrate a stored kind to the current taxonomy. The old 'ciabatta'/'panini' values
// conflated the input widget with a helper box; they now map to their pure input
// widget. Anything unknown falls back to a plain number field.
const LEGACY_KIND = { ciabatta: 'dropdown', panini: 'number' };
function normalizeKind(kind) {
  const migrated = LEGACY_KIND[kind] || kind;
  return KINDS.includes(migrated) ? migrated : 'number';
}

// Deep clone via JSON — config is plain data (no functions/dates), so this is safe
// and keeps callers from mutating shared defaults.
export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

// "Extra dough" is a free amount of dough to make, NOT tied to any product — entered
// directly in each tab and added on top of the products' total. Capped to guard
// against an extreme typo (e.g. 1 kg mistyped as 1000 kg).
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

// The per-association "crate box" helper: how many pieces fit in one crate.
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

// Clamp the pieces-per-crate to a sane range, defaulting on anything non-numeric.
export function clampCratePerBox(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return CRATE_PERBOX_DEFAULT;
  if (n < CRATE_PERBOX_MIN) return CRATE_PERBOX_MIN;
  if (n > CRATE_PERBOX_MAX) return CRATE_PERBOX_MAX;
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

// The product catalogue (empty array for a missing/garbage config).
export function getProducts(config) {
  return (config && Array.isArray(config.products)) ? config.products : [];
}

// Find a catalogue product by id, or null. Used to resolve the product ids that
// client items and WhatsApp entries reference.
export function getProductById(config, id) {
  return getProducts(config).find(p => p && p.id === id) || null;
}

// Every catalogue product, each tagged with the clients that order it (names joined)
// and a count. This is the pool the Products view and the WhatsApp editor pick from.
// `clientNames` is a human-readable list of the clients ordering the product (empty
// when none), so the UI can show "ordered by …" without re-walking the address book.
export function getAllProducts(config) {
  const clientsByProduct = new Map();
  for (const client of getClients(config)) {
    for (const item of (client.items || [])) {
      if (!item || !item.productId) continue;
      if (!clientsByProduct.has(item.productId)) clientsByProduct.set(item.productId, []);
      clientsByProduct.get(item.productId).push(client.name || 'Client');
    }
  }
  return getProducts(config).map(p => {
    const names = clientsByProduct.get(p.id) || [];
    return { ...p, clientNames: names, clientCount: names.length };
  });
}

// The saved independent WhatsApp lists (empty array for a missing/garbage config).
export function getWhatsappLists(config) {
  return (config && Array.isArray(config.whatsappLists)) ? config.whatsappLists : [];
}

// The saved direct WhatsApp clients (empty array for a missing/garbage config).
export function getWhatsappClients(config) {
  return (config && Array.isArray(config.whatsappClients)) ? config.whatsappClients : [];
}

// Resolve a WhatsApp list to the data the order message needs: for each client
// entry, the live client object plus the chosen catalogue product objects, with
// dangling references (deleted client or product) skipped.
export function resolveListClients(config, list) {
  if (!list || !Array.isArray(list.clients)) return [];
  const out = [];
  for (const entry of list.clients) {
    if (!entry) continue;
    const client = getClientById(config, entry.clientId);
    if (!client) continue; // a deleted client drops out of the list
    const productIds = Array.isArray(entry.products) ? entry.products : [];
    const products = productIds.map(id => getProductById(config, id)).filter(Boolean);
    out.push({ client, products });
  }
  return out;
}

// Resolve a direct WhatsApp client to the order message's data: its typed name plus
// the chosen catalogue product objects, skipping ids whose product was deleted.
export function resolveDirectClient(config, dc) {
  if (!dc) return null;
  const productIds = Array.isArray(dc.products) ? dc.products : [];
  const products = productIds.map(id => getProductById(config, id)).filter(Boolean);
  return { name: dc.name || 'Client', products };
}

// Whether the per-tab "Extra dough" box is shown for a given tab. Defaults to shown.
export function isExtraDoughEnabled(config, tab) {
  return !(config && config.extraDough && config.extraDough[tab] === false);
}

// ── Log display settings (visibility + retention) ─────────────────────────────
// Both are DISPLAY-only filters for the app's Log list. Logs are always written to
// Firestore; these only decide what the list shows.

export const LOG_RETENTION_OPTIONS = [24, 48];
export const LOG_RETENTION_DEFAULT = 24;

export function isLogVisible(config, tab) {
  return !(config && config.logVisibility && config.logVisibility[tab] === false);
}

export function getLogRetentionHours(config) {
  return normalizeLogRetention(config && config.logRetentionHours);
}

export function getLogRetentionForDough(config, tab) {
  const m = config && config.logRetentionByDough;
  const n = m && Number(m[tab]);
  return LOG_RETENTION_OPTIONS.includes(n) ? n : getLogRetentionHours(config);
}

// ── Tab view (catalogue + items → per-association rows) ────────────────────────

// A recipe tab's rows: for every client's item whose catalogue product belongs to
// `recipeId`, one row carrying the product's name/weight/recipe plus the
// association's kind/crate and its owning client. The SAME product ordered by two
// clients yields two rows. Each row's `qtyId` is the per (client, product) quantity
// key; `id` stays the product id (so divisor/crate/whatsapp keep keying by product).
export function getTabProducts(config, recipeId) {
  const out = [];
  for (const client of getClients(config)) {
    if (!client || !Array.isArray(client.items)) continue;
    for (const item of client.items) {
      if (!item || !item.productId) continue;
      const product = getProductById(config, item.productId);
      if (!product || product.recipeId !== recipeId) continue;
      out.push({
        id: product.id,
        qtyId: pairId(client.id, product.id),
        name: product.name,
        recipeId: product.recipeId,
        weight: product.weight,
        kind: normalizeKind(item.kind),
        crate: normalizeCrate(item.crate),
        clientId: client.id,
        clientName: client.name,
      });
    }
  }
  return out;
}

// Core dough math: total raw grams = Σ (quantity × unit weight) over every
// (client, product) association in a tab. getQty(qtyId) returns the quantity entered
// for that pair (pieces, or kilograms for a 'kg' product — its weight is 1000 g/kg).
export function computeTarget(config, tab, getQty) {
  let total = 0;
  for (const row of getTabProducts(config, tab)) {
    const qty = Number(getQty(row.qtyId)) || 0;
    total += qty * clampWeight(row.weight);
  }
  return total;
}

// ── Divisor (display-only crate split) ────────────────────────────────────────
// The divisor box sums the dough of the SELECTED products of a tab and divides it
// into N crates. It NEVER touches the recipe or the log. Selection is by product id,
// so ticking a product splits its dough across every client that orders it.

export function getDivisorIncluded(config, tab) {
  const inc = config && config.divisorIncluded;
  return inc && Array.isArray(inc[tab]) ? inc[tab] : [];
}

export function isInDivisor(config, tab, productId) {
  return getDivisorIncluded(config, tab).includes(productId);
}

// The tab's rows currently in the divisor (every association of a ticked product).
export function getDivisorProducts(config, tab) {
  const included = getDivisorIncluded(config, tab);
  return getTabProducts(config, tab).filter(row => included.includes(row.id));
}

// Total raw grams the divisor splits: Σ (quantity × unit weight) over the INCLUDED
// associations only. Same shape as computeTarget but limited to the divisor selection.
export function divisorTotal(config, tab, getQty) {
  let total = 0;
  for (const row of getDivisorProducts(config, tab)) {
    const qty = Number(getQty(row.qtyId)) || 0;
    total += qty * clampWeight(row.weight);
  }
  return total;
}

// Grams per crate = total ÷ n, or 0 when n is 0/invalid. Never returns NaN.
export function splitDough(total, n) {
  const parts = Number(n);
  if (!Number.isFinite(parts) || parts <= 0) return 0;
  const grams = Number(total);
  if (!Number.isFinite(grams) || grams < 0) return 0;
  return grams / parts;
}

// ── Crate boxes (display-only, per association) ────────────────────────────────
// A per-association helper that tells the baker how many crates an order fills. The
// crate config (show, perBox) lives on the client↔product item; getTabProducts merges
// it onto each row, so these operate on a row exactly as before.

export function isCrateEnabled(row) {
  return !!(row && row.crate && row.crate.show);
}

export function getCratePerBox(row) {
  return clampCratePerBox(row && row.crate ? row.crate.perBox : undefined);
}

export function crateCount(qty, perBox) {
  const n = Number(qty);
  const per = Number(perBox);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (!Number.isFinite(per) || per <= 0) return 0;
  return n / per;
}

// ── Normalisation & migration ─────────────────────────────────────────────────

// An association's optional crate box: shown only when explicitly enabled; perBox
// always clamped so the math never sees a zero/garbage divisor.
function normalizeCrate(raw) {
  return {
    show: !!(raw && raw.show),
    perBox: clampCratePerBox(raw && raw.perBox),
  };
}

// A catalogue product: stable id, name, the recipe it belongs to, and its weight.
function normalizeProduct(p) {
  if (!p || typeof p !== 'object' || !p.id) return null;
  const recipe = p.recipeId != null ? p.recipeId : p.dough; // tolerate the old field name
  return {
    id: String(p.id),
    name: String(p.name || 'Product'),
    recipeId: TABS.includes(recipe) ? recipe : 'focaccia',
    weight: clampWeight(p.weight),
  };
}

// Normalise the catalogue, dropping junk and de-duplicating by id (first wins).
function normalizeProducts(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const p of raw) {
    const np = normalizeProduct(p);
    if (np && !seen.has(np.id)) { seen.add(np.id); out.push(np); }
  }
  return out;
}

// One client item: a reference to a catalogue product plus the association's input
// kind and crate box. Items pointing at a non-existent product are dropped.
function normalizeItem(raw, validProductIds) {
  if (!raw || typeof raw !== 'object') return null;
  const productId = String(raw.productId || '');
  if (!validProductIds.has(productId)) return null;
  return { productId, kind: normalizeKind(raw.kind), crate: normalizeCrate(raw.crate) };
}

// A client in the new shape: id, name and items pruned to existing products.
function normalizeClient(client, validProductIds) {
  if (!client || typeof client !== 'object') return null;
  const items = Array.isArray(client.items)
    ? client.items.map(i => normalizeItem(i, validProductIds)).filter(Boolean)
    : [];
  return {
    id: String(client.id || ''),
    name: String(client.name || 'Client'),
    items,
  };
}

// One WhatsApp list client entry, validated against the catalogue + address book.
function normalizeListClient(raw, validClientIds, validProductIds) {
  if (!raw || typeof raw !== 'object') return null;
  const clientId = String(raw.clientId || '');
  if (!validClientIds.has(clientId)) return null;
  const products = Array.isArray(raw.products)
    ? raw.products.map(String).filter(id => validProductIds.has(id))
    : [];
  return { clientId, products };
}

function normalizeWhatsappList(raw, validClientIds, validProductIds) {
  if (!raw || typeof raw !== 'object') return null;
  const clients = Array.isArray(raw.clients)
    ? raw.clients.map(c => normalizeListClient(c, validClientIds, validProductIds)).filter(Boolean)
    : [];
  return { id: String(raw.id || 'wl'), title: String(raw.title || 'Order'), clients };
}

function normalizeWhatsappLists(raw, clients, validProductIds) {
  if (!Array.isArray(raw)) return [];
  const validClientIds = new Set(clients.map(c => c.id));
  return raw.map(l => normalizeWhatsappList(l, validClientIds, validProductIds)).filter(Boolean);
}

// A direct WhatsApp client: typed name (kept as-is) plus product ids pruned to ones
// that still exist. A fully empty entry (no name AND no products) is dropped.
function normalizeWhatsappClient(raw, validProductIds) {
  if (!raw || typeof raw !== 'object') return null;
  const products = Array.isArray(raw.products)
    ? raw.products.map(String).filter(id => validProductIds.has(id))
    : [];
  const name = String(raw.name || '');
  if (name.trim() === '' && products.length === 0) return null;
  return { id: String(raw.id || 'wc'), name, products };
}

function normalizeWhatsappClients(raw, validProductIds) {
  if (!Array.isArray(raw)) return [];
  return raw.map(c => normalizeWhatsappClient(c, validProductIds)).filter(Boolean);
}

// Convert the OLD `groups` shape (a group = a title + client ids, implicitly carrying
// each client's whole product list) into the new independent-list shape. Each client
// entry is seeded with all the products that client currently orders.
function groupsToLists(groups, clients) {
  if (!Array.isArray(groups)) return [];
  const byId = new Map(clients.map(c => [c.id, c]));
  return groups.map((g, gi) => {
    const clientIds = Array.isArray(g && g.clientIds) ? g.clientIds : [];
    const entries = clientIds.map(cid => {
      const client = byId.get(String(cid));
      if (!client) return null;
      return { clientId: client.id, products: (client.items || []).map(i => i.productId) };
    }).filter(Boolean);
    return { id: String((g && g.id) || 'wl-' + gi), title: String((g && g.title) || 'Order'), clients: entries };
  });
}

// Per-tab "show Extra dough box" flags. Default shown (true) unless explicitly false.
function normalizeExtraDough(raw) {
  const out = {};
  for (const tab of TABS) out[tab] = !(raw && raw[tab] === false);
  return out;
}

// Per-tab "show this recipe's logs" flags. Default shown (true) unless explicitly false.
function normalizeLogVisibility(raw) {
  const out = {};
  for (const tab of TABS) out[tab] = !(raw && raw[tab] === false);
  return out;
}

function normalizeLogRetention(raw) {
  const n = Number(raw);
  return LOG_RETENTION_OPTIONS.includes(n) ? n : LOG_RETENTION_DEFAULT;
}

function normalizeLogRetentionByDough(raw, legacyGlobal) {
  const fallback = normalizeLogRetention(legacyGlobal);
  const out = {};
  for (const tab of TABS) {
    const n = raw && Number(raw[tab]);
    out[tab] = LOG_RETENTION_OPTIONS.includes(n) ? n : fallback;
  }
  return out;
}

// The set of catalogue product ids that belong to a given recipe.
function recipeProductIds(products, recipeId) {
  const ids = new Set();
  for (const p of products) if (p.recipeId === recipeId) ids.add(p.id);
  return ids;
}

// Which catalogue product ids each tab's divisor includes, pruned to ids that still
// exist in that recipe so a deleted product never lingers. Defaults to none.
function normalizeDivisorIncluded(raw, products) {
  const out = {};
  for (const tab of TABS) {
    const ids = recipeProductIds(products, tab);
    const stored = raw && Array.isArray(raw[tab]) ? raw[tab].map(String) : [];
    out[tab] = stored.filter(id => ids.has(id));
  }
  return out;
}

// Assemble the normalised config from an already-normalised catalogue + clients plus
// the raw document's remaining sections. Shared by the new-shape and migration paths.
function assemble(products, clients, raw) {
  const validProductIds = new Set(products.map(p => p.id));
  const rawLists = Array.isArray(raw.whatsappLists)
    ? raw.whatsappLists
    : groupsToLists(raw.groups, clients);
  return {
    products,
    clients,
    whatsappLists: normalizeWhatsappLists(rawLists, clients, validProductIds),
    whatsappClients: normalizeWhatsappClients(raw.whatsappClients, validProductIds),
    extraDough: normalizeExtraDough(raw.extraDough),
    divisorIncluded: normalizeDivisorIncluded(raw.divisorIncluded, products),
    logVisibility: normalizeLogVisibility(raw.logVisibility),
    logRetentionHours: normalizeLogRetention(raw.logRetentionHours),
    logRetentionByDough: normalizeLogRetentionByDough(raw.logRetentionByDough, raw.logRetentionHours),
  };
}

// Migrate the previous NESTED shape (clients[].products[]) into the catalogue + items
// shape. Additive and lossless: the catalogue is built from the nested products
// (de-duplicated by id), each client gets `items` referencing them with the product's
// kind/crate, and the original nested `products[]` are LEFT in place on each client as
// a revert safety window (the new code ignores them).
function migrateNested(rawClients) {
  const products = [];
  const seen = new Set();
  const clients = [];
  for (const c of rawClients) {
    if (!c || typeof c !== 'object') continue;
    const items = [];
    for (const p of (Array.isArray(c.products) ? c.products : [])) {
      const np = normalizeProduct(p);
      if (!np) continue;
      if (!seen.has(np.id)) { seen.add(np.id); products.push(np); }
      items.push({ productId: np.id, kind: normalizeKind(p.kind), crate: normalizeCrate(p.crate) });
    }
    // Keep the ORIGINAL nested products verbatim as a revert safety window: the new
    // code never reads them, but the old code (if reverted) still can. They are
    // dropped on the first save in the new shape (the new-shape path keeps no nested).
    clients.push({
      id: String(c.id || ''), name: String(c.name || 'Client'), items,
      products: Array.isArray(c.products) ? c.products : [],
    });
  }
  return { products, clients };
}

// Migrate the OLDEST per-tab shape ({focaccia,brioche,sourdough}.clients + market)
// into the catalogue + items shape. Clients with the same name across tabs/market are
// merged; each market list becomes a group referencing those clients. Best-effort:
// market-only product names cannot become catalogue products and are dropped — safe
// because no real data exists yet (placeholders only).
function migrateLegacy(raw) {
  const products = [];
  const seen = new Set();
  const byName = new Map(); // lowercased name -> client object { id, name, items }
  const order = [];

  function findOrCreateClient(name, idHint) {
    const key = String(name || 'Client').trim().toLowerCase();
    let client = byName.get(key);
    if (!client) {
      client = { id: String(idHint || 'c-' + (key.replace(/\s+/g, '-') || 'client')), name: String(name || 'Client'), items: [] };
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
      for (const p of (Array.isArray(legacyClient.products) ? legacyClient.products : [])) {
        const np = normalizeProduct({ ...p, recipeId: tab });
        if (!np) continue;
        if (!seen.has(np.id)) { seen.add(np.id); products.push(np); }
        client.items.push({ productId: np.id, kind: normalizeKind(p.kind), crate: normalizeCrate(p.crate) });
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

  const clients = order.map(c => ({ id: c.id, name: c.name, items: c.items }));
  return assemble(products, clients, { ...raw, whatsappLists: undefined, groups });
}

// Pull the legacy market section into a flat list of {id,title,clients} shapes.
function legacyMarketLists(market) {
  if (!market || typeof market !== 'object') return [];
  if (Array.isArray(market.lists)) return market.lists;
  if (Array.isArray(market.clients)) {
    return [{ id: 'list-market', title: market.title || 'Market order', clients: market.clients }];
  }
  return [];
}

// Produce a safe, well-formed config from arbitrary (e.g. Firestore) input. A new
// catalogue document (with `products`) is validated; a nested document
// (clients[].products) is migrated to the catalogue; an oldest per-tab document is
// migrated; missing/garbage input falls back to the default so the app always renders.
export function normalizeConfig(raw) {
  const base = cloneConfig(DEFAULT_CONFIG);
  if (!raw || typeof raw !== 'object') return base;

  // New catalogue shape: products[] is the source of truth.
  if (Array.isArray(raw.products)) {
    const products = normalizeProducts(raw.products);
    const validProductIds = new Set(products.map(p => p.id));
    const clients = Array.isArray(raw.clients)
      ? raw.clients.map(c => normalizeClient(c, validProductIds)).filter(Boolean)
      : [];
    return assemble(products, clients, raw);
  }

  // Previous nested shape: clients each carry their own products[].
  if (Array.isArray(raw.clients)) {
    const { products, clients } = migrateNested(raw.clients);
    return assemble(products, clients, raw);
  }

  // Oldest per-tab + market shape.
  if (raw.focaccia || raw.brioche || raw.sourdough || raw.market) {
    return migrateLegacy(raw);
  }

  return base;
}
