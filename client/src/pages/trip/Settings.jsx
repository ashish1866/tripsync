import { useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import api, { errorMessage } from '../../api/client';
import TripForm, { checkTripFields, useTripFields } from '../../components/TripForm';
import ConfirmDialog from '../../components/ConfirmDialog';
import Button from '../../components/Button';
import Notice from '../../components/Notice';
import { placeLine } from '../../utils/format';
import styles from './Settings.module.css';

// Owner only: rename, change dates or budget, delete the trip.
// (The destination is fixed once the trip exists.)
export default function Settings() {
  const { trip, setTrip } = useOutletContext();
  const navigate = useNavigate();
  const fields = useTripFields(trip);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const formRef = useRef(null);

  if (trip.myRole !== 'owner') {
    return (
      <Notice tone="warning" title="Only the owner changes trip settings">
        <p>You are a {trip.myRole} on this trip.</p>
      </Notice>
    );
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaved(false);
    const { errors, paise } = checkTripFields(fields.values);
    fields.setErrors(errors);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch(`/trips/${trip.id}`, {
        name: fields.values.name.trim(),
        startDate: fields.values.startDate,
        endDate: fields.values.endDate,
        budget: paise,
      });
      setTrip(data.trip);
      setSaved(true);
    } catch (err) {
      fields.setErrors({ form: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/trips/${trip.id}`);
      navigate('/trips', { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
      setAskDelete(false);
    }
  }

  return (
    <div className={styles.layout}>
      <section className={styles.board} aria-labelledby="edit-title">
        <h2 id="edit-title">Trip details</h2>
        <p className={styles.fixed}>Destination: {placeLine(trip.destination)}. It cannot be changed once the trip exists.</p>
        {saved && <Notice title="Saved">The trip details are updated for everyone.</Notice>}
        <TripForm fields={fields} onSubmit={handleSave} submitLabel="Save the changes" busyLabel="Saving" busy={saving} formRef={formRef} />
      </section>

      <section className={styles.danger} aria-labelledby="delete-title">
        <h2 id="delete-title">Delete this trip</h2>
        <p>This removes the trip for everyone in it, with its plan, bills and invites. It cannot be undone.</p>
        {deleteError && <Notice tone="warning">{deleteError}</Notice>}
        <Button variant="danger" onClick={() => setAskDelete(true)}>
          Delete the trip
        </Button>
      </section>

      <ConfirmDialog
        open={askDelete}
        title={`Delete "${trip.name}"?`}
        confirmLabel="Delete it for everyone"
        busyLabel="Deleting"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setAskDelete(false)}
      >
        <p>
          All {trip.members.length} members lose the trip, its days and stops, every bill and the settle-up list.
        </p>
      </ConfirmDialog>
    </div>
  );
}
