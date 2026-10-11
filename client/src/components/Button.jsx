import { Link } from 'react-router';
import styles from './Button.module.css';

// The one button used across TripSync.
// variant: "primary" (yellow cap), "plain" (stone), "danger" (red, for deleting).
// Pass `to` to render a router link that looks like a button.
// `busy` shows the button as working and blocks a second click.
export default function Button({
  variant = 'primary',
  to,
  busy = false,
  disabled = false,
  type = 'button',
  children,
  className = '',
  ...rest
}) {
  const classes = `${styles.button} ${styles[variant]} ${busy ? styles.busy : ''} ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={busy || disabled} aria-busy={busy || undefined} {...rest}>
      {children}
    </button>
  );
}
