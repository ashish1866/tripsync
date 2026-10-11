import WeatherMark from './WeatherMark';
import { rainWarning, tempsShort, tempsSpoken, weatherOn } from '../utils/weather';
import styles from './DayWeather.module.css';

// The forecast lines painted on one day stone: symbol, high/low, rain chance.
// A rain warning puts the red road-sign triangle beside the rain chance.
// While loading or after an error the stone shows nothing extra: the weather
// box on the page says what is happening, once.
export default function DayWeather({ weather, day }) {
  const d = weatherOn(weather, day.date);
  if (!d || d.status === 'past') return null;
  if (d.status === 'later') return <span className={styles.later}>Forecast later</span>;

  const warn = rainWarning(d, day.activities.length, weather.data.rainLimit);
  return (
    <>
      <span className={styles.line}>
        <WeatherMark kind={d.kind} size="1.35rem" />
        <span aria-hidden="true">{tempsShort(d)}</span>
        <span className="visually-hidden">{tempsSpoken(d)}</span>
      </span>
      <span className={`${styles.rain} ${warn ? styles.warn : ''}`}>
        {warn && <span className={styles.sign} aria-hidden="true" />}
        {d.rainChance === null ? 'Rain chance not given' : `Rain ${d.rainChance}%`}
        {warn && <span className="visually-hidden">: rain warning, stops are planned</span>}
      </span>
    </>
  );
}
