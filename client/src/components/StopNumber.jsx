import styles from './StopNumber.module.css';

// The stop's number as a small kilometre stone, the same shape as its map pin,
// so the list and the map read as one. Without a place, the stone is unpainted
// (dashed): the stop has no pin on the map. kind="place" paints the cap ink,
// like the pins of nearby places in Explore (never mistaken for a planned stop).
export default function StopNumber({ number, onMap = true, kind = 'stop' }) {
  return (
    <span className={`${styles.stone} ${onMap ? '' : styles.unpinned} ${kind === 'place' ? styles.place : ''}`} aria-hidden="true">
      <span className={styles.cap} />
      <span className={styles.face}>{number}</span>
    </span>
  );
}
