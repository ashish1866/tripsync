import styles from './RoadDashes.module.css';

// The moving centre line of a road, drawn as a row of real dashes.
// Used on the loading strip (size "road") and along the bottom of a working
// button (size "button"). The row is wider than the space it sits in and is
// clipped by it, so a fixed number of dashes is enough.
const DASH_COUNT = 32;

export default function RoadDashes({ size = 'road', className = '' }) {
  return (
    <span className={`${styles.track} ${styles[size]} ${className}`} aria-hidden="true">
      {Array.from({ length: DASH_COUNT }, (_, i) => (
        <span key={i} className={styles.dash} />
      ))}
    </span>
  );
}
