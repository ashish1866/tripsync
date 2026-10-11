import styles from './RoadLoader.module.css';

// The loading state: a stretch of road whose centre line moves, with a sentence
// saying what we are waiting for. Never a lone spinner.
// fullPage centres it in the window (used while checking the login).
export default function RoadLoader({ label, fullPage = false }) {
  return (
    <div className={`${styles.wrap} ${fullPage ? styles.fullPage : ''}`} role="status" aria-live="polite">
      <div className={styles.road} aria-hidden="true">
        <span className={styles.line} />
      </div>
      <p className={styles.label}>{label}</p>
    </div>
  );
}
