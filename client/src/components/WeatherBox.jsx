import Notice from './Notice';
import Button from './Button';
import RoadLoader from './RoadLoader';
import { formatClock, formatDayMonth, plural } from '../utils/format';
import { rainWarning } from '../utils/weather';
import styles from './WeatherBox.module.css';

// The trip's weather box: what the forecast says overall, the rain warnings,
// and where the numbers come from. If the forecast fails, only this box says
// so (with a way to try again); the rest of the trip page keeps working.
export default function WeatherBox({ trip, weather, onRetry }) {
  return (
    <section className={styles.box} aria-labelledby="weather-title">
      <h2 id="weather-title" className={styles.heading}>
        Weather in {trip.destination.name}
      </h2>
      <Body trip={trip} weather={weather} onRetry={onRetry} />
    </section>
  );
}

// Backup forecasts, by the name the API gives them, as they are named on screen.
const BACKUPS = { visualcrossing: 'Visual Crossing', openweather: 'OpenWeather' };

// Day numbers as words: "Day 3", "Days 3 to 6", "Days 1, 3 and 4"
function dayList(numbers) {
  if (numbers.length === 1) return `Day ${numbers[0]}`;
  const run = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (run) return `Days ${numbers[0]} to ${numbers[numbers.length - 1]}`;
  return `Days ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

function addDaysText(text, n) {
  const d = new Date(`${text}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Body({ trip, weather, onRetry }) {
  if (weather.status === 'loading') return <RoadLoader label="Checking the forecast" />;

  if (weather.status === 'error') {
    return (
      <div className={styles.problem}>
        <Notice tone="warning" title="The forecast could not be loaded">
          <p>{weather.message} The rest of the trip works as usual.</p>
        </Notice>
        <Button variant="plain" onClick={onRetry}>
          Try the forecast again
        </Button>
      </div>
    );
  }

  const { days, source, provider, fellBack, fetchedAt, forecastDays, rainLimit } = weather.data;
  const stopsOn = new Map(trip.days.map((d) => [d.dayNumber, d.activities.length]));
  const warned = days.filter((d) => rainWarning(d, stopsOn.get(d.dayNumber) || 0, rainLimit));
  const later = days.filter((d) => d.status === 'later').map((d) => d.dayNumber);
  const forecast = days.filter((d) => d.status === 'forecast');
  const allPast = days.every((d) => d.status === 'past');

  return (
    <div className={styles.body}>
      {warned.map((d) => (
        <Notice key={d.date} tone="warning" title={`Rain likely on Day ${d.dayNumber}`}>
          <p>
            {d.rainChance}% chance of rain, with {plural(stopsOn.get(d.dayNumber), 'stop')} planned. Carry rain gear or plan a covered stop.
          </p>
        </Notice>
      ))}

      {forecast.length > 0 && warned.length === 0 && (
        <p className={styles.line}>No rain warnings. A warning appears when a day with stops has a rain chance above {rainLimit}%.</p>
      )}

      {later.length > 0 && (
        <p className={styles.line}>
          {later.length === days.length
            ? `The forecast appears closer to the trip. It reaches about ${forecastDays} days ahead, so Day 1 gets its forecast from about ${formatDayMonth(addDaysText(trip.startDate, -(forecastDays - 1)))}.`
            : `${dayList(later)}: the forecast appears closer to the trip.`}
        </p>
      )}

      {allPast && <p className={styles.line}>This trip is over, so there is no forecast to show.</p>}

      {source !== 'none' && fetchedAt && BACKUPS[provider] && (
        <p className={styles.source}>
          {fellBack
            ? `Forecast from ${BACKUPS[provider]}, because Open-Meteo did not answer. It reaches about ${forecastDays} days ahead. Checked at ${formatClock(fetchedAt)}; TripSync asks Open-Meteo again in 15 minutes.`
            : `Forecast from ${BACKUPS[provider]}, checked at ${formatClock(fetchedAt)}. It reaches about ${forecastDays} days ahead.`}
          {provider === 'visualcrossing' && (
            <>
              {' '}
              {/* Visual Crossing's free plan asks for this credit next to its data. */}
              <a href="https://www.visualcrossing.com/" target="_blank" rel="noopener noreferrer">
                Powered by Visual Crossing Weather
              </a>
            </>
          )}
        </p>
      )}
      {source !== 'none' && fetchedAt && !BACKUPS[provider] && (
        <p className={styles.source}>
          Forecast from Open-Meteo, checked at {formatClock(fetchedAt)}. It is checked again after 3 hours.
        </p>
      )}
    </div>
  );
}
