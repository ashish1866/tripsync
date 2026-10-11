import { useId, useState } from 'react';
import styles from './TextField.module.css';

// A labelled input with an optional hint and a field-level error.
// The error is linked to the input (aria-describedby) so screen readers announce it.
// type="password" gets a "Show" / "Hide" button, which helps when typing on a phone.
export default function TextField({ label, hint, error, type = 'text', className = '', ...inputProps }) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
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
      <div className={styles.control}>
        <input
          id={id}
          className={styles.input}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setReveal((r) => !r)}
            aria-pressed={reveal}
            aria-controls={id}
          >
            {reveal ? 'Hide' : 'Show'}
            <span className="visually-hidden"> password</span>
          </button>
        )}
      </div>
      {error && (
        <p className={styles.error} id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
