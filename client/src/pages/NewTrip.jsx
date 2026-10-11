import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import api, { errorMessage } from '../api/client';
import AppHeader from '../components/AppHeader';
import PlaceSearch from '../components/PlaceSearch';
import TripForm, { checkTripFields, useTripFields } from '../components/TripForm';
import TripMap from '../components/TripMap';
import { placeLine } from '../utils/format';
import styles from './NewTrip.module.css';

// /trips/new: name, destination (searched), dates, budget.
export default function NewTrip() {
  const navigate = useNavigate();
  const fields = useTripFields();
  const [destination, setDestination] = useState(null);
  const [destinationError, setDestinationError] = useState();
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  function focusFirstError() {
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const { errors, paise } = checkTripFields(fields.values);
    fields.setErrors(errors);
    const noPlace = destination ? undefined : 'Search for the destination and pick it from the list.';
    setDestinationError(noPlace);
    if (Object.keys(errors).length || noPlace) return focusFirstError();

    setBusy(true);
    try {
      const { data } = await api.post('/trips', {
        name: fields.values.name.trim(),
        destination,
        startDate: fields.values.startDate,
        endDate: fields.values.endDate,
        budget: paise,
      });
      navigate(`/trips/${data.trip.id}`);
    } catch (err) {
      fields.setErrors({ form: errorMessage(err) });
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <h1 className={styles.title}>Plan a new trip</h1>
        <p className={styles.intro}>You become the owner. You can invite the group once the trip exists.</p>
        <div className={styles.layout}>
          <div className={styles.board}>
            <TripForm fields={fields} onSubmit={handleSubmit} submitLabel="Create the trip" busyLabel="Creating the trip" busy={busy} formRef={formRef}>
              <PlaceSearch
                label="Destination"
                hint="The town you are going to. Type at least 2 letters, for example Mana for Manali."
                endpoint="/geo/destinations"
                picked={destination}
                onPick={(place) => {
                  setDestination(place);
                  setDestinationError(undefined);
                }}
                describe={(place) => [place.state, place.country].filter(Boolean).join(', ')}
                pickedText={(place) => `Picked: ${placeLine(place)}`}
                error={destinationError}
                disabled={busy}
              />
            </TripForm>
          </div>
          <div className={styles.side}>
            {destination ? (
              <TripMap
                height="20rem"
                label={`Map of ${destination.name}`}
                pins={[{ id: 'destination', kind: 'destination', location: destination.location, label: '0', title: placeLine(destination) }]}
              />
            ) : (
              <div className={styles.mapWaiting}>
                <p>The destination appears here on the map once you pick it.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
