import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { loginUrlFor } from '../utils/safeNext';
import RoadLoader from './RoadLoader';
import Notice from './Notice';
import Button from './Button';
import styles from './RequireAuth.module.css';

// Wraps every page that needs a login.
// Logged out: sent to /login, with ?next= so they come back here afterwards.
// This only decides what the browser SHOWS. The real protection is on the
// server, which refuses any API call without a valid token (401).
export default function RequireAuth({ children }) {
  const { status, error, retry, logout } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return <RoadLoader label="Checking your login" fullPage />;
  }

  if (status === 'signedOut') {
    return <Navigate to={loginUrlFor(location.pathname + location.search)} replace />;
  }

  if (status === 'error') {
    return (
      <main className={styles.problem}>
        <Notice tone="warning" title="TripSync could not load your profile">
          <p>{error}</p>
        </Notice>
        <div className={styles.actions}>
          <Button onClick={retry}>Try loading it again</Button>
          <Button variant="plain" onClick={logout}>
            Log out
          </Button>
        </div>
      </main>
    );
  }

  return children;
}
