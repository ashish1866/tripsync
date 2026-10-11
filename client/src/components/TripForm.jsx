import { useRef, useState } from 'react';
import TextField from './TextField';
import Button from './Button';
import Notice from './Notice';
import { formatRange, formatRupees, paiseToInput, plural, rupeesToPaise } from '../utils/format';
import { tripLength } from '../utils/dates';
import styles from './TripForm.module.css';

const MAX_DAYS = 30;
const MAX_BUDGET = 1_000_000_000; // paise, Rs 1 crore

// Name, dates and budget: shared by "Plan a new trip" and the owner's trip settings.
// `children` goes between the name and the dates (the destination search on a new trip).
// onSave(values) must return a promise; if it throws { field, message }, that
// message is shown under that field (or above the button for field "form").
export function useTripFields(initial = {}) {
  const [values, setValues] = useState({
    name: initial.name ?? '',
    startDate: initial.startDate ?? '',
    endDate: initial.endDate ?? '',
    budget: initial.budget !== undefined ? paiseToInput(initial.budget) : '',
  });
  const [errors, setErrors] = useState({});
  const update = (field) => (event) => {
    const value = event.target.value;
    setValues((v) => {
      const next = { ...v, [field]: value };
      // Picking a start date after the end date moves the end date along.
      if (field === 'startDate' && value && (!v.endDate || v.endDate < value)) next.endDate = value;
      return next;
    });
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
  };
  return { values, setValues, errors, setErrors, update };
}

export function checkTripFields(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'Give the trip a name, for example "Manali with college friends".';
  else if (values.name.trim().length > 80) errors.name = 'Keep the trip name under 80 characters.';
  if (!values.startDate) errors.startDate = 'Pick the first day of the trip.';
  if (!values.endDate) errors.endDate = 'Pick the last day of the trip.';
  if (values.startDate && values.endDate) {
    if (values.endDate < values.startDate) errors.endDate = 'The trip cannot end before it starts.';
    else if (tripLength(values.startDate, values.endDate) > MAX_DAYS) errors.endDate = `A trip can be at most ${MAX_DAYS} days long.`;
  }
  const paise = values.budget.trim() === '' ? 0 : rupeesToPaise(values.budget);
  if (paise === null) errors.budget = 'Enter the budget in rupees, for example 40000.';
  else if (paise > MAX_BUDGET) errors.budget = 'The budget can be at most Rs 1,00,00,000.';
  return { errors, paise };
}

export default function TripForm({ fields, onSubmit, submitLabel, busyLabel, busy, children, formRef: outerRef }) {
  const { values, errors, update } = fields;
  const innerRef = useRef(null);
  const formRef = outerRef || innerRef;
  const length = values.startDate && values.endDate && values.endDate >= values.startDate ? tripLength(values.startDate, values.endDate) : 0;
  const paise = rupeesToPaise(values.budget);

  return (
    <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
      {errors.form && <Notice tone="warning">{errors.form}</Notice>}
      <TextField label="Trip name" hint="What the group calls it." value={values.name} onChange={update('name')} error={errors.name} disabled={busy} maxLength={100} autoComplete="off" />
      {children}
      <div className={styles.dates}>
        <TextField label="First day" type="date" value={values.startDate} onChange={update('startDate')} error={errors.startDate} disabled={busy} />
        <TextField label="Last day" type="date" value={values.endDate} min={values.startDate || undefined} onChange={update('endDate')} error={errors.endDate} disabled={busy} />
      </div>
      {length > 0 && length <= MAX_DAYS && (
        <p className={styles.summary}>
          {plural(length, 'day')}, {formatRange(values.startDate, values.endDate)}. One day stone per date.
        </p>
      )}
      <TextField
        label="Budget for the whole group (₹)"
        hint="Optional. Spending is tracked against it."
        inputMode="decimal"
        value={values.budget}
        onChange={update('budget')}
        error={errors.budget}
        disabled={busy}
        autoComplete="off"
      />
      {paise !== null && paise > 0 && !errors.budget && <p className={styles.summary}>{formatRupees(paise)}</p>}
      <Button type="submit" busy={busy} className={styles.submit}>
        {busy ? busyLabel : submitLabel}
      </Button>
    </form>
  );
}
