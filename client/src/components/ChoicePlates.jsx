import { useId, useState } from 'react';
import styles from './ChoicePlates.module.css';

// Pick from a few options, drawn as painted plates side by side.
// Under the paint these are real radio buttons (or checkboxes with `multiple`),
// hidden visually but not from screen readers or the keyboard.
// options: [{ value, label, hint }]
// value: the chosen value, or with `multiple` an array of chosen values.
export default function ChoicePlates({ legend, options, value, onChange, disabled = false, name, multiple = false, error, compact = false }) {
  const autoName = useId();
  const errorId = `${autoName}-error`;
  // The plate the user just chose gets its yellow painted on (see the CSS);
  // plates chosen when the form opens are simply yellow.
  const [painting, setPainting] = useState(null);
  const chosen = (v) => (multiple ? value.includes(v) : value === v);
  const toggle = (v) => {
    setPainting(v);
    if (!multiple) return onChange(v);
    // Keep the options' own order, so the split order never depends on click order.
    const next = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
    onChange(options.map((o) => o.value).filter((x) => next.includes(x)));
  };
  return (
    <fieldset className={`${styles.set} ${error ? styles.invalid : ''} ${compact ? styles.compact : ''}`} disabled={disabled} aria-describedby={error ? errorId : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.plates}>
        {options.map((o) => (
          <label key={o.value} className={`${styles.plate} ${painting === o.value ? styles.painting : ''}`}>
            <input
              type={multiple ? 'checkbox' : 'radio'}
              className={styles.input}
              name={name || autoName}
              value={o.value}
              checked={chosen(o.value)}
              onChange={() => toggle(o.value)}
            />
            <span className={styles.face}>
              {multiple && <span className={styles.tick} aria-hidden="true" />}
              <span className={styles.label}>{o.label}</span>
              {o.hint && <span className={styles.hint}>{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
