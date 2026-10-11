// Bills in the browser. The server checks everything again; these helpers only
// let the form show the right numbers before anything is sent.

// Budget categories, each painted in a kilometre stone's cap colour
// (tokens --km-*, see DESIGN-DECISIONS "Money").
export const CATEGORIES = [
  { value: 'stay', label: 'Stay', road: 'national' },
  { value: 'travel', label: 'Travel', road: 'state' },
  { value: 'food', label: 'Food', road: 'village' },
  { value: 'activities', label: 'Activities', road: 'district' },
  { value: 'shopping', label: 'Shopping', road: 'city' },
  { value: 'other', label: 'Other', road: 'plain' },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

// The same leftover-paise rule as the server: extra paise one each to the first people.
export function equalShares(amount, uids) {
  if (!uids.length) return [];
  const base = Math.floor(amount / uids.length);
  let leftover = amount - base * uids.length;
  return uids.map((uid) => {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    return { uid, share: base + extra };
  });
}
