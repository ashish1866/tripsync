import { z } from 'zod';
import { isStoredLocation } from '../utils/coords.js';
import { MAX_TRIP_DAYS } from '../utils/dates.js';

// A stop on one day of the trip (the brief calls it an "activity").
// Stored inside the trip: days[].activities[] = { id, title, time, notes, place, addedBy, createdAt }.

export const MAX_STOPS_PER_DAY = 30;

const title = z
  .string('Give the stop a name.')
  .trim()
  .min(1, 'Give the stop a name, for example "Solang Valley".')
  .max(80, 'Keep the stop name under 80 characters.');

// "" (no time) or "HH:MM" on a 24-hour clock.
const time = z
  .string('Pick a time like 09:30, or leave it empty.')
  .trim()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Pick a time like 09:30, or leave it empty.');

const notes = z.string('Notes must be text.').trim().max(500, 'Keep the notes under 500 characters.');

// A place picked from the stop search (/geo/spots). Location is [lng, lat].
export const place = z.strictObject(
  {
    name: z.string('Pick the place from the search.').trim().min(1, 'Pick the place from the search.').max(120),
    address: z.string().trim().max(200).default(''),
    location: z.custom(isStoredLocation, 'This place has no valid map point. Pick it from the search again.'),
    placeId: z.string().trim().max(300).default(''),
  },
  'Pick the place from the search.',
);

export const newActivityBody = z.strictObject({
  title,
  time: time.default(''),
  notes: notes.default(''),
  place: place.nullable().default(null),
});

// PATCH: only the fields that changed, so two people editing different
// fields (or different stops) never undo each other. dayNumber moves the stop.
export const editActivityBody = z
  .strictObject({
    title: title.optional(),
    time: time.optional(),
    notes: notes.optional(),
    place: place.nullable().optional(),
    dayNumber: z
      .number('Pick a day of the trip.')
      .int('Pick a day of the trip.')
      .min(1, 'Pick a day of the trip.')
      .max(MAX_TRIP_DAYS, 'Pick a day of the trip.')
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Send at least one change: name, time, notes, place or day.');

// /trips/:id/days/:day/... ("2" -> 2)
export const dayParams = z.object({
  id: z.string(),
  day: z
    .string()
    .regex(/^\d{1,2}$/, 'Pick a day of the trip by its number, for example 2.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= MAX_TRIP_DAYS, 'Pick a day of the trip by its number, for example 2.'),
});

// /trips/:id/activities/:actId (ids are made by newItemId: 16 hex characters)
export const activityParams = z.object({
  id: z.string(),
  actId: z.string().regex(/^[A-Za-z0-9-]{1,40}$/, 'This stop does not exist.'),
});

// GET /geo/spots?q=Solang&tripId=...
export const spotQuery = z.object({
  q: z
    .string('Type at least 2 letters of the place.')
    .trim()
    .min(2, 'Type at least 2 letters of the place.')
    .max(80, 'Keep the search under 80 characters.'),
  tripId: z.string(),
});
