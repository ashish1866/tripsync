import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import Milestone from '../components/Milestone';
import Button from '../components/Button';
import styles from './BuildCheck.module.css';

// Step 0 home page: proves the browser, the API and MongoDB Atlas reach each other.
// Replaced by the real landing page in Step 1.

const FONT_TESTS = ['700 1em "Anek Latin Variable"', '400 1em "Mukta"'];

export default function BuildCheck() {
  const [health, setHealth] = useState({ state: 'loading' });
  const [fonts, setFonts] = useState({ state: 'loading' });

  const checkApi = useCallback(async () => {
    setHealth({ state: 'loading' });
    const started = performance.now();
    try {
      const { data } = await api.get('/health');
      setHealth({ state: 'ok', data, ms: Math.round(performance.now() - started) });
    } catch (err) {
      setHealth({ state: 'error', message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    checkApi();
    // Ask the browser whether the two typefaces really loaded (declared is not shipped).
    document.fonts.ready.then(async () => {
      await Promise.all(FONT_TESTS.map((f) => document.fonts.load(f)));
      const missing = FONT_TESTS.filter((f) => !document.fonts.check(f));
      setFonts(missing.length ? { state: 'error', message: `Not loaded: ${missing.join(', ')}` } : { state: 'ok' });
    });
  }, [checkApi]);

  const users = health.data?.usersInDatabase;

  return (
    <main className={styles.page}>
      <div className={styles.stoneColumn}>
        <Milestone cap="TripSync" caption="km from the start" size="lg">
          0
        </Milestone>
      </div>

      <section className={styles.board} aria-labelledby="check-title">
        <h1 id="check-title">Build check</h1>
        <p className={styles.lead}>
          This page proves the parts of TripSync can reach each other: this website, the API on Cloudflare, and the
          database on MongoDB Atlas. Sign-up and trips arrive in the next steps.
        </p>

        <ul className={styles.checks} aria-live="polite">
          <Check state="ok" label="Website">
            React page loaded
          </Check>
          <Check state={fonts.state} label="Typefaces">
            {fonts.state === 'ok' && 'Anek Latin and Mukta are loaded'}
            {fonts.state === 'loading' && 'Checking the typefaces'}
            {fonts.state === 'error' && fonts.message}
          </Check>
          <Check state={health.state} label="API">
            {health.state === 'ok' && `/api/health answered in ${health.ms} ms`}
            {health.state === 'loading' && 'Calling /api/health'}
            {health.state === 'error' && health.message}
          </Check>
          <Check state={health.state} label="Database">
            {health.state === 'ok' &&
              `${health.data.database} on MongoDB Atlas, ${users === 0 ? 'no user profiles yet' : `${users} user profile${users === 1 ? '' : 's'}`}`}
            {health.state === 'loading' && 'Waiting for the API'}
            {health.state === 'error' && 'Not reached, because the API call failed'}
          </Check>
        </ul>

        {health.state !== 'loading' && (
          <Button variant="plain" onClick={checkApi}>
            Run the check again
          </Button>
        )}
      </section>
    </main>
  );
}

function Check({ state, label, children }) {
  return (
    <li className={`${styles.check} ${styles[state]}`}>
      <span className={styles.mark} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        <span className="visually-hidden">
          {state === 'ok' ? 'Passed: ' : state === 'error' ? 'Failed: ' : 'In progress: '}
        </span>
        {children}
      </span>
    </li>
  );
}
