// Money is stored as whole paise (Rs 8,000 = 800000). Shown with Indian digit grouping.
const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatRupees(paise) {
  return rupees.format(paise / 100);
}

// What someone types in a rupee box ("8,000" or "8000.50") as whole paise,
// or null if it is not a sensible amount. Commas and spaces are ignored.
export function rupeesToPaise(text) {
  const clean = String(text ?? '').replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

// Paise back into the text for a rupee box (800050 -> "8000.50").
export function paiseToInput(paise) {
  const whole = Math.floor(paise / 100);
  const fraction = paise % 100;
  return fraction ? `${whole}.${String(fraction).padStart(2, '0')}` : String(whole);
}

// Dates are "YYYY-MM-DD" text (a day on the calendar). They are read as
// midday UTC, so the same date shows everywhere, whatever the time zone.
const asDate = (text) => new Date(`${text}T12:00:00Z`);
const fmt = (options) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...options });

const full = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const weekday = fmt({ weekday: 'short' });
const monthOnly = fmt({ month: 'short' });

// "11 Oct 2026" (also accepts a full timestamp like createdAt)
export function formatDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return full.format(asDate(value));
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

// "13 Oct"
export function formatDayMonth(text) {
  return dayMonth.format(asDate(text));
}

// "Tue"
export function formatWeekday(text) {
  return weekday.format(asDate(text));
}

// "Oct"
export function formatMonth(text) {
  return monthOnly.format(asDate(text));
}

// "13 to 16 Oct 2026", "30 Oct to 2 Nov 2026", "30 Dec 2026 to 2 Jan 2027"
export function formatRange(start, end) {
  if (start === end) return formatDate(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const sameMonth = sameYear && start.slice(5, 7) === end.slice(5, 7);
  if (sameMonth) return `${Number(start.slice(8))} to ${formatDate(end)}`;
  if (sameYear) return `${formatDayMonth(start)} to ${formatDate(end)}`;
  return `${formatDate(start)} to ${formatDate(end)}`;
}

// "Manali, Himachal Pradesh" (country added only when it is not India)
export function placeLine(destination) {
  const parts = [destination.name, destination.state];
  if (destination.country && destination.country !== 'India') parts.push(destination.country);
  return parts.filter(Boolean).join(', ');
}

// "09:30" -> "9:30 am", "14:05" -> "2:05 pm" (a stop's time, as people say it)
export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// A moment (ISO timestamp) as the clock time on this device: "2:05 pm"
const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
export function formatClock(timestamp) {
  return clock.format(new Date(timestamp)).replace(/\s?([ap])\.?m\.?$/i, (_, x) => ` ${x.toLowerCase()}m`);
}

// "1 stop", "3 stops"
export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
