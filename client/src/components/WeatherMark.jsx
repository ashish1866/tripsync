import styles from './WeatherMark.module.css';

// Small painted weather symbols, drawn in ink like the pictograms on a road
// sign (no emoji, no icon font). kind comes from the API: clear, partly,
// cloud, fog, rain, snow, storm. Unknown kinds draw nothing: we never guess.
const CLOUD = 'M6.5 18h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A4 4 0 0 0 6.5 18z';
const SMALL_CLOUD = 'M6.5 15h10a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6-1.1A3.5 3.5 0 0 0 6.5 15z';

const shapes = {
  clear: (
    <>
      <circle cx="12" cy="12" r="4.5" className={styles.fill} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="12" y1="2.5" x2="12" y2="5" transform={`rotate(${a} 12 12)`} />
      ))}
    </>
  ),
  partly: (
    <>
      <circle cx="8.5" cy="8.5" r="3.5" className={styles.fill} />
      <line x1="8.5" y1="1.5" x2="8.5" y2="3" />
      <line x1="1.5" y1="8.5" x2="3" y2="8.5" />
      <line x1="3.6" y1="3.6" x2="4.6" y2="4.6" />
      <path d="M8.5 20h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4-1.2A3.9 3.9 0 0 0 8.5 20z" className={styles.paper} />
    </>
  ),
  cloud: <path d={CLOUD} className={styles.paper} />,
  fog: (
    <>
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="5" y1="12.5" x2="19" y2="12.5" />
      <line x1="3" y1="17" x2="21" y2="17" />
    </>
  ),
  rain: (
    <>
      <path d={SMALL_CLOUD} className={styles.paper} />
      <line x1="8" y1="18" x2="7" y2="21.5" />
      <line x1="12" y1="18" x2="11" y2="21.5" />
      <line x1="16" y1="18" x2="15" y2="21.5" />
    </>
  ),
  snow: (
    <>
      <path d={SMALL_CLOUD} className={styles.paper} />
      <circle cx="8" cy="19.5" r="1.1" className={styles.fill} />
      <circle cx="12" cy="21" r="1.1" className={styles.fill} />
      <circle cx="16" cy="19.5" r="1.1" className={styles.fill} />
    </>
  ),
  storm: (
    <>
      <path d={SMALL_CLOUD} className={styles.paper} />
      <path d="M12.5 15.5 10 19.5h3l-2 3.5" className={styles.bolt} />
    </>
  ),
};

export default function WeatherMark({ kind, size = '1.5rem' }) {
  const shape = shapes[kind];
  if (!shape) return null;
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {shape}
    </svg>
  );
}
