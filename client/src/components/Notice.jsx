import styles from './Notice.module.css';

// A message box. tone="warning" is the road-sign red version, used when
// something went wrong or needs a decision. tone="info" is plain.
// Warnings use role="alert" so screen readers read them out at once.
export default function Notice({ tone = 'info', title, children, className = '' }) {
  return (
    <div className={`${styles.notice} ${styles[tone]} ${className}`} role={tone === 'warning' ? 'alert' : 'status'}>
      {tone === 'warning' && <span className={styles.sign} aria-hidden="true" />}
      <div>
        {title && <p className={styles.title}>{title}</p>}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
