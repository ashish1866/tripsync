import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import api, { errorMessage } from '../../api/client';
import TripMap from '../../components/TripMap';
import ChoicePlates from '../../components/ChoicePlates';
import SelectField from '../../components/SelectField';
import StopNumber from '../../components/StopNumber';
import Button from '../../components/Button';
import Notice from '../../components/Notice';
import RoadLoader from '../../components/RoadLoader';
import { formatClock, formatDate, formatDayMonth, formatDistance, formatWeekday, placeLine } from '../../utils/format';
import { canPlan } from '../../utils/roles';
import styles from './Explore.module.css';

const KINDS = [
  { value: 'cafe', label: 'Cafes', one: 'cafe', many: 'cafes' },
  { value: 'restaurant', label: 'Restaurants', one: 'restaurant', many: 'restaurants' },
  { value: 'hotel', label: 'Places to stay', one: 'place to stay', many: 'places to stay' },
  { value: 'attraction', label: 'Things to see', one: 'thing to see', many: 'things to see' },
];
const RADII = [
  { value: '2000', label: 'Within 2 km' },
  { value: '5000', label: 'Within 5 km' },
  { value: '10000', label: 'Within 10 km' },
];

// /trips/:id/explore : cafes, restaurants, places to stay and things to see
// around the destination, on a list and the map, each one a click from a day.
// If the search fails, only this screen says so; the rest of the trip works.
export default function Explore() {
  const { trip, setTrip } = useOutletContext();
  const planner = canPlan(trip.myRole);
  const [kind, setKind] = useState('cafe');
  const [radius, setRadius] = useState('5000');
  const [day, setDay] = useState('1');
  const [result, setResult] = useState({ status: 'loading' });
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(null); // { placeId, dayNumber }
  const [problem, setProblem] = useState(null);
  const rows = useRef(new Map());
  const asked = useRef(0);

  const search = useCallback(async () => {
    const ticket = ++asked.current;
    setResult({ status: 'loading' });
    setSelected(null);
    try {
      const { data } = await api.get(`/trips/${trip.id}/places`, { params: { category: kind, radius } });
      if (ticket === asked.current) setResult({ status: 'ready', data });
    } catch (err) {
      if (ticket === asked.current) setResult({ status: 'error', message: errorMessage(err) });
    }
  }, [trip.id, kind, radius]);

  useEffect(() => {
    search();
  }, [search]);

  // Which day each place is already on (matched by Geoapify's place id).
  const planned = new Map();
  for (const d of trip.days) for (const a of d.activities) if (a.place?.placeId) planned.set(a.place.placeId, d.dayNumber);

  async function addToDay(place) {
    const dayNumber = Number(day);
    setAdding(place.placeId);
    setProblem(null);
    try {
      const { data } = await api.post(`/trips/${trip.id}/days/${dayNumber}/activities`, {
        title: place.name.slice(0, 80),
        place: { name: place.name, address: place.address, location: place.location, placeId: place.placeId },
      });
      setTrip(data.trip);
      setAdded({ placeId: place.placeId, dayNumber });
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setAdding(null);
    }
  }

  function pick(placeId) {
    setSelected(placeId);
    // A jump, not a smooth scroll: the only motion in TripSync is the road dash.
    rows.current.get(placeId)?.scrollIntoView({ block: 'nearest' });
  }

  const k = KINDS.find((x) => x.value === kind);
  const places = result.status === 'ready' ? result.data.places : [];
  const pins = [
    { id: 'destination', kind: 'destination', location: trip.destination.location, label: '0', title: placeLine(trip.destination) },
    ...places.map((p, i) => ({ id: p.placeId, kind: 'place', location: p.location, label: String(i + 1), title: `${i + 1}. ${p.name}`, faded: selected && selected !== p.placeId })),
  ];

  return (
    <div className={styles.page}>
      <section className={styles.controls} aria-labelledby="explore-title">
        <h2 id="explore-title" className={styles.heading}>
          Around {trip.destination.name}
        </h2>
        <ChoicePlates legend="Look for" value={kind} onChange={setKind} options={KINDS.map(({ value, label }) => ({ value, label }))} compact />
        <div className={styles.row}>
          <SelectField label="How far from the centre" value={radius} onChange={(e) => setRadius(e.target.value)} options={RADII} />
          {planner && (
            <SelectField
              label="Add places to"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              options={trip.days.map((d) => ({ value: String(d.dayNumber), label: `Day ${d.dayNumber}, ${formatWeekday(d.date)} ${formatDayMonth(d.date)}` }))}
            />
          )}
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.results} aria-labelledby="results-title" aria-busy={result.status === 'loading'}>
          <h2 id="results-title" className={styles.subheading}>
            {k.label} {RADII.find((r) => r.value === radius).label.toLowerCase()}
          </h2>
          {problem && <Notice tone="warning">{problem}</Notice>}

          {result.status === 'loading' && <RoadLoader label={`Looking for ${k.many} near ${trip.destination.name}`} />}

          {result.status === 'error' && (
            <div className={styles.problem}>
              <Notice tone="warning" title="Nearby places could not be loaded">
                <p>{result.message} The rest of the trip works as usual.</p>
              </Notice>
              <Button variant="plain" onClick={search}>
                Try the search again
              </Button>
            </div>
          )}

          {result.status === 'ready' && places.length === 0 && (
            <div className={styles.empty}>
              <StopNumber number="" onMap={false} kind="place" />
              <p>
                No {k.many} with a name are listed {RADII.find((r) => r.value === radius).label.toLowerCase()} of {trip.destination.name} in OpenStreetMap.
                {radius !== '10000' && ' Try a wider distance.'}
              </p>
            </div>
          )}

          {result.status === 'ready' && places.length > 0 && (
            <ol className={styles.list} aria-label={`${k.label} near ${trip.destination.name}`}>
              {places.map((p, i) => {
                const onDay = planned.get(p.placeId);
                const justAdded = added?.placeId === p.placeId;
                return (
                  <li
                    key={p.placeId}
                    ref={(el) => (el ? rows.current.set(p.placeId, el) : rows.current.delete(p.placeId))}
                    className={`${styles.place} ${selected === p.placeId ? styles.selected : ''}`}
                  >
                    <StopNumber number={i + 1} kind="place" />
                    <div className={styles.text}>
                      <h3 className={styles.name}>
                        <button type="button" className={styles.nameButton} onClick={() => pick(p.placeId)} aria-pressed={selected === p.placeId}>
                          {p.name}
                        </button>
                      </h3>
                      {p.address && <p className={styles.address}>{p.address}</p>}
                      <p className={styles.distance}>
                        {formatDistance(p.distance)} from the centre of {trip.destination.name}, in a straight line
                      </p>
                      {onDay && (
                        <p className={styles.onDay}>
                          {justAdded ? 'Added to ' : 'On '}
                          <Link to={`../plan?day=${onDay}`}>Day {onDay}</Link>
                        </p>
                      )}
                    </div>
                    {planner && (
                      <Button variant="plain" className={styles.small} busy={adding === p.placeId} disabled={Boolean(adding) && adding !== p.placeId} onClick={() => addToDay(p)}>
                        {adding === p.placeId ? 'Adding' : `Add to Day ${day}`}
                        <span className="visually-hidden">: {p.name}</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {result.status === 'ready' && (
            <p className={styles.source}>
              Places from Geoapify, using OpenStreetMap data. No ratings: Geoapify has none, and TripSync does not make them up.
              {result.data.source === 'cache' && result.data.fetchedAt ? ` Saved by TripSync on ${formatDate(result.data.fetchedAt)} at ${formatClock(result.data.fetchedAt)}.` : ''}
            </p>
          )}
          {!planner && <p className={styles.viewer}>You can view this trip. Only the owner and editors add places to the plan.</p>}
        </section>

        <section className={styles.map} aria-labelledby="explore-map-title">
          <h2 id="explore-map-title" className={styles.subheading}>
            On the map
          </h2>
          <TripMap height="28rem" label={`Map of ${k.many} near ${trip.destination.name}`} pins={pins} onPinClick={(pin) => pin.kind === 'place' && pick(pin.id)} />
          <p className={styles.legend}>Ink-capped stones are the places in the list, numbered the same. The 0 stone is the centre of {trip.destination.name}. Pick a place to pick out its stone.</p>
        </section>
      </div>
    </div>
  );
}
