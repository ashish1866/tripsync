import { getDb } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { newItemId } from '../utils/ids.js';
import { MAX_STOPS_PER_DAY } from '../schemas/activity.js';
import { legs, nearestFirst, routeLength } from '../utils/distance.js';
import { loadTripForMember } from './trips.js';

// STOPS ON A DAY (the brief's "activities"), stored inside the trip:
//   trips.days[].activities[] = { id, title, time, notes, place, addedBy, createdAt, updatedAt, updatedBy }
//
// SAFE EDITS: every route changes ONE stop with a single MongoDB update
// ($push, $pull, or $set on that stop's own fields through arrayFilters).
// The trip is never loaded, changed in memory and saved back, so a stop or a
// field another member saves at the same moment is never overwritten.

const GONE = 'This stop does not exist any more. Someone may have deleted it; reload the page.';

// Where a new stop goes in its day: before the first stop with a later time,
// so a day reads in time order. Stops with no time go at the end.
function insertPosition(activities, time) {
  if (!time) return activities.length;
  const later = activities.findIndex((a) => a.time && a.time > time);
  return later === -1 ? activities.length : later;
}

// POST /api/trips/:id/days/:day/activities (owner, editor)
export async function addActivity(req, res) {
  const db = await getDb();
  const trips = db.collection('trips');
  const tripId = req.trip._id;
  const dayNumber = req.valid.params.day;
  const now = new Date();

  const current = await trips.findOne({ _id: tripId }, { projection: { days: { $elemMatch: { dayNumber } } } });
  const day = current?.days?.[0];
  if (!day) throw new HttpError(404, `This trip has no Day ${dayNumber}.`);

  const stop = {
    id: newItemId(),
    ...req.body, // title, time, notes, place (already checked by zod)
    addedBy: req.user.uid,
    createdAt: now,
    updatedAt: now,
    updatedBy: req.user.uid,
  };

  // The filter also refuses a day that is already full, inside the same update.
  const result = await trips.updateOne(
    { _id: tripId, days: { $elemMatch: { dayNumber, [`activities.${MAX_STOPS_PER_DAY - 1}`]: { $exists: false } } } },
    {
      $push: { 'days.$[d].activities': { $each: [stop], $position: insertPosition(day.activities, stop.time) } },
      $set: { updatedAt: now },
    },
    { arrayFilters: [{ 'd.dayNumber': dayNumber }] },
  );
  if (result.matchedCount === 0) {
    throw new HttpError(409, `Day ${dayNumber} already has ${MAX_STOPS_PER_DAY} stops. Remove one before adding more.`);
  }
  res.status(201).json({ activity: stop, trip: await loadTripForMember(db, tripId, req.user.uid) });
}

// PATCH /api/trips/:id/activities/:actId (owner, editor)
// Only the fields sent are changed. With dayNumber, the stop moves to that day.
export async function editActivity(req, res) {
  const db = await getDb();
  const trips = db.collection('trips');
  const tripId = req.trip._id;
  const { actId } = req.valid.params;
  const { dayNumber: target, ...fields } = req.body;
  const now = new Date();

  const changes = { ...fields, updatedAt: now, updatedBy: req.user.uid };

  const where = await trips.findOne(
    { _id: tripId, 'days.activities.id': actId },
    { projection: { 'days.dayNumber': 1, 'days.activities.id': 1 } },
  );
  if (!where) throw new HttpError(404, GONE);
  const from = where.days.find((d) => d.activities.some((a) => a.id === actId));
  if (target !== undefined && !where.days.some((d) => d.dayNumber === target)) {
    throw new HttpError(400, `This trip has no Day ${target}. Pick a day between 1 and ${where.days.length}.`);
  }

  if (target === undefined || target === from.dayNumber) {
    // Field by field, on this one stop only.
    const set = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`days.$[].activities.$[a].${k}`, v]));
    const result = await trips.updateOne(
      { _id: tripId, 'days.activities.id': actId },
      { $set: { ...set, updatedAt: now } },
      { arrayFilters: [{ 'a.id': actId }] },
    );
    if (result.matchedCount === 0) throw new HttpError(404, GONE);
  } else {
    // Moving to another day: taken out of every day and added to the end of the
    // target day, in ONE update computed inside MongoDB from the trip as it is
    // at that moment. Every other stop is passed through untouched.
    // Request values are wrapped in $literal so they are stored as plain values.
    const allStops = { $reduce: { input: '$days.activities', initialValue: [], in: { $concatArrays: ['$$value', '$$this'] } } };
    const others = { $filter: { input: '$$d.activities', as: 'a', cond: { $ne: ['$$a.id', { $literal: actId }] } } };
    const result = await trips.updateOne(
      {
        _id: tripId,
        'days.activities.id': actId,
        days: { $elemMatch: { dayNumber: target, [`activities.${MAX_STOPS_PER_DAY - 1}`]: { $exists: false } } },
      },
      [
        {
          $set: {
            updatedAt: '$$NOW',
            days: {
              $let: {
                vars: { moving: { $first: { $filter: { input: allStops, as: 'a', cond: { $eq: ['$$a.id', { $literal: actId }] } } } } },
                in: {
                  $map: {
                    input: '$days',
                    as: 'd',
                    in: {
                      $mergeObjects: [
                        '$$d',
                        {
                          activities: {
                            $cond: [
                              { $eq: ['$$d.dayNumber', { $literal: target }] },
                              { $concatArrays: [others, [{ $mergeObjects: ['$$moving', { $literal: changes }] }]] },
                              others,
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      ],
    );
    if (result.matchedCount === 0) {
      const stillThere = await trips.countDocuments({ _id: tripId, 'days.activities.id': actId }, { limit: 1 });
      if (!stillThere) throw new HttpError(404, GONE);
      throw new HttpError(409, `Day ${target} already has ${MAX_STOPS_PER_DAY} stops. Remove one there first.`);
    }
  }
  res.json({ trip: await loadTripForMember(db, tripId, req.user.uid) });
}

// A day's stops as the best-order maths wants them.
async function stopsOfDay(tripId, dayNumber) {
  const trips = (await getDb()).collection('trips');
  const current = await trips.findOne({ _id: tripId }, { projection: { days: { $elemMatch: { dayNumber } } } });
  const day = current?.days?.[0];
  if (!day) throw new HttpError(404, `This trip has no Day ${dayNumber}.`);
  return day.activities.map((a) => ({ id: a.id, title: a.title, time: a.time || '', location: a.place?.location ?? null }));
}

// True when the times written on the stops would run backwards in this order
// (for example 1:00 pm before 9:00 am). Stops with no time are ignored.
function timesRunBackwards(stops) {
  const times = stops.map((s) => s.time).filter(Boolean);
  return times.some((t, i) => i > 0 && t < times[i - 1]);
}

// GET /api/trips/:id/days/:day/best-order (any member)
// Suggests the nearest-first order for the day. It changes nothing.
export async function bestOrder(req, res) {
  const stops = await stopsOfDay(req.trip._id, req.valid.params.day);
  const suggested = nearestFirst(stops);
  const metres = legs(suggested);
  res.json({
    dayNumber: req.valid.params.day,
    straightLine: true, // distances are straight lines, not road distances
    placedCount: stops.filter((s) => s.location).length,
    unplacedCount: stops.filter((s) => !s.location).length,
    changed: suggested.some((s, i) => s.id !== stops[i].id),
    currentMetres: routeLength(stops),
    suggestedMetres: routeLength(suggested),
    timeClash: timesRunBackwards(suggested),
    order: suggested.map((s, i) => ({ id: s.id, title: s.title, time: s.time, hasPlace: Boolean(s.location), metresFromPrevious: metres[i] })),
  });
}

// PUT /api/trips/:id/days/:day/order (owner, editor): { order: [stopId, ...] }
// Puts the day's stops in the order given, in ONE update computed inside MongoDB
// from the day as it is at that moment: a stop added meanwhile stays (at the
// end), a stop deleted meanwhile is skipped, and no other day or field is touched.
export async function setOrder(req, res) {
  const db = await getDb();
  const dayNumber = req.valid.params.day;
  const { order } = req.body;
  const named = { $literal: order };
  const stopsNow = '$$d.activities';
  // The stops named, in the order given (a name that no longer matches a stop is dropped)...
  const inOrder = {
    $filter: {
      input: { $map: { input: named, as: 'wanted', in: { $first: { $filter: { input: stopsNow, as: 'a', cond: { $eq: ['$$a.id', '$$wanted'] } } } } } },
      as: 'found',
      cond: { $eq: [{ $type: '$$found' }, 'object'] },
    },
  };
  // ...then the stops not named, as they were.
  const rest = { $filter: { input: stopsNow, as: 'a', cond: { $not: [{ $in: ['$$a.id', named] }] } } };

  const result = await db.collection('trips').updateOne({ _id: req.trip._id, 'days.dayNumber': dayNumber }, [
    {
      $set: {
        updatedAt: '$$NOW',
        days: {
          $map: {
            input: '$days',
            as: 'd',
            in: {
              $cond: [
                { $eq: ['$$d.dayNumber', { $literal: dayNumber }] },
                { $mergeObjects: ['$$d', { activities: { $concatArrays: [inOrder, rest] } }] },
                '$$d',
              ],
            },
          },
        },
      },
    },
  ]);
  if (result.matchedCount === 0) throw new HttpError(404, `This trip has no Day ${dayNumber}.`);
  res.json({ trip: await loadTripForMember(db, req.trip._id, req.user.uid) });
}

// DELETE /api/trips/:id/activities/:actId (owner, editor)
export async function deleteActivity(req, res) {
  const db = await getDb();
  const tripId = req.trip._id;
  const { actId } = req.valid.params;
  const result = await db
    .collection('trips')
    .updateOne({ _id: tripId, 'days.activities.id': actId }, { $pull: { 'days.$[].activities': { id: actId } }, $set: { updatedAt: new Date() } });
  if (result.matchedCount === 0) throw new HttpError(404, GONE);
  res.json({ trip: await loadTripForMember(db, tripId, req.user.uid) });
}
