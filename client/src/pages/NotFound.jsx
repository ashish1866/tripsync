import { useLocation } from 'react-router';
import Wordmark from '../components/Wordmark';
import Milestone from '../components/Milestone';
import Button from '../components/Button';
import styles from './NotFound.module.css';

// Shown for any address TripSync does not have.
export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div>
      <header className={styles.header}>
        <Wordmark />
      </header>
      <main className={styles.page}>
        <Milestone cap="No road" aria-hidden="true">
          404
        </Milestone>
        <div>
          <h1>This road does not go anywhere</h1>
          <p className={styles.path}>
            TripSync has no page at <code>{pathname}</code>. The link may be mistyped, or the trip may have been
            deleted.
          </p>
          <Button to="/">Go to the TripSync home page</Button>
        </div>
      </main>
    </div>
  );
}
