import { useState } from 'react';
import Milestone from './Milestone';
import { formatMonth, formatWeekday, plural } from '../utils/format';
import styles from './DayRoad.module.css';

// The route: one stone per day of the trip, standing on a kerb line.
// With onSelect, each stone is a button and the chosen day is painted as selected.
// A stone you pick gets its yellow painted on, base to top, like a stone
// freshly painted; the day already chosen when the page opens is simply yellow.
// renderExtra(day) adds lines under the date (the forecast, a rain warning).
export default function DayRoad({ days, selected, onSelect, renderExtra, label = 'Days of the trip' }) {
  const [picked, setPicked] = useState(null);
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
                  className={`${styles.button} ${isSelected ? styles.selected : ''} ${isSelected && picked === day.dayNumber ? styles.painted : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (!isSelected) setPicked(day.dayNumber);
                    onSelect(day.dayNumber);
                  }}
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
