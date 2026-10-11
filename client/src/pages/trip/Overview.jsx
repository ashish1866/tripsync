import { Link, useOutletContext } from 'react-router';
import DayRoad from '../../components/DayRoad';
import TripMap from '../../components/TripMap';
import DayWeather from '../../components/DayWeather';
import WeatherBox from '../../components/WeatherBox';
import { formatRupees, placeLine, plural } from '../../utils/format';
import { tripPins } from '../../utils/pins';
import styles from './Overview.module.css';

const ROLE_LABEL = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

// The trip's first screen: the route of day stones, the map, the money line and the group.
export default function Overview() {
  const { trip, weather, loadWeather } = useOutletContext();
  const stops = trip.days.reduce((n, d) => n + d.activities.length, 0);
  const pins = tripPins(trip);

  return (
    <div className={styles.grid}>
      <section className={styles.route} aria-labelledby="route-title">
        <h2 id="route-title" className={styles.heading}>
          The route, {plural(trip.days.length, 'day')}
        </h2>
        <DayRoad days={trip.days} renderExtra={(day) => <DayWeather weather={weather} day={day} />} />
        <p className={styles.note}>
          <Link to="plan">Open the day plan</Link> to add or change stops.
        </p>
      </section>

      <section className={styles.map} aria-labelledby="map-title">
        <h2 id="map-title" className={styles.heading}>
          {placeLine(trip.destination)}
        </h2>
        <TripMap height="20rem" label={`Map of ${trip.destination.name}`} pins={pins} />
        <p className={styles.note}>
          {stops
            ? `${plural(stops, 'stop')} planned so far. The number on each stone is its day; the 0 stone is ${trip.destination.name}.`
            : 'No stops planned yet.'}
        </p>
      </section>

      <aside className={styles.side}>
        <WeatherBox trip={trip} weather={weather} onRetry={loadWeather} />
        <section aria-labelledby="money-title">
          <h2 id="money-title" className={styles.heading}>
            Budget
          </h2>
          <p className={styles.budget}>{trip.budget ? `${formatRupees(trip.budget)} for the whole group.` : 'No budget set.'}</p>
        </section>
        <section aria-labelledby="group-title">
          <h2 id="group-title" className={styles.heading}>
            The group, {plural(trip.members.length, 'person', 'people')}
          </h2>
          <ul className={styles.members}>
            {trip.members.map((m) => (
              <li key={m.uid}>
                <span className={styles.memberName}>{m.name}</span>
                <span className={styles.role}>{ROLE_LABEL[m.role]}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
