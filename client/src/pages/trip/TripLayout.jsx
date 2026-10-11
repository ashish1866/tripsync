import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import api, { errorMessage } from '../../api/client';
import AppHeader from '../../components/AppHeader';
import Button from '../../components/Button';
import Notice from '../../components/Notice';
import RoadLoader from '../../components/RoadLoader';
import { formatRange, placeLine } from '../../utils/format';
import { whenLine } from '../../utils/dates';
import styles from './TripLayout.module.css';

// The tabs of a trip. `who` hides a tab from roles that cannot use it
// (the server refuses those actions anyway; hiding is only for clarity).
const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'plan', label: 'Day plan' },
  { to: 'explore', label: 'Explore' },
  { to: 'money', label: 'Money' },
  { to: 'packing', label: 'Packing' },
  { to: 'members', label: 'Members' },
  { to: 'settings', label: 'Trip settings', who: ['owner'] },
];

// /trips/:id and its tabs. Loads the trip once and shares it with every tab.
export default function TripLayout() {
  const { id } = useParams();
  const [state, setState] = useState({ status: 'loading', trip: null });

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get(`/trips/${id}`);
      setState({ status: 'ready', trip: data.trip });
      return data.trip;
    } catch (err) {
      setState({ status: 'error', trip: null, code: err.response?.status, message: errorMessage(err) });
      return null;
    }
  }, [id]);

  useEffect(() => {
    setState({ status: 'loading', trip: null });
    reload();
  }, [reload]);

  // Accepts a trip, or a function from the current trip to the next one, so two
  // quick changes (two ticks in a row) each start from the latest list.
  const setTrip = useCallback((next) => setState((s) => ({ status: 'ready', trip: typeof next === 'function' ? next(s.trip) : next })), []);

  // The forecast is loaded once per trip (and again if its dates change), and
  // shared by every tab. It has its own state, so if it fails only the weather
  // parts of the page say so.
  const [weather, setWeather] = useState({ status: 'loading' });
  const datesKey = state.trip ? `${state.trip.id}|${state.trip.startDate}|${state.trip.endDate}` : null;
  const loadWeather = useCallback(async () => {
    setWeather({ status: 'loading' });
    try {
      const { data } = await api.get(`/trips/${id}/weather`);
      setWeather({ status: 'ready', data: data.weather });
    } catch (err) {
      setWeather({ status: 'error', message: errorMessage(err) });
    }
  }, [id]);
  useEffect(() => {
    if (datesKey) loadWeather();
  }, [datesKey, loadWeather]);

  // Which way you moved along the tabs, so the yellow cap is painted onto the
  // new tab in that direction (see DESIGN-DECISIONS, "Motion"). Nothing on the first view.
  const { pathname } = useLocation();
  const section = pathname.replace(/\/+$/, '').split('/')[3] ?? '';
  const tabIndex = TABS.findIndex((t) => t.to === section);
  const lastTab = useRef(tabIndex);
  const [moved, setMoved] = useState(null);
  useLayoutEffect(() => {
    if (lastTab.current !== tabIndex && lastTab.current >= 0 && tabIndex >= 0) setMoved(tabIndex > lastTab.current ? 'right' : 'left');
    lastTab.current = tabIndex;
  }, [tabIndex]);

  if (state.status === 'loading') {
    return (
      <>
        <AppHeader />
        <main className={styles.page}>
          <RoadLoader label="Loading the trip" />
        </main>
      </>
    );
  }

  if (state.status === 'error') {
    const closed = state.code === 403 || state.code === 404;
    return (
      <>
        <AppHeader />
        <main className={`${styles.page} ${styles.problem}`}>
          <Notice tone="warning" title={state.code === 403 ? 'This trip is not yours to see' : state.code === 404 ? 'No trip here' : 'The trip could not be loaded'}>
            <p>{state.message}</p>
          </Notice>
          <div className={styles.actions}>
            {!closed && <Button onClick={reload}>Try loading it again</Button>}
            <Button variant={closed ? 'primary' : 'plain'} to="/trips">
              Go to your trips
            </Button>
          </div>
        </main>
      </>
    );
  }

  const { trip } = state;
  const tabs = TABS.filter((t) => !t.who || t.who.includes(trip.myRole));

  return (
    <>
      <AppHeader />
      <div className={styles.head}>
        <Link to="/trips" className={styles.back}>
          Your trips
        </Link>
        <h1 className={styles.name}>{trip.name}</h1>
        <p className={styles.where}>
          {placeLine(trip.destination)}. {formatRange(trip.startDate, trip.endDate)}. {whenLine(trip.startDate, trip.endDate)}.
        </p>
        <nav className={styles.tabs} aria-label="Trip sections" data-moved={moved ?? undefined}>
          {tabs.map((tab) => (
            <NavLink key={tab.label} to={tab.to} end={tab.end} className={({ isActive }) => `${styles.tab} ${isActive ? styles.current : ''}`}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <main className={styles.page}>
        <Outlet context={{ trip, setTrip, reload, weather, loadWeather }} />
      </main>
    </>
  );
}
