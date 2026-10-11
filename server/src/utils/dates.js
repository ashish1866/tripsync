// Trip dates are stored as plain "YYYY-MM-DD" text. A trip date is a day on
// the calendar, not a moment in time, so text avoids every time-zone surprise
// (13 Oct in Manali must never turn into 12 Oct on a server in Singapore).

export const MAX_TRIP_DAYS = 30;

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

// True for a real calendar date like "2026-10-13" (and false for "2026-02-30").
export function isRealDate(text) {
  if (typeof text !== 'string' || !DATE_SHAPE.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

// "2026-10-13" plus 2 days is "2026-10-15".
export function addDays(text, days) {
  const d = new Date(`${text}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whole days from `from` to `to` ("2026-10-13" to "2026-10-15" is 2).
export function daysFrom(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Every date from start to end, both included.
export function datesBetween(startDate, endDate) {
  const count = daysFrom(startDate, endDate) + 1;
  if (count < 1) return [];
  return Array.from({ length: count }, (_, i) => addDays(startDate, i));
}

// DATES TO DAYS: one empty day per trip date, numbered from 1.
export function buildDays(startDate, endDate) {
  return datesBetween(startDate, endDate).map((date, i) => ({ dayNumber: i + 1, date, activities: [] }));
}

// Plain-language problem with a date range, or null if it is fine.
export function dateRangeProblem(startDate, endDate) {
  if (!isRealDate(startDate)) return 'Pick a real start date.';
  if (!isRealDate(endDate)) return 'Pick a real end date.';
  if (startDate < '2000-01-01' || endDate > '2100-12-31') return 'Pick dates between the years 2000 and 2100.';
  const length = daysFrom(startDate, endDate) + 1;
  if (length < 1) return 'The trip cannot end before it starts.';
  if (length > MAX_TRIP_DAYS) return `A trip can be at most ${MAX_TRIP_DAYS} days long.`;
  return null;
}
