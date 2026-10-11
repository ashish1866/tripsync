import { z } from 'zod';
import { dateRangeProblem, isRealDate } from '../utils/dates.js';
import { isStoredLocation } from '../utils/coords.js';

// Money is whole paise: Rs 8,000 is 800000. Never a fraction.
export const MAX_BUDGET_PAISE = 1_000_000_000; // Rs 1 crore

const tripName = z
  .string('Give the trip a name.')
  .trim()
  .min(1, 'Give the trip a name.')
  .max(80, 'Keep the trip name under 80 characters.');

const budget = z
  .number('Enter the budget as a number of rupees.')
  .int('The budget must be whole paise, with no fractions.')
  .min(0, 'The budget cannot be negative.')
  .max(MAX_BUDGET_PAISE, 'The budget can be at most Rs 1,00,00,000.');

const date = (label) => z.string(`Pick the ${label}.`).refine(isRealDate, `Pick a real ${label}.`);

// A place picked from the destination search. Location is [lng, lat].
export const destination = z.strictObject(
  {
    name: z.string().trim().min(1, 'Pick a destination from the search.').max(100),
    state: z.string().trim().max(100).default(''),
    country: z.string().trim().max(100).default(''),
    location: z.custom(isStoredLocation, 'The destination has no valid map point. Pick it from the search again.'),
  },
  'Pick a destination from the search.',
);

export const createTripBody = z
  .strictObject({
    name: tripName,
    destination,
    startDate: date('start date'),
    endDate: date('end date'),
    budget,
  })
  .superRefine((trip, ctx) => {
    const problem = dateRangeProblem(trip.startDate, trip.endDate);
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['endDate'] });
  });

// PATCH /trips/:id: any of these, at least one. Destination is fixed once the
// trip exists (its weather, places and pins all hang off it).
export const updateTripBody = z
  .strictObject({
    name: tripName.optional(),
    startDate: date('start date').optional(),
    endDate: date('end date').optional(),
    budget: budget.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Send at least one change: name, dates or budget.');

export const destinationQuery = z.object({
  q: z
    .string('Type at least 2 letters of a place.')
    .trim()
    .min(2, 'Type at least 2 letters of a place.')
    .max(60, 'Keep the search under 60 characters.'),
});
