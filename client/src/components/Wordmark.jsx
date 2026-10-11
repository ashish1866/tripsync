import { Link } from 'react-router';
import styles from './Wordmark.module.css';

// The TripSync name with its small kilometre-stone mark. Links home.
export default function Wordmark({ to = '/' }) {
  return (
    <Link to={to} className={styles.wordmark}>
      <svg className={styles.mark} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M6 30V14a10 10 0 0 1 20 0v16z" fill="var(--stone)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M7.25 14a8.75 8.75 0 0 1 17.5 0v1H7.25z" fill="var(--cap)" />
        <path d="M6 15.5h20" stroke="var(--ink)" strokeWidth="2" />
        <path d="M11 21h10M11 25h6" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className={styles.name}>TripSync</span>
    </Link>
  );
}
