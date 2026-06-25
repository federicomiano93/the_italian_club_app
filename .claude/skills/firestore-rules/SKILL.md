---
name: firestore-rules
description: How to write or change Firestore security rules for The Italian Club. Use whenever a new Firestore collection is added, an existing one is changed, or firestore.rules is edited or reviewed. Every collection must require auth, validate its fields, carry bakery == 'main', restrict deletes, and the trailing default-deny block must never be weakened. After any change, the rules must be deployed.
---

# Firestore security rules — The Italian Club

All security is enforced server-side in `firestore.rules`. The app uses
**Anonymous Auth**, so `request.auth != null` only means "some app client",
never a specific person. Identity-based isolation is NOT possible at the rules
level yet — it needs real (non-anonymous) auth, which is a later step. Until
then, rules harden validation and the bakery stamp, not per-user read scope.

## Invariants — true for EVERY collection

1. **Auth required** on every read and write: `request.auth != null`.
2. **Bakery stamp**: every Orders-system document carries `bakery` and writes
   must validate it: `request.resource.data.bakery == 'main'`. This is
   forward-compatible with future per-bakery isolation.
3. **Field validation** on create/update: restrict the allowed keys and check
   each field's type/size. Never accept an open-ended payload.
4. **Deletes denied by default** (`allow delete: if false;`). Only allow delete
   where the data model overwrites/clears by design (e.g. the current draft).
5. **Default-deny stays last and untouched**: the trailing
   `match /{document=**} { allow read, write: if false; }` must always remain.
   Never remove or loosen it — it locks down any collection not explicitly listed.
6. **Deploy after every change**: `firebase deploy --only firestore:rules`
   (rules do NOT deploy automatically with the GitHub Pages push).

## Templates

### A. Shared collection that keeps history (no delete)
Use for reference/records like suppliers, ingredients, orders-history.
```
match /NEW_COLLECTION/{id} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null
    && request.resource.data.bakery == 'main'
    && request.resource.data.keys().hasOnly(['bakery', 'FIELD_A', 'FIELD_B'])
    && request.resource.data.FIELD_A is string
    && request.resource.data.FIELD_A.size() < 200;
  allow delete: if false;
}
```

### B. Mutable single document that is cleared by design (delete allowed)
Use only for draft-style data that is overwritten on every change and removed
when finalized (like drafts/current).
```
match /NEW_COLLECTION/{id} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null
    && request.resource.data.bakery == 'main';
  allow delete: if request.auth != null;
}
```

### C. Data tied to a person (future — Step 2 PIN login)
PIN login is app-level, NOT Firebase Auth, so anonymous auth still cannot prove
identity. Store the staff identity as a VALIDATED FIELD, and be honest that the
rules cannot enforce "only this person": they validate shape, not ownership.
Real ownership enforcement waits for real auth.
```
match /NEW_COLLECTION/{id} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null
    && request.resource.data.bakery == 'main'
    && request.resource.data.staffId is string
    && request.resource.data.staffId.size() > 0;
  allow delete: if false;
}
```

## How to add a collection (checklist)
1. Pick the matching template (A, B, or C).
2. Add the `match` block ABOVE the default-deny block, never below it.
3. List the exact allowed keys (including `bakery`) and validate each field.
4. Keep `bakery == 'main'` on every write.
5. Leave the trailing default-deny exactly as it is.
6. Deploy: `firebase deploy --only firestore:rules`.
7. Tell the user the collection name, the rule added, and to run the deploy.

## Never
- Never add `allow read, write: if true` or any rule without `request.auth`.
- Never remove or weaken the default-deny block.
- Never claim the rules enforce per-person/per-bakery isolation under anonymous
  auth — they do not.
