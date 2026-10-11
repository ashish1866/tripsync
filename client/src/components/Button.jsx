import { Link } from 'react-router';
import styles from './Button.module.css';

// The one button used across TripSync.
// variant: "primary" (yellow cap), "plain" (stone), "danger" (red, for deleting).
// Pass `to` to render a router link that looks like a button.
export default function Button({ variant = 'primary', to, busy = false, children, className = '', ...rest }) {
  const classes = `${styles.button} ${styles[variant]} ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} disabled={busy || rest.disabled} aria-busy={busy || undefined} {...rest}>
      {children}
    </button>
  );
}
