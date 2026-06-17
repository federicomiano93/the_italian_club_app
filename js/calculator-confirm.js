// calculator-confirm.js — one shared "unsaved changes" guard.
//
// Every editor (clients & products, recipes, market) asks the EXACT same
// question when the user tries to leave mid-edit, so the experience is
// consistent. confirm() offers OK / Cancel:
//   OK     → leave and lose the changes
//   Cancel → keep editing

export const UNSAVED_MESSAGE =
  'You have unsaved changes. Leave without saving? Your changes will be lost.';

// Returns true when it is safe to leave the editor now: either nothing was
// changed, or the user confirmed they want to discard their edits.
export function confirmDiscard(dirty) {
  return !dirty || confirm(UNSAVED_MESSAGE);
}
