import styles from './StopNumber.module.css';

// The stop's number as a small kilometre stone, the same shape as its map pin,
// so the list and the map read as one. Without a place, the stone is unpainted
// (dashed): the stop has no pin on the map.
export default function StopNumber({ number, onMap = true }) {
  return (
    <span className={`${styles.stone} ${onMap ? '' : styles.unpinned}`} aria-hidden="true">
      <span className={styles.cap} />
      <span className={styles.face}>{number}</span>
    </span>
  );
}
