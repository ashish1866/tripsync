import { useRef, useState } from 'react';
import api, { errorMessage } from '../api/client';
import TextField from './TextField';
import SelectField from './SelectField';
import ChoicePlates from './ChoicePlates';
import Button from './Button';
import Notice from './Notice';
import { CATEGORIES, equalShares } from '../utils/money';
import { formatRupees, paiseToInput, rupeesToPaise } from '../utils/format';
import { todayText } from '../utils/dates';
import styles from './ExpenseForm.module.css';

const MAX_AMOUNT = 1_000_000_000; // paise, Rs 1 crore

// Add a bill, or edit one: what, how much, category, who paid, when, and how
// it is split (equally among some people, or by exact amounts).
// onSaved() is called after the server accepts it.
export default function ExpenseForm({ trip, me, expense, onSaved, onCancel }) {
  const editing = Boolean(expense);
  const people = trip.members.map((m) => ({ uid: m.uid, name: m.name }));
  const everyone = people.map((p) => p.uid);
  const [values, setValues] = useState(() => ({
    title: expense?.title ?? '',
    amount: expense ? paiseToInput(expense.amount) : '',
    category: expense?.category ?? 'stay',
    paidBy: expense?.paidBy && everyone.includes(expense.paidBy) ? expense.paidBy : me,
    date: expense?.date ?? todayText(),
    splitType: expense?.splitType ?? 'equal',
  }));
  const [among, setAmong] = useState(() => (expense?.splitType === 'equal' ? expense.splits.map((s) => s.uid).filter((u) => everyone.includes(u)) : everyone));
  const [exact, setExact] = useState(() =>
    Object.fromEntries(people.map((p) => [p.uid, expense?.splitType === 'exact' ? paiseToInput(expense.splits.find((s) => s.uid === p.uid)?.share ?? 0).replace(/^0$/, '') : ''])),
  );
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const set = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined, split: field === 'amount' ? undefined : e.split }));
  };

  const amount = rupeesToPaise(values.amount);
  const shares = values.splitType === 'equal' ? equalShares(amount || 0, among) : null;
  const exactShares = people.map((p) => ({ uid: p.uid, text: exact[p.uid], share: exact[p.uid].trim() === '' ? 0 : rupeesToPaise(exact[p.uid]) }));
  const exactTotal = exactShares.reduce((n, s) => n + (s.share || 0), 0);

  function check() {
    const found = {};
    if (!values.title.trim()) found.title = 'Say what the bill was for, for example "Hotel, 2 nights".';
    else if (values.title.trim().length > 80) found.title = 'Keep the bill name under 80 characters.';
    if (values.amount.trim() === '' || amount === null || amount <= 0) found.amount = 'Enter the amount in rupees, for example 8000.';
    else if (amount > MAX_AMOUNT) found.amount = 'A bill can be at most Rs 1,00,00,000.';
    if (!values.date) found.date = 'Pick the date of the bill.';
    if (values.splitType === 'equal' && among.length === 0) found.split = 'Pick at least one person to share the bill.';
    if (values.splitType === 'exact') {
      if (exactShares.some((s) => s.share === null)) found.split = 'Write each share in rupees, for example 2500. Leave a box empty to leave that person out.';
      else if (exactTotal === 0) found.split = 'Give at least one person a share.';
      else if (amount && exactTotal !== amount) found.split = `Splits must add up to ${formatRupees(amount)}. They add up to ${formatRupees(exactTotal)}.`;
    }
    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"], fieldset[aria-describedby] input')?.focus());
      return;
    }
    const body = {
      title: values.title.trim(),
      amount,
      category: values.category,
      paidBy: values.paidBy,
      date: values.date,
      split: values.splitType === 'equal' ? { type: 'equal', among } : { type: 'exact', shares: exactShares.filter((s) => s.share > 0).map(({ uid, share }) => ({ uid, share })) },
    };
    setBusy(true);
    try {
      if (editing) await api.patch(`/trips/${trip.id}/expenses/${expense.id}`, body);
      else await api.post(`/trips/${trip.id}/expenses`, body);
      if (!editing) {
        setValues((v) => ({ ...v, title: '', amount: '' }));
        setExact(Object.fromEntries(people.map((p) => [p.uid, ''])));
      }
      await onSaved();
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (uid) => people.find((p) => p.uid === uid)?.name ?? 'Former member';
  const shareHint = (uid) => {
    if (!amount || !among.includes(uid)) return 'Not sharing';
    return formatRupees(shares.find((s) => s.uid === uid).share);
  };

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate aria-label={editing ? `Edit the bill ${expense.title}` : 'Add a bill'}>
      {errors.form && <Notice tone="warning">{errors.form}</Notice>}
      <TextField label="What it was for" value={values.title} onChange={set('title')} error={errors.title} disabled={busy} maxLength={100} autoComplete="off" />
      <div className={styles.row}>
        <TextField label="Amount (₹)" inputMode="decimal" value={values.amount} onChange={set('amount')} error={errors.amount} disabled={busy} autoComplete="off" />
        <SelectField label="Category" value={values.category} onChange={set('category')} disabled={busy} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
      </div>
      <div className={styles.row}>
        <SelectField label="Paid by" value={values.paidBy} onChange={set('paidBy')} disabled={busy} options={people.map((p) => ({ value: p.uid, label: p.uid === me ? `${p.name} (you)` : p.name }))} />
        <TextField label="Date" type="date" value={values.date} onChange={set('date')} error={errors.date} disabled={busy} />
      </div>

      <ChoicePlates
        legend="How it is split"
        value={values.splitType}
        onChange={(splitType) => {
          setValues((v) => ({ ...v, splitType }));
          setErrors((e) => ({ ...e, split: undefined }));
        }}
        disabled={busy}
        options={[
          { value: 'equal', label: 'Equally', hint: 'The same share each. Leftover paise go to the first people.' },
          { value: 'exact', label: 'Exact amounts', hint: 'Write what each person owes.' },
        ]}
      />

      {values.splitType === 'equal' ? (
        <ChoicePlates
          legend="Shared by"
          multiple
          compact
          value={among}
          onChange={(next) => {
            setAmong(next);
            setErrors((e) => ({ ...e, split: undefined }));
          }}
          disabled={busy}
          error={errors.split}
          options={people.map((p) => ({ value: p.uid, label: p.name, hint: shareHint(p.uid) }))}
        />
      ) : (
        <fieldset className={styles.exact} aria-describedby={errors.split ? 'exact-error' : undefined}>
          <legend className={styles.legend}>Each person's share (₹)</legend>
          <div className={styles.exactGrid}>
            {people.map((p) => (
              <TextField
                key={p.uid}
                label={nameOf(p.uid)}
                inputMode="decimal"
                value={exact[p.uid]}
                onChange={(e) => {
                  const text = e.target.value;
                  setExact((x) => ({ ...x, [p.uid]: text }));
                  setErrors((er) => ({ ...er, split: undefined }));
                }}
                disabled={busy}
                autoComplete="off"
                aria-invalid={errors.split ? 'true' : undefined}
              />
            ))}
          </div>
          <p className={`${styles.total} ${amount && exactTotal !== amount ? styles.off : ''}`} aria-live="polite">
            {amount ? `${formatRupees(exactTotal)} of ${formatRupees(amount)} shared.${exactTotal !== amount ? ` ${formatRupees(Math.abs(amount - exactTotal))} ${exactTotal < amount ? 'still to share' : 'too much'}.` : ''}` : 'Enter the amount first.'}
          </p>
          {errors.split && (
            <p className={styles.error} id="exact-error">
              {errors.split}
            </p>
          )}
        </fieldset>
      )}

      <div className={styles.actions}>
        <Button type="submit" busy={busy}>
          {busy ? 'Saving' : editing ? 'Save the bill' : 'Add the bill'}
        </Button>
        {onCancel && (
          <Button variant="plain" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
