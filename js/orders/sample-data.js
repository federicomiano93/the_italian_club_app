// sample-data.js — TEST SCAFFOLDING.
//
// Sample suppliers, ingredients and order history so the Orders UI can be tested
// before the management panel (Phase 4) exists. Triggered by the "Load sample
// data" button shown only when the suppliers collection is empty. Safe to remove
// once real data is entered through the management panel.

import { saveDoc, COLLECTIONS } from './firebase-orders.js';

export const SAMPLE_SUPPLIERS = [
  { id: 'bidfood', name: 'Bidfood', category: 'Dry goods', deliveryDays: ['Monday', 'Thursday'], active: true },
  { id: 'freshdairy', name: 'Fresh Dairy Co', category: 'Dairy', deliveryDays: ['Tuesday', 'Friday'], active: true },
  { id: 'greengrocer', name: 'Green Grocer', category: 'Fresh produce', deliveryDays: ['Wednesday'], active: true },
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

// Two past weeks so "last week" reference and trend badges have data.
// (Smart suggestions need 4 weeks — added in Phase 5.)
export const SAMPLE_HISTORY = [
  {
    id: '2026-W23',
    weekStart: '2026-06-01',
    quantities: {
      'flour-t55': 45, 'flour-wholemeal': 8, 'caster-sugar': 10, 'sea-salt': 5, 'fresh-yeast': 3,
      'butter': 10, 'whole-milk': 18, 'eggs': 12, 'tomatoes': 20, 'rosemary': 5,
    },
  },
  {
    id: '2026-W24',
    weekStart: '2026-06-08',
    quantities: {
      'flour-t55': 50, 'flour-wholemeal': 10, 'caster-sugar': 8, 'sea-salt': 5, 'fresh-yeast': 3,
      'butter': 12, 'whole-milk': 20, 'eggs': 15, 'tomatoes': 18, 'rosemary': 6,
    },
  },
];

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
