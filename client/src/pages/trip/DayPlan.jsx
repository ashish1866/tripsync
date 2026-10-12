import { useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router';
import api, { errorMessage } from '../../api/client';
import DayRoad from '../../components/DayRoad';
import TripMap from '../../components/TripMap';
import StopForm from '../../components/StopForm';
import StopNumber from '../../components/StopNumber';
import BestOrder from '../../components/BestOrder';
import Button from '../../components/Button';
import Notice from '../../components/Notice';
import ConfirmDialog from '../../components/ConfirmDialog';
import { formatDate, formatTime, formatWeekday, plural } from '../../utils/format';
import { tripPins } from '../../utils/pins';
import { rainWarning, weatherOn } from '../../utils/weather';
import DayWeather from '../../components/DayWeather';
import WeatherMark from '../../components/WeatherMark';
import { useListShift, useTravel } from '../../utils/motion';
import styles from './DayPlan.module.css';

// The chosen day's forecast in words, and its rain warning.
function DayForecast({ weather, day }) {
  if (weather.status === 'loading') return <p className={styles.forecast}>Checking the forecast for this day.</p>;
  if (weather.status === 'error') return <p className={styles.forecast}>The forecast could not be loaded right now. The plan below works as usual.</p>;
  const d = weatherOn(weather, day.date);
  if (!d || d.status === 'past') return null;
  if (d.status === 'later') return <p className={styles.forecast}>The forecast for this day appears closer to the trip.</p>;
  const temps = d.max === null || d.min === null ? '' : `, ${d.max}° to ${d.min}°C`;
  const rain = d.rainChance === null ? '' : `, ${d.rainChance}% chance of rain`;
  const stops = day.activities.length;
  return (
    <>
      <p className={styles.forecast}>
        <WeatherMark kind={d.kind} />
        <span>
          {d.label}
          {temps}
          {rain}.
        </span>
      </p>
      {rainWarning(d, stops, weather.data.rainLimit) && (
        <Notice tone="warning" title={`Rain likely on Day ${day.dayNumber}`}>
          <p>
            {d.rainChance}% chance of rain, with {plural(stops, 'stop')} planned. Carry rain gear or plan a covered stop.
          </p>
        </Notice>
      )}
    </>
  );
}

// /trips/:id/plan?day=2 : pick a day stone, see and change that day's stops beside the map.
export default function DayPlan() {
  const { trip, setTrip, weather } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const asked = Number(params.get('day'));
  const dayNumber = trip.days.some((d) => d.dayNumber === asked) ? asked : 1;
  const day = trip.days.find((d) => d.dayNumber === dayNumber);
  const canPlan = trip.myRole === 'owner' || trip.myRole === 'editor';
  const names = new Map(trip.members.map((m) => [m.uid, m.name]));

  const [editingId, setEditingId] = useState(null);
  const [removing, setRemoving] = useState(null); // the stop being asked about
  const [removeBusy, setRemoveBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [freshId, setFreshId] = useState(null); // the stop just added: wet paint on its row

  // Motion (DESIGN-DECISIONS, "Motion"): the day's stops travel in from the
  // side you moved to, and stops slide to their new places when the order changes.
  const dayPanel = useRef(null);
  const stopList = useRef(null);
  useTravel(dayPanel, dayNumber);
  useListShift(
    stopList,
    day.activities.map((a) => a.id),
    dayNumber,
  );

  function selectDay(n) {
    setEditingId(null);
    setProblem(null);
    setFreshId(null);
    setParams({ day: String(n) }, { replace: true });
  }

  async function remove() {
    setRemoveBusy(true);
    setProblem(null);
    try {
      const { data } = await api.delete(`/trips/${trip.id}/activities/${removing.id}`);
      setTrip(data.trip);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
    }
  }

  return (
    <div className={styles.page}>
      <section aria-labelledby="days-title">
        <h2 id="days-title" className={styles.heading}>
          Pick a day
        </h2>
        <DayRoad days={trip.days} selected={dayNumber} onSelect={selectDay} renderExtra={(d) => <DayWeather weather={weather} day={d} />} />
      </section>

      <div className={styles.layout}>
        <section className={styles.stops} aria-labelledby="day-title">
          {/* What changes with the day travels in; the boards below it stay put. */}
          <div ref={dayPanel}>
            <h2 id="day-title" className={styles.dayTitle}>
              Day {dayNumber}, {formatWeekday(day.date)} {formatDate(day.date)}
            </h2>
            <p className={styles.count}>{day.activities.length ? plural(day.activities.length, 'stop') : 'No stops yet.'}</p>
            <DayForecast weather={weather} day={day} />
            {problem && <Notice tone="warning">{problem}</Notice>}

            {day.activities.length === 0 && (
              <div className={styles.empty}>
                <StopNumber number="" onMap={false} />
                <p>
                  {canPlan
                    ? `Nothing is planned for Day ${dayNumber}. Add the first stop below: a place to see, a meal, the drive.`
                    : `Nothing is planned for Day ${dayNumber} yet. The owner or an editor adds stops.`}
                </p>
              </div>
            )}

            {day.activities.length > 0 && (
              <ol ref={stopList} className={styles.list} aria-label={`Stops on Day ${dayNumber}`}>
                {day.activities.map((stop, i) => (
                  <li key={stop.id} data-shift-id={stop.id} className={`${styles.stop} ${stop.id === freshId ? 'ts-wet' : ''}`}>
                    {editingId === stop.id ? (
                      <div className={styles.editBoard}>
                        <h3 className={styles.editTitle}>Edit stop {i + 1}</h3>
                        <StopForm
                          trip={trip}
                          dayNumber={dayNumber}
                          stop={stop}
                          onSaved={(next) => {
                            setTrip(next);
                            setEditingId(null);
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <>
                        <StopNumber number={i + 1} onMap={Boolean(stop.place)} />
                        <div className={styles.stopText}>
                          <h3 className={styles.stopTitle}>
                            {stop.time && <span className={styles.time}>{formatTime(stop.time)}</span>}
                            {stop.title}
                          </h3>
                          <p className={styles.where}>
                            {stop.place ? [stop.place.name !== stop.title && stop.place.name, stop.place.address].filter(Boolean).join(', ') || 'On the map' : 'No map point'}
                          </p>
                          {stop.notes && <p className={styles.notes}>{stop.notes}</p>}
                          <p className={styles.by}>Added by {names.get(stop.addedBy) || 'a former member'}</p>
                        </div>
                        {canPlan && (
                          <div className={styles.stopActions}>
                            <Button variant="plain" className={styles.small} onClick={() => setEditingId(stop.id)} aria-label={`Edit ${stop.title}`}>
                              Edit
                            </Button>
                            <Button variant="plain" className={styles.small} onClick={() => setRemoving(stop)} aria-label={`Remove ${stop.title}`}>
                              Remove
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {canPlan && day.activities.length >= 2 && (
            <div className={styles.best}>
              <BestOrder key={`${dayNumber}:${day.activities.map((a) => a.id).join(',')}`} trip={trip} dayNumber={dayNumber} onApplied={setTrip} />
            </div>
          )}

          {canPlan ? (
            <section className={styles.addBoard} aria-labelledby="add-title">
              <h3 id="add-title" className={styles.editTitle}>
                Add a stop to Day {dayNumber}
              </h3>
              <StopForm
                key={dayNumber}
                trip={trip}
                dayNumber={dayNumber}
                onSaved={(next, stop) => {
                  setTrip(next);
                  setFreshId(stop?.id ?? null);
                }}
              />
            </section>
          ) : (
            <p className={styles.viewer}>You can view this trip. Only the owner and editors change the plan.</p>
          )}
        </section>

        <section className={styles.map} aria-labelledby="plan-map-title">
          <h2 id="plan-map-title" className={styles.heading}>
            Map of Day {dayNumber}
          </h2>
          <TripMap height="26rem" label={`Map of Day ${dayNumber} in ${trip.destination.name}`} pins={tripPins(trip, { selectedDay: dayNumber })} plantNew />
          <p className={styles.legend}>Numbered stones are Day {dayNumber}'s stops in order. Pale stones are stops on other days. The 0 stone is {trip.destination.name}.</p>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        title={removing ? `Remove "${removing.title}"?` : ''}
        confirmLabel="Remove the stop"
        busyLabel="Removing"
        busy={removeBusy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      >
        <p>It disappears from Day {dayNumber} and the map for everyone in the trip.</p>
      </ConfirmDialog>
    </div>
  );
}
