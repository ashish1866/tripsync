import { useId } from 'react';
import styles from './TextField.module.css';

// A labelled drop-down in the same frame as TextField (same hover, focus and
// error states), with a painted triangle instead of the browser's arrow.
// options: [{ value, label }]
export default function SelectField({ label, hint, error, options, className = '', ...selectProps }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`${styles.field} ${error ? styles.invalid : ''} ${className}`}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <div className={`${styles.control} ${styles.selectArrow}`}>
        <select id={id} className={`${styles.input} ${styles.select}`} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...selectProps}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className={styles.error} id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
