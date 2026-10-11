import { useId } from 'react';
import styles from './ChoicePlates.module.css';

// Pick one of a few options, drawn as painted plates side by side.
// Under the paint these are real radio buttons (keyboard: Tab in, arrows to
// move), hidden visually but not from screen readers or the keyboard.
// options: [{ value, label, hint }]
export default function ChoicePlates({ legend, options, value, onChange, disabled = false, name }) {
  const autoName = useId();
  return (
    <fieldset className={styles.set} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.plates}>
        {options.map((o) => (
          <label key={o.value} className={styles.plate}>
            <input
              type="radio"
              className={styles.input}
              name={name || autoName}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className={styles.face}>
              <span className={styles.label}>{o.label}</span>
              {o.hint && <span className={styles.hint}>{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
