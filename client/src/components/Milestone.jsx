import styles from './Milestone.module.css';

// A kilometre stone: the shared visual unit of TripSync.
// `cap` is the lettering on the yellow cap (a place name or day label),
// `children` is the big number or text on the white face,
// `caption` is the small line under it (for example a date).
export default function Milestone({ cap, children, caption, size = 'md', as: Tag = 'div', ...rest }) {
  return (
    <Tag className={`${styles.stone} ${styles[size]}`} {...rest}>
      <span className={styles.cap}>{cap}</span>
      <span className={styles.face}>
        <span className={styles.number}>{children}</span>
        {caption && <span className={styles.caption}>{caption}</span>}
      </span>
    </Tag>
  );
}
