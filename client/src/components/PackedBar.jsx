import styles from './PackedBar.module.css';

// "8 of 12 packed" with a painted strip, the same look as the budget strip.
// Nothing on the list: says so instead of drawing an empty bar.
export default function PackedBar({ packed, total, compact = false }) {
  if (total === 0) return <p className={styles.line}>Nothing on the packing list yet.</p>;
  const all = packed === total;
  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ''}`}>
      <p className={styles.line}>
        <strong className={styles.amount}>
          {packed} of {total} packed
        </strong>
        {all ? '. Everything is packed.' : `. ${total - packed} to go.`}
      </p>
      <div className={styles.track} role="meter" aria-label="Items packed" aria-valuemin={0} aria-valuemax={total} aria-valuenow={packed} aria-valuetext={`${packed} of ${total} packed`}>
        <span className={styles.fill} style={{ width: `${(packed / total) * 100}%` }} />
      </div>
    </div>
  );
}
