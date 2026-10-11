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

// Dates the same way everywhere: "11 Oct 2026".
const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(value) {
  return day.format(new Date(value));
}
