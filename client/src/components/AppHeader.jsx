import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import Wordmark from './Wordmark';
import Button from './Button';
import styles from './AppHeader.module.css';

// Top bar on every page you see while logged in.
export default function AppHeader() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  // Leave the protected page first, then log out. Doing it the other way round
  // would make the page's login guard bounce us to /login instead of home.
  async function handleLogout() {
    setLeaving(true);
    navigate('/', { replace: true });
    await logout();
  }

  return (
    <header className={styles.header}>
      <Wordmark to="/trips" />
      <div className={styles.account}>
        <span className={styles.who}>
          <span className="visually-hidden">Logged in as </span>
          <span className={styles.name}>{profile?.name}</span>
          <span className={styles.email}>{profile?.email}</span>
        </span>
        <Button variant="plain" onClick={handleLogout} busy={leaving}>
          {leaving ? 'Logging out' : 'Log out'}
        </Button>
      </div>
    </header>
  );
}
