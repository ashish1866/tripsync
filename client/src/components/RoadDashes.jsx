import styles from './RoadDashes.module.css';

// The moving centre line of a road, drawn as a row of real dashes: TripSync's
// one sign for "still working". Used on the loading strip (size "road"), along
// the bottom of a working button (size "button") and round the /status
// checking mark (size "mark"). The row is wider than the space it sits in and
// is clipped by it, so a fixed number of dashes is enough.
const DASH_COUNT = { road: 32, button: 32, mark: 4 };

export default function RoadDashes({ size = 'road', className = '' }) {
  return (
    <span className={`${styles.track} ${styles[size]} ${className}`} aria-hidden="true">
      {Array.from({ length: DASH_COUNT[size] }, (_, i) => (
        <span key={i} className={styles.dash} />
      ))}
    </span>
  );
}
