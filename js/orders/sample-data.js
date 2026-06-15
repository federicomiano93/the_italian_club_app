// sample-data.js — TEST SCAFFOLDING.
//
// Sample suppliers, ingredients and order history so the Orders UI can be tested
// before the management panel (Phase 4) exists. Triggered by the "Load sample
// data" button shown only when the suppliers collection is empty. Safe to remove
// once real data is entered through the management panel.

import { saveDoc, COLLECTIONS } from './firebase-orders.js';

export const SAMPLE_SUPPLIERS = [
  { id: 'bidfood', name: 'Bidfood', category: 'Dry goods', deliveryDays: ['Monday', 'Thursday'], phone: '447700900123', email: 'orders@bidfood.example', active: true },
  { id: 'freshdairy', name: 'Fresh Dairy Co', category: 'Dairy', deliveryDays: ['Tuesday', 'Friday'], phone: '447700900456', email: 'sales@freshdairy.example', active: true },
  { id: 'greengrocer', name: 'Green Grocer', category: 'Fresh produce', deliveryDays: ['Wednesday'], phone: '447700900789', email: 'hello@greengrocer.example', active: true },
];

export const SAMPLE_INGREDIENTS = [
  // Bidfood
  { id: 'flour-t55', supplierId: 'bidfood', name: 'Flour T55', category: 'Flour', unit: 'kg', active: true },
  { id: 'flour-wholemeal', supplierId: 'bidfood', name: 'Wholemeal Flour', category: 'Flour', unit: 'kg', active: true },
  { id: 'caster-sugar', supplierId: 'bidfood', name: 'Caster Sugar', category: 'Dry goods', unit: 'kg', active: true },
  { id: 'sea-salt', supplierId: 'bidfood', name: 'Sea Salt', category: 'Dry goods', unit: 'kg', active: true },
  { id: 'fresh-yeast', supplierId: 'bidfood', name: 'Fresh Yeast', category: 'Baking', unit: 'kg', active: true },
  // Fresh Dairy Co
  { id: 'butter', supplierId: 'freshdairy', name: 'Butter', category: 'Dairy', unit: 'kg', active: true },
  { id: 'whole-milk', supplierId: 'freshdairy', name: 'Whole Milk', category: 'Dairy', unit: 'L', active: true },
  { id: 'eggs', supplierId: 'freshdairy', name: 'Eggs', category: 'Dairy', unit: 'trays', active: true },
  // Green Grocer
  { id: 'tomatoes', supplierId: 'greengrocer', name: 'Tomatoes', category: 'Vegetables', unit: 'kg', active: true },
  { id: 'rosemary', supplierId: 'greengrocer', name: 'Rosemary', category: 'Herbs', unit: 'bunches', active: true },
];

// Five past weeks (each records stock on hand + quantity ordered) so the Phase 5
// suggestion engine activates (needs >= 4 weeks). Per ingredient, stock+order is
// kept ~constant across weeks, so the learned "par" level is stable and the
// suggestions are easy to sanity-check. [stock, order] per week:
const SAMPLE_WEEKS = [
  { id: '2026-W20', weekStart: '2026-05-11' },
  { id: '2026-W21', weekStart: '2026-05-18' },
  { id: '2026-W22', weekStart: '2026-05-25' },
  { id: '2026-W23', weekStart: '2026-06-01' },
  { id: '2026-W24', weekStart: '2026-06-08' },
];
const SAMPLE_WEEKLY = {
  'flour-t55':       [[5, 50], [8, 47], [3, 52], [6, 49], [4, 51]], // par ~55
  'flour-wholemeal': [[2, 10], [3, 9], [1, 11], [2, 10], [4, 8]],   // par ~12
  'caster-sugar':    [[4, 8], [2, 10], [5, 7], [3, 9], [4, 8]],     // par ~12
  'sea-salt':        [[1, 5], [2, 4], [1, 5], [0, 6], [1, 5]],      // par ~6
  'fresh-yeast':     [[1, 3], [0, 4], [1, 3], [2, 2], [1, 3]],      // par ~4
  'butter':          [[2, 12], [4, 10], [3, 11], [2, 12], [1, 13]], // par ~14
  'whole-milk':      [[2, 20], [4, 18], [3, 19], [2, 20], [5, 17]], // par ~22
  'eggs':            [[1, 15], [3, 13], [2, 14], [4, 12], [1, 15]], // par ~16
  'tomatoes':        [[3, 17], [2, 18], [0, 20], [4, 16], [2, 18]], // par ~20
  'rosemary':        [[1, 5], [2, 4], [0, 6], [1, 5], [2, 4]],      // par ~6
};

export const SAMPLE_HISTORY = SAMPLE_WEEKS.map((week, idx) => {
  const quantities = {};
  const stock = {};
  Object.entries(SAMPLE_WEEKLY).forEach(([id, weeks]) => {
    stock[id] = weeks[idx][0];
    quantities[id] = weeks[idx][1];
  });
  return { ...week, quantities, stock };
});

// Write all sample documents to Firestore. saveDoc() stamps bakery:"main".
export async function seedSampleData() {
  for (const s of SAMPLE_SUPPLIERS) {
    const { id, ...data } = s;
    await saveDoc(COLLECTIONS.suppliers, id, data);
  }
  for (const i of SAMPLE_INGREDIENTS) {
    const { id, ...data } = i;
    await saveDoc(COLLECTIONS.ingredients, id, data);
  }
  for (const h of SAMPLE_HISTORY) {
    const { id, ...data } = h;
    await saveDoc(COLLECTIONS.history, id, data);
  }
}
