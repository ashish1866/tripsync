import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import Wordmark from '../components/Wordmark';
import Button from '../components/Button';
import styles from './ServiceStatus.module.css';

// /status: shows which part of TripSync is answering.
// Useful when the site feels stuck, and before a demo to wake the API up.

async function timed(call) {
  const started = performance.now();
  const { data } = await call();
  return { data, ms: Math.round(performance.now() - started) };
}

export default function ServiceStatus() {
  const [api1, setApi1] = useState({ state: 'loading' });
  const [db, setDb] = useState({ state: 'loading' });

  const run = useCallback(async () => {
    setApi1({ state: 'loading' });
    setDb({ state: 'loading' });
    try {
      const ping = await timed(() => api.get('/health/ping'));
      setApi1({ state: 'ok', text: `Answered in ${ping.ms} ms` });
    } catch (err) {
      setApi1({ state: 'error', text: errorMessage(err) });
      setDb({ state: 'error', text: 'Not checked, because the API did not answer' });
      return;
    }
    try {
      const health = await timed(() => api.get('/health'));
      setDb({ state: 'ok', text: `${health.data.database} on MongoDB Atlas answered in ${health.ms} ms` });
    } catch (err) {
      setDb({ state: 'error', text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const busy = api1.state === 'loading' || db.state === 'loading';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark />
      </header>
      <main className={styles.main}>
        <h1>Service status</h1>
        <p className={styles.lead}>
          If TripSync feels stuck, this shows which part is not answering. The first check after a quiet spell can take
          a while as the API wakes up.
        </p>

        <ul className={styles.checks} aria-live="polite">
          <Check state="ok" label="Website" text="This page loaded" />
          <Check state={api1.state} label="API" text={api1.text || 'Calling /api/health/ping'} />
          <Check state={db.state} label="Database" text={db.text || 'Waiting for the API'} />
        </ul>

        <Button variant="plain" onClick={run} busy={busy}>
          {busy ? 'Checking' : 'Check again'}
        </Button>
      </main>
    </div>
  );
}

function Check({ state, label, text }) {
  return (
    <li className={`${styles.check} ${styles[state]}`}>
      <span className={styles.mark} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        <span className="visually-hidden">
          {state === 'ok' ? 'Passed: ' : state === 'error' ? 'Failed: ' : 'In progress: '}
        </span>
        {text}
      </span>
    </li>
  );
}
