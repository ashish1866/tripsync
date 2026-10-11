import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import Milestone from '../components/Milestone';
import Button from '../components/Button';
import Notice from '../components/Notice';
import RoadLoader from '../components/RoadLoader';
import BudgetBar from '../components/BudgetBar';
import { formatDate, formatRange, placeLine, plural } from '../utils/format';
import { tripLength, whenLine } from '../utils/dates';
import styles from './Trips.module.css';

const ROLE_WORDS = { owner: 'You own this trip', editor: 'You can edit this trip', viewer: 'You can view this trip' };

// "Your trips": every trip I am in, nearest start date first.
export default function Trips() {
  const { profile } = useAuth();
  const [state, setState] = useState({ status: 'loading', trips: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const { data } = await api.get('/trips');
      setState({ status: 'ready', trips: data.trips });
    } catch (err) {
      setState({ status: 'error', trips: [], message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <div className={styles.heading}>
          <div>
            <h1>Your trips</h1>
            <p className={styles.since}>On TripSync since {formatDate(profile.createdAt)}</p>
          </div>
          {state.status === 'ready' && state.trips.length > 0 && <Button to="/trips/new">Plan a new trip</Button>}
        </div>

        {state.status === 'loading' && <RoadLoader label="Loading your trips" />}

        {state.status === 'error' && (
          <div className={styles.problem}>
            <Notice tone="warning" title="Your trips could not be loaded">
              <p>{state.message}</p>
            </Notice>
            <Button variant="plain" onClick={load}>
              Try loading them again
            </Button>
          </div>
        )}

        {state.status === 'ready' && state.trips.length === 0 && (
          <section className={styles.empty} aria-labelledby="empty-title">
            {/* An unpainted stone: the outline of a trip that does not exist yet */}
            <div className={styles.blankStone} aria-hidden="true" />
            <div className={styles.emptyText}>
              <h2 id="empty-title">No trips yet</h2>
              <p>Trips you create, and trips you join from an invite link, will stand here, nearest date first.</p>
              <Button to="/trips/new">Plan a new trip</Button>
            </div>
          </section>
        )}

        {state.status === 'ready' && state.trips.length > 0 && (
          <ul className={styles.list}>
            {state.trips.map((trip) => (
              <li key={trip.id}>
                <Link to={`/trips/${trip.id}`} className={styles.row}>
                  <Milestone size="trip" cap={trip.destination.name} caption={tripLength(trip.startDate, trip.endDate) === 1 ? 'day' : 'days'} aria-hidden="true">
                    {tripLength(trip.startDate, trip.endDate)}
                  </Milestone>
                  <div className={styles.details}>
                    <h2 className={styles.name}>{trip.name}</h2>
                    <p className={styles.where}>
                      {placeLine(trip.destination)}. {formatRange(trip.startDate, trip.endDate)}.
                    </p>
                    <p className={styles.meta}>
                      {whenLine(trip.startDate, trip.endDate)}. {plural(trip.memberCount, 'person', 'people')}. {ROLE_WORDS[trip.myRole]}.
                    </p>
                    <BudgetBar spent={trip.spent} budget={trip.budget} compact />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
