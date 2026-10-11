import Wordmark from './Wordmark';
import styles from './AuthLayout.module.css';

// Shared frame for the sign-up and log-in pages, so both look like one product.
export default function AuthLayout({ title, intro, children, footer }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark />
      </header>
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {intro && <p className={styles.intro}>{intro}</p>}
        <div className={styles.board}>{children}</div>
        {footer && <p className={styles.footer}>{footer}</p>}
      </main>
    </div>
  );
}
