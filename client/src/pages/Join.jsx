import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import Wordmark from '../components/Wordmark';
import Milestone from '../components/Milestone';
import Button from '../components/Button';
import Notice from '../components/Notice';
import RoadLoader from '../components/RoadLoader';
import { formatDate, formatRange, placeLine, plural } from '../utils/format';
import { tripLength } from '../utils/dates';
import { ROLE_LABEL, ROLE_YOU } from '../utils/roles';
import styles from './Join.module.css';

// /join/:code : open to everyone. Shows what the invite is for; a logged-out
// visitor logs in (or signs up) and comes straight back here to join.
export default function Join() {
  const { code } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState({ state: 'loading' });
  const [joining, setJoining] = useState({ state: 'idle' });
  const here = `/join/${encodeURIComponent(code)}`;

  const load = useCallback(async () => {
    setPreview({ state: 'loading' });
    try {
      const { data } = await api.get(`/invites/${encodeURIComponent(code)}`);
      setPreview({ state: 'ready', invite: data.invite });
    } catch (err) {
      setPreview({ state: 'error', code: err.response?.status, message: errorMessage(err) });
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  async function join() {
    setJoining({ state: 'busy' });
    try {
      const { data } = await api.post(`/invites/${encodeURIComponent(code)}/join`);
      navigate(`/trips/${data.tripId}`, { replace: true });
    } catch (err) {
      setJoining({ state: err.response?.status === 409 && /already in this trip/.test(errorMessage(err)) ? 'member' : 'error', message: errorMessage(err) });
    }
  }

  const signedIn = status === 'signedIn';

  return (
    <div className={styles.frame}>
      {signedIn ? (
        <AppHeader />
      ) : (
        <header className={styles.header}>
          <Wordmark />
        </header>
      )}
      <main className={styles.main}>
        {preview.state === 'loading' && <RoadLoader label="Reading the invite" />}

        {preview.state === 'error' && (
          <div className={styles.problem}>
            <h1 className={styles.title}>{preview.code === 410 ? 'This invite has expired' : preview.code === 404 || preview.code === 400 ? 'No invite here' : 'The invite could not be read'}</h1>
            <Notice tone="warning">
              <p>{preview.message}</p>
            </Notice>
            <div className={styles.actions}>
              {preview.code !== 410 && preview.code !== 404 && preview.code !== 400 && <Button onClick={load}>Try reading it again</Button>}
              <Button variant={preview.code >= 500 || !preview.code ? 'plain' : 'primary'} to={signedIn ? '/trips' : '/'}>
                {signedIn ? 'Go to your trips' : 'Go to the TripSync home page'}
              </Button>
            </div>
          </div>
        )}

        {preview.state === 'ready' && <Invite invite={preview.invite} signedIn={signedIn} status={status} here={here} joining={joining} onJoin={join} />}
      </main>
    </div>
  );
}

function Invite({ invite, signedIn, status, here, joining, onJoin }) {
  const { trip, role } = invite;
  const days = tripLength(trip.startDate, trip.endDate);
  const next = encodeURIComponent(here);
  return (
    <>
      <p className={styles.kicker}>{trip.ownerName} invited you to</p>
      <h1 className={styles.title}>{trip.name}</h1>
      <div className={styles.board}>
        <div className={styles.summary}>
          <Milestone size="trip" cap={trip.destination.name} caption={days === 1 ? 'day' : 'days'} aria-hidden="true">
            {days}
          </Milestone>
          <div className={styles.lines}>
            <p>
              {placeLine(trip.destination)}. {formatRange(trip.startDate, trip.endDate)}.
            </p>
            <p>{plural(trip.memberCount, 'person', 'people')} in the trip so far.</p>
            <p className={styles.role}>
              You join as <strong>{ROLE_LABEL[role]}</strong>: {ROLE_YOU[role]}
            </p>
          </div>
        </div>

        {status === 'checking' && <RoadLoader label="Checking your login" />}

        {status === 'signedOut' && (
          <div className={styles.join}>
            <p className={styles.note}>Log in or create an account first. TripSync brings you back to this invite.</p>
            <div className={styles.actions}>
              <Button to={`/login?next=${next}`}>Log in to join</Button>
              <Button variant="plain" to={`/register?next=${next}`}>
                Create an account
              </Button>
            </div>
          </div>
        )}

        {signedIn && joining.state !== 'member' && (
          <div className={styles.join}>
            {joining.state === 'error' && <Notice tone="warning">{joining.message}</Notice>}
            <Button onClick={onJoin} busy={joining.state === 'busy'}>
              {joining.state === 'busy' ? 'Joining' : `Join ${trip.name.length > 28 ? 'the trip' : trip.name}`}
            </Button>
          </div>
        )}

        {signedIn && joining.state === 'member' && (
          <div className={styles.join}>
            <Notice title="You're already in this trip.">
              <p>Nothing changed. Open it to see the plan.</p>
            </Notice>
            <Button to={`/trips/${trip.id}`}>Open the trip</Button>
          </div>
        )}

        {status === 'error' && (
          <Notice tone="warning" title="TripSync could not load your profile">
            <p>Reload the page, then try joining again.</p>
          </Notice>
        )}
      </div>
      <p className={styles.expires}>This invite works until {formatDate(invite.expiresAt)}.</p>
    </>
  );
}
