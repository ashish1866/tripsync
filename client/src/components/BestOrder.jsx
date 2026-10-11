import { useState } from 'react';
import api, { errorMessage } from '../api/client';
import Button from './Button';
import Notice from './Notice';
import RoadLoader from './RoadLoader';
import StopNumber from './StopNumber';
import { formatDistance, formatTime } from '../utils/format';
import styles from './BestOrder.module.css';

// "Best order": asks the API for the nearest-first order of one day's stops,
// shows it with the distance between stops, and only changes the plan when the
// owner or an editor presses "Use this order". Distances are straight lines.
// Reset by the parent (via `key`) whenever the day's stops change.
export default function BestOrder({ trip, dayNumber, onApplied }) {
  const [state, setState] = useState({ status: 'idle' });

  async function suggest() {
    setState({ status: 'loading' });
    try {
      const { data } = await api.get(`/trips/${trip.id}/days/${dayNumber}/best-order`);
      setState({ status: 'ready', data });
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err) });
    }
  }

  async function apply() {
    setState((s) => ({ ...s, status: 'applying', applyError: null }));
    try {
      const { data } = await api.put(`/trips/${trip.id}/days/${dayNumber}/order`, { order: state.data.order.map((s) => s.id) });
      onApplied(data.trip);
      setState({ status: 'idle' });
    } catch (err) {
      setState((s) => ({ ...s, status: 'ready', applyError: errorMessage(err) }));
    }
  }

  return (
    <section className={styles.board} aria-labelledby="best-title">
      <h3 id="best-title" className={styles.title}>
        Best order for Day {dayNumber}
      </h3>
      {state.status === 'idle' && (
        <>
          <p className={styles.lead}>Start at the first stop with a place, then always go to the nearest stop not yet visited. Nothing changes until you say so.</p>
          <Button variant="plain" onClick={suggest}>
            Suggest the nearest-first order
          </Button>
        </>
      )}

      {state.status === 'loading' && <RoadLoader label="Working out the order" />}

      {state.status === 'error' && (
        <div className={styles.stack}>
          <Notice tone="warning">{state.message}</Notice>
          <Button variant="plain" onClick={suggest}>
            Try again
          </Button>
        </div>
      )}

      {(state.status === 'ready' || state.status === 'applying') && <Suggestion state={state} onApply={apply} onClose={() => setState({ status: 'idle' })} />}
    </section>
  );
}

function Suggestion({ state, onApply, onClose }) {
  const { data, status, applyError } = state;
  const busy = status === 'applying';

  if (data.placedCount < 2) {
    return (
      <div className={styles.stack}>
        <p className={styles.lead}>Give at least two stops a place on the map, and this can put them in order.</p>
        <Button variant="plain" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <p className={styles.lead}>
        {data.changed
          ? `In a straight line, your stops now cover ${formatDistance(data.currentMetres)}. In this order they cover ${formatDistance(data.suggestedMetres)}.`
          : `Your stops are already in the nearest-first order. They cover ${formatDistance(data.currentMetres)} in a straight line.`}
      </p>
      <p className={styles.caution}>These are straight lines, not road distances. Mountain roads are longer, so check the route before you commit.</p>

      <ol className={styles.list} aria-label="Nearest-first order">
        {data.order.map((stop, i) => (
          <li key={stop.id} className={styles.stop}>
            <StopNumber number={i + 1} onMap={stop.hasPlace} />
            <div className={styles.text}>
              <p className={styles.name}>
                {stop.time && <span className={styles.time}>{formatTime(stop.time)}</span>}
                {stop.title}
              </p>
              <p className={styles.leg}>
                {!stop.hasPlace ? 'No map point, so it stays at the end.' : stop.metresFromPrevious === null ? 'Where the day starts.' : `${formatDistance(stop.metresFromPrevious)} from the stop before`}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {data.changed && data.timeClash && (
        <Notice tone="warning" title="The times would run backwards">
          <p>In this order a later time comes before an earlier one. Change those times after you use it, or keep your order.</p>
        </Notice>
      )}
      {applyError && <Notice tone="warning">{applyError}</Notice>}

      <div className={styles.actions}>
        {data.changed && (
          <Button onClick={onApply} busy={busy}>
            {busy ? 'Saving the order' : 'Use this order'}
          </Button>
        )}
        <Button variant="plain" onClick={onClose} disabled={busy}>
          {data.changed ? 'Keep my order' : 'Close'}
        </Button>
      </div>
    </div>
  );
}
