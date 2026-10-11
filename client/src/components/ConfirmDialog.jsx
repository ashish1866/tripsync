import { useEffect, useId, useRef } from 'react';
import Button from './Button';
import styles from './ConfirmDialog.module.css';

// A yes/no question in a real modal (the HTML <dialog> element), instead of
// the browser's grey built-in question box. Escape or "Keep it" closes it.
// Focus starts on the safe choice, so an accidental Enter never deletes.
export default function ConfirmDialog({ open, title, children, confirmLabel, busyLabel, busy, onConfirm, onCancel, tone = 'danger' }) {
  const ref = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>
        <Button variant={tone} onClick={onConfirm} busy={busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
        <Button variant="plain" onClick={onCancel} disabled={busy} ref={cancelRef}>
          Keep it
        </Button>
      </div>
    </dialog>
  );
}
