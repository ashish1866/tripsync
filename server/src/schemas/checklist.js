import { z } from 'zod';

// The shared packing list. Stored inside the trip:
//   trips.checklist[] = { id, text, done, addedBy, createdAt, doneBy, doneAt }
export const MAX_ITEMS = 100;

const text = z
  .string('Write what to pack.')
  .trim()
  .min(1, 'Write what to pack, for example "Warm jacket".')
  .max(80, 'Keep the item under 80 characters.');

export const newItemBody = z.strictObject({ text });

// Ticking sends the state wanted, not "toggle", so pressing twice or two people
// pressing at once cannot flip it back by accident.
export const tickBody = z.strictObject({ done: z.boolean('Send true to mark it packed, or false to unmark it.') });

// /trips/:id/checklist/:itemId (ids are made by newItemId: 16 hex characters)
export const itemParams = z.object({
  id: z.string(),
  itemId: z.string().regex(/^[A-Za-z0-9-]{1,40}$/, 'This item does not exist.'),
});
