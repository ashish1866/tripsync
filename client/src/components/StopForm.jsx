import { useRef, useState } from 'react';
import api, { errorMessage } from '../api/client';
import TextField from './TextField';
import SelectField from './SelectField';
import PlaceSearch from './PlaceSearch';
import Button from './Button';
import Notice from './Notice';
import { formatDayMonth, formatWeekday } from '../utils/format';
import styles from './StopForm.module.css';

const samePlace = (a, b) => (a?.placeId || '') === (b?.placeId || '') && JSON.stringify(a?.location) === JSON.stringify(b?.location);

// Add a stop to a day, or edit one. Talks to the API itself and hands the
// updated trip to onSaved(trip, stop); `stop` is the new stop when adding.
// Editing sends only the fields that changed, so it never overwrites a
// different field another member saved meanwhile.
export default function StopForm({ trip, dayNumber, stop, onSaved, onCancel }) {
  const editing = Boolean(stop);
  const [values, setValues] = useState({
    title: stop?.title ?? '',
    time: stop?.time ?? '',
    notes: stop?.notes ?? '',
    day: String(dayNumber),
  });
  const [place, setPlace] = useState(stop?.place ?? null);
  const [placeText, setPlaceText] = useState(stop?.place?.name ?? '');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const autoTitle = useRef(stop?.place?.name ?? '');
  const formRef = useRef(null);

  const set = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
  };

  function pick(next) {
    setPlace(next);
    setErrors((e) => ({ ...e, place: undefined, form: undefined }));
    // Picking a place names the stop, unless someone already typed their own name.
    if (next && (!values.title.trim() || values.title === autoTitle.current)) {
      setValues((v) => ({ ...v, title: next.name.slice(0, 80) }));
      autoTitle.current = next.name.slice(0, 80);
      setErrors((e) => ({ ...e, title: undefined }));
    }
  }

  function check() {
    const found = {};
    const title = values.title.trim();
    if (!title) found.title = 'Give the stop a name, for example "Solang Valley".';
    else if (title.length > 80) found.title = 'Keep the stop name under 80 characters.';
    if (values.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time)) found.time = 'Pick a time like 09:30, or leave it empty.';
    if (values.notes.trim().length > 500) found.notes = 'Keep the notes under 500 characters.';
    if (!place && placeText.trim()) found.place = 'Pick a place from the list, or clear this box to save the stop without a map point.';
    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    const clean = { title: values.title.trim(), time: values.time, notes: values.notes.trim(), place };

    let request;
    if (editing) {
      const changes = {};
      if (clean.title !== stop.title) changes.title = clean.title;
      if (clean.time !== (stop.time || '')) changes.time = clean.time;
      if (clean.notes !== (stop.notes || '')) changes.notes = clean.notes;
      if (!samePlace(place, stop.place)) changes.place = place;
      if (Number(values.day) !== dayNumber) changes.dayNumber = Number(values.day);
      if (!Object.keys(changes).length) return onCancel?.();
      request = api.patch(`/trips/${trip.id}/activities/${stop.id}`, changes);
    } else {
      request = api.post(`/trips/${trip.id}/days/${dayNumber}/activities`, clean);
    }

    setBusy(true);
    try {
      const { data } = await request;
      if (!editing) {
        // Ready for the next stop on the same day.
        setValues({ title: '', time: '', notes: '', day: String(dayNumber) });
        setPlace(null);
        setPlaceText('');
        autoTitle.current = '';
        setSearchKey((k) => k + 1);
      }
      onSaved(data.trip, data.activity);
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const dayOptions = trip.days.map((d) => ({ value: String(d.dayNumber), label: `Day ${d.dayNumber}, ${formatWeekday(d.date)} ${formatDayMonth(d.date)}` }));
  const label = editing ? 'Save the stop' : `Add to Day ${dayNumber}`;

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate aria-label={editing ? `Edit ${stop.title}` : `Add a stop to Day ${dayNumber}`}>
      {errors.form && <Notice tone="warning">{errors.form}</Notice>}
      <PlaceSearch
        key={searchKey}
        label="Place"
        hint={`Optional. Search near ${trip.destination.name}, for example Solang or Hadimba.`}
        endpoint="/geo/spots"
        params={{ tripId: trip.id }}
        picked={place}
        onPick={pick}
        onText={setPlaceText}
        describe={(p) => p.address}
        pickedText={(p) => `On the map: ${p.name}${p.address ? `, ${p.address}` : ''}`}
        emptyHelp="Try a shorter name, or add the stop without a place."
        error={errors.place}
        disabled={busy}
      />
      <TextField label="Stop name" value={values.title} onChange={set('title')} error={errors.title} disabled={busy} maxLength={100} autoComplete="off" />
      <div className={styles.row}>
        <TextField label="Time" hint="Optional." type="time" value={values.time} onChange={set('time')} error={errors.time} disabled={busy} />
        {editing && <SelectField label="Day" options={dayOptions} value={values.day} onChange={set('day')} disabled={busy} />}
      </div>
      <TextField label="Notes" hint="Optional. Tickets, who is driving, what to carry." multiline value={values.notes} onChange={set('notes')} error={errors.notes} disabled={busy} maxLength={600} />
      <div className={styles.actions}>
        <Button type="submit" busy={busy}>
          {busy ? 'Saving' : label}
        </Button>
        {onCancel && (
          <Button variant="plain" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
