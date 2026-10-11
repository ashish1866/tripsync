import Milestone from './Milestone';
import { formatMonth, formatWeekday, plural } from '../utils/format';
import styles from './DayRoad.module.css';

// The route: one stone per day of the trip, standing on a kerb line.
// With onSelect, each stone is a button and the chosen day is painted as selected.
// renderExtra(day) adds lines under the date (the forecast, a rain warning).
export default function DayRoad({ days, selected, onSelect, renderExtra, label = 'Days of the trip' }) {
  return (
    <ol className={styles.road} aria-label={label}>
      {days.map((day) => {
        const isSelected = selected === day.dayNumber;
        const stops = day.activities.length;
        const extra = (
          <>
            <span className={styles.stops}>{stops ? plural(stops, 'stop') : 'No stops yet'}</span>
            {renderExtra?.(day)}
          </>
        );
        return (
          <li key={day.date} className={styles.stop}>
            <div className={styles.post}>
              {onSelect ? (
                <Milestone
                  as="button"
                  type="button"
                  size="day"
                  cap={`Day ${day.dayNumber}`}
                  caption={`${formatWeekday(day.date)}, ${formatMonth(day.date)}`}
                  extra={extra}
                  className={`${styles.button} ${isSelected ? styles.selected : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(day.dayNumber)}
                >
                  {Number(day.date.slice(8))}
                </Milestone>
              ) : (
                <Milestone size="day" cap={`Day ${day.dayNumber}`} caption={`${formatWeekday(day.date)}, ${formatMonth(day.date)}`} extra={extra}>
                  {Number(day.date.slice(8))}
                </Milestone>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
