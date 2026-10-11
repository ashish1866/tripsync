import { z } from 'zod';
import { isRealDate } from '../utils/dates.js';
import { formatRs } from '../utils/money.js';

// A bill. Money is whole paise (Rs 8,000 = 800000), never a fraction.
export const MAX_AMOUNT = 1_000_000_000; // Rs 1 crore
export const CATEGORIES = ['stay', 'travel', 'food', 'activities', 'shopping', 'other'];
const MAX_PEOPLE = 20;

const uid = z.string('Pick a person from the trip.').regex(/^[A-Za-z0-9_-]{1,128}$/, 'Pick a person from the trip.');

const amount = z
  .number('Enter the amount as a number of rupees.')
  .int('The amount must be whole paise, with no fractions.')
  .min(1, 'Enter an amount above zero.')
  .max(MAX_AMOUNT, 'A bill can be at most Rs 1,00,00,000.');

const split = z.discriminatedUnion(
  'type',
  [
    // Equal: the server works out the shares (leftover paise to the first people).
    z.strictObject({
      type: z.literal('equal'),
      among: z.array(uid, 'Pick who shares the bill.').min(1, 'Pick at least one person to share the bill.').max(MAX_PEOPLE),
    }),
    // Exact: every share is given; they must add up to the amount.
    z.strictObject({
      type: z.literal('exact'),
      shares: z
        .array(
          z.strictObject({
            uid,
            share: z.number('Each share must be a number of rupees.').int('Each share must be whole paise.').min(1, 'Each share must be above zero. Leave a person out instead.'),
          }),
          'Give each person their share.',
        )
        .min(1, 'Give at least one person a share.')
        .max(MAX_PEOPLE),
    }),
  ],
  'Pick how the bill is split: equally, or by exact amounts.',
);

export const expenseBody = z
  .strictObject({
    title: z.string('Say what the bill was for.').trim().min(1, 'Say what the bill was for, for example "Hotel, 2 nights".').max(80, 'Keep the bill name under 80 characters.'),
    amount,
    category: z.enum(CATEGORIES, 'Pick a category for the bill.'),
    paidBy: uid,
    date: z.string('Pick the date of the bill.').refine(isRealDate, 'Pick a real date for the bill.'),
    split,
  })
  .superRefine((bill, ctx) => {
    const uids = bill.split.type === 'equal' ? bill.split.among : bill.split.shares.map((s) => s.uid);
    if (new Set(uids).size !== uids.length) ctx.addIssue({ code: 'custom', message: 'Each person can be in the split only once.', path: ['split'] });
    if (bill.split.type === 'exact') {
      const total = bill.split.shares.reduce((n, s) => n + s.share, 0);
      if (total !== bill.amount) {
        // The rule's own words: "Splits must add up to Rs X".
        ctx.addIssue({ code: 'custom', message: `Splits must add up to ${formatRs(bill.amount)}. They add up to ${formatRs(total)}.`, path: ['split'] });
      }
    }
  });

// POST /trips/:id/settlements ("Mark as paid"): from pays to.
export const settlementBody = z
  .strictObject({ from: uid, to: uid, amount })
  .refine((s) => s.from !== s.to, 'Someone cannot pay themselves. Pick two different people.');

export const expenseParams = z.object({
  id: z.string(),
  expenseId: z.string().regex(/^[a-f0-9]{24}$/i, 'This bill does not exist.'),
});
