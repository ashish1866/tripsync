import { useRef, useState } from 'react';
import { useOutletContext } from 'react-router';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import TextField from '../../components/TextField';
import Button from '../../components/Button';
import Notice from '../../components/Notice';
import PackedBar from '../../components/PackedBar';
import { canPlan } from '../../utils/roles';
import styles from './Packing.module.css';

const MAX_LENGTH = 80;

// /trips/:id/packing : one list for the whole group. Owners and editors add,
// tick and remove items; viewers see the list and who packed what.
// Everyone sees the same ticks after a refresh (the list is stored in the trip).
export default function Packing() {
  const { trip, setTrip } = useOutletContext();
  const { profile } = useAuth();
  const planner = canPlan(trip.myRole);
  const items = trip.checklist;
  const packed = items.filter((i) => i.done).length;
  const nameOf = new Map(trip.members.map((m) => [m.uid, m.name]));
  const who = (uid) => (uid === profile.uid ? 'you' : nameOf.get(uid) || 'a former member');

  const [text, setText] = useState('');
  const [error, setError] = useState();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(() => new Set()); // ids being saved
  const [problem, setProblem] = useState(null);
  const inputRef = useRef(null);

  const mark = (id, on) =>
    setSaving((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  // Replace one item with the server's copy (or drop it if it is gone), leaving the rest as they are.
  const settle = (id, serverList) =>
    setTrip((t) => ({ ...t, checklist: t.checklist.flatMap((i) => (i.id === id ? serverList.filter((s) => s.id === id) : [i])) }));

  async function add(event) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) {
      setError('Write what to pack, for example "Warm jacket".');
      inputRef.current?.focus();
      return;
    }
    if (clean.length > MAX_LENGTH) {
      setError(`Keep the item under ${MAX_LENGTH} characters.`);
      inputRef.current?.focus();
      return;
    }
    setAdding(true);
    setProblem(null);
    try {
      const { data } = await api.post(`/trips/${trip.id}/checklist`, { text: clean });
      setTrip((t) => ({ ...t, checklist: [...t.checklist, data.item] }));
      setText('');
      inputRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  // Ticks show at once and are put back if the server refuses.
  async function tick(item) {
    const done = !item.done;
    mark(item.id, true);
    setProblem(null);
    setTrip((t) => ({
      ...t,
      checklist: t.checklist.map((i) => (i.id === item.id ? { ...i, done, doneBy: done ? profile.uid : null, doneAt: done ? new Date().toISOString() : null } : i)),
    }));
    try {
      const { data } = await api.patch(`/trips/${trip.id}/checklist/${item.id}`, { done });
      settle(item.id, data.checklist);
    } catch (err) {
      setTrip((t) => ({ ...t, checklist: t.checklist.map((i) => (i.id === item.id ? item : i)) }));
      setProblem(errorMessage(err));
    } finally {
      mark(item.id, false);
    }
  }

  async function remove(item) {
    mark(item.id, true);
    setProblem(null);
    try {
      await api.delete(`/trips/${trip.id}/checklist/${item.id}`);
      setTrip((t) => ({ ...t, checklist: t.checklist.filter((i) => i.id !== item.id) }));
    } catch (err) {
      // Already removed by someone else: just drop it from this screen too.
      if (err.response?.status === 404) setTrip((t) => ({ ...t, checklist: t.checklist.filter((i) => i.id !== item.id) }));
      else setProblem(errorMessage(err));
    } finally {
      mark(item.id, false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.board} aria-labelledby="packing-title">
        <h2 id="packing-title" className={styles.heading}>
          Packing list
        </h2>
        <PackedBar packed={packed} total={items.length} />
        {problem && <Notice tone="warning">{problem}</Notice>}

        {items.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyTick} aria-hidden="true" />
            <p>{planner ? 'The list is empty. Add what the group should pack, one item at a time.' : 'The list is empty. The owner or an editor adds items.'}</p>
          </div>
        ) : (
          <ul className={styles.list} aria-label="Things to pack">
            {items.map((item) => (
              <li key={item.id} className={`${styles.item} ${item.done ? styles.done : ''}`}>
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    className={styles.box}
                    checked={item.done}
                    disabled={!planner || saving.has(item.id)}
                    onChange={() => tick(item)}
                  />
                  <span className={styles.tick} aria-hidden="true" />
                  <span className={styles.text}>
                    <span className={styles.name}>{item.text}</span>
                    <span className={styles.meta}>
                      Added by {who(item.addedBy)}
                      {item.done && item.doneBy ? `. Packed by ${who(item.doneBy)}` : ''}
                    </span>
                  </span>
                </label>
                {planner && (
                  <Button variant="plain" className={styles.small} disabled={saving.has(item.id)} onClick={() => remove(item)}>
                    Remove<span className="visually-hidden"> {item.text}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {planner ? (
          <form className={styles.add} onSubmit={add} noValidate aria-label="Add to the packing list">
            <TextField
              ref={inputRef}
              label="Add an item"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(undefined);
              }}
              error={error}
              disabled={adding}
              maxLength={100}
              autoComplete="off"
              className={styles.field}
            />
            <Button type="submit" busy={adding} className={styles.addButton}>
              {adding ? 'Adding' : 'Add to the list'}
            </Button>
          </form>
        ) : (
          <p className={styles.viewer}>You can view this trip. Only the owner and editors change the packing list.</p>
        )}
      </section>
    </div>
  );
}
