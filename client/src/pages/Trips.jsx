import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import { formatDate } from '../utils/format';
import styles from './Trips.module.css';

// All my trips. Step 1 has no trips yet, so this shows the designed empty state.
// Step 2 adds the list and the "create a trip" form.
export default function Trips() {
  const { profile } = useAuth();

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <h1>Your trips</h1>
        <p className={styles.since}>On TripSync since {formatDate(profile.createdAt)}</p>

        <section className={styles.empty} aria-labelledby="empty-title">
          {/* An unpainted stone: the outline of a trip that does not exist yet */}
          <div className={styles.blankStone} aria-hidden="true" />
          <div className={styles.emptyText}>
            <h2 id="empty-title">No trips yet</h2>
            <p>
              Trips you create, and trips you join from an invite link, will stand here in a row, nearest date first.
            </p>
            <p className={styles.note}>Creating a trip is the next part of the build.</p>
          </div>
        </section>
      </main>
    </>
  );
}
