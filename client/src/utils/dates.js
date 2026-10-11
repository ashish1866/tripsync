// Today's date on this device as "YYYY-MM-DD" (the traveller's own calendar day).
export function todayText() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Whole days from one "YYYY-MM-DD" to another.
export function daysFrom(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Number of days in a trip, both ends included.
export function tripLength(startDate, endDate) {
  return daysFrom(startDate, endDate) + 1;
}

// "Starts in 12 days", "Day 2 of 4 today", "Ended 3 days ago"
export function whenLine(startDate, endDate, today = todayText()) {
  const toStart = daysFrom(today, startDate);
  if (toStart > 1) return `Starts in ${toStart} days`;
  if (toStart === 1) return 'Starts tomorrow';
  if (today <= endDate) return `Day ${1 - toStart} of ${tripLength(startDate, endDate)} today`;
  const ago = daysFrom(endDate, today);
  return ago === 1 ? 'Ended yesterday' : `Ended ${ago} days ago`;
}
