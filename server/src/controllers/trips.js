import { getDb } from '../config/db.js';
import { buildDays, datesBetween, dateRangeProblem } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';

// ---------- shaping what the API sends back ----------

// Names for a list of Firebase user ids, from the users collection.
export async function namesFor(db, uids) {
  const rows = await db
    .collection('users')
    .find({ firebaseUid: { $in: [...new Set(uids)] } }, { projection: { firebaseUid: 1, name: 1 } })
    .toArray();
  return new Map(rows.map((u) => [u.firebaseUid, u.name]));
}

// One whole trip, as the website sees it.
export async function loadTripForMember(db, tripId, uid) {
  const trip = await db.collection('trips').findOne({ _id: tripId, 'members.uid': uid });
  if (!trip) throw new HttpError(404, 'This trip does not exist, or it was deleted.');
  const names = await namesFor(db, trip.members.map((m) => m.uid));
  const me = trip.members.find((m) => m.uid === uid);
  // Spending so far (settlements are not spending), for the overview's budget strip.
  const [spentRow] = await db
    .collection('expenses')
    .aggregate([{ $match: { tripId, type: 'expense' } }, { $group: { _id: null, spent: { $sum: '$amount' } } }])
    .toArray();
  return {
    id: trip._id.toString(),
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budget: trip.budget,
    spent: spentRow?.spent || 0,
    owner: trip.owner,
    myRole: me.role,
    members: trip.members.map((m) => ({ uid: m.uid, role: m.role, joinedAt: m.joinedAt, name: names.get(m.uid) || 'Former member' })),
    days: trip.days,
    checklist: trip.checklist || [],
    createdAt: trip.createdAt,
  };
}

// ---------- routes ----------

// GET /api/trips: every trip I am a member of, with what has been spent.
export async function listTrips(req, res) {
  const db = await getDb();
  const trips = await db
    .collection('trips')
    .find(
      { 'members.uid': req.user.uid },
      { projection: { name: 1, destination: 1, startDate: 1, endDate: 1, budget: 1, owner: 1, members: 1 } },
    )
    .sort({ startDate: 1 })
    .toArray();

  // BUDGET AGGREGATION (summary): one query adds up the spending of all these
  // trips at once. Settlements ("Mark as paid") move money between friends,
  // they are not spending, so they are left out.
  const spentRows = await db
    .collection('expenses')
    .aggregate([
      { $match: { tripId: { $in: trips.map((t) => t._id) }, type: 'expense' } },
      { $group: { _id: '$tripId', spent: { $sum: '$amount' } } },
    ])
    .toArray();
  const spent = new Map(spentRows.map((r) => [r._id.toString(), r.spent]));

  res.json({
    trips: trips.map((t) => ({
      id: t._id.toString(),
      name: t.name,
      destination: t.destination,
      startDate: t.startDate,
      endDate: t.endDate,
      budget: t.budget,
      spent: spent.get(t._id.toString()) || 0,
      memberCount: t.members.length,
      myRole: t.members.find((m) => m.uid === req.user.uid).role,
    })),
  });
}

// POST /api/trips: the creator becomes the owner; one empty day per date.
export async function createTrip(req, res) {
  const db = await getDb();
  const now = new Date();
  const { name, destination, startDate, endDate, budget } = req.body;
  const result = await db.collection('trips').insertOne({
    name,
    destination,
    startDate,
    endDate,
    budget,
    owner: req.user.uid,
    members: [{ uid: req.user.uid, role: 'owner', joinedAt: now }],
    days: buildDays(startDate, endDate),
    checklist: [],
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json({ trip: await loadTripForMember(db, result.insertedId, req.user.uid) });
}

// GET /api/trips/:id (after the membership check)
export async function getTrip(req, res) {
  const db = await getDb();
  res.json({ trip: await loadTripForMember(db, req.trip._id, req.user.uid) });
}

// PATCH /api/trips/:id (owner only): name, budget and/or dates.
export async function updateTrip(req, res) {
  const db = await getDb();
  const trips = db.collection('trips');
  const tripId = req.trip._id;
  const startDate = req.body.startDate ?? req.trip.startDate;
  const endDate = req.body.endDate ?? req.trip.endDate;
  const problem = dateRangeProblem(startDate, endDate);
  if (problem) throw new HttpError(400, problem);

  const simple = {};
  if (req.body.name !== undefined) simple.name = req.body.name;
  if (req.body.budget !== undefined) simple.budget = req.body.budget;

  const datesChanged = startDate !== req.trip.startDate || endDate !== req.trip.endDate;
  if (!datesChanged) {
    await trips.updateOne({ _id: tripId }, { $set: { ...simple, updatedAt: new Date() } });
    return res.json({ trip: await loadTripForMember(db, tripId, req.user.uid) });
  }

  // New dates: refuse if a day that would disappear still has stops on it.
  const newDates = datesBetween(startDate, endDate);
  const current = await trips.findOne({ _id: tripId }, { projection: { 'days.date': 1, 'days.dayNumber': 1, 'days.activities.id': 1 } });
  const stuck = current.days.filter((d) => !newDates.includes(d.date) && d.activities.length > 0);
  if (stuck.length) {
    const list = stuck.map((d) => `Day ${d.dayNumber} (${d.activities.length} stop${d.activities.length === 1 ? '' : 's'})`).join(', ');
    throw new HttpError(409, `These dates would remove ${list}. Delete or move those stops first, then change the dates.`);
  }
  const existing = new Set(current.days.map((d) => d.date));
  const toAdd = newDates.filter((d) => !existing.has(d)).map((date) => ({ dayNumber: 0, date, activities: [] }));

  // SAFE EDIT of the days list, done inside MongoDB in one step (never "load,
  // change, save"), so stops another member adds meanwhile are kept:
  //   keep the days still inside the dates, add the new empty days, renumber.
  // The filter makes it fail instead if the dates or the stuck days changed meanwhile.
  // Every value from the request is wrapped in $literal, so text that starts
  // with "$" is stored as text, never run as a database expression.
  const result = await trips.updateOne(
    {
      _id: tripId,
      startDate: req.trip.startDate,
      endDate: req.trip.endDate,
      days: { $not: { $elemMatch: { date: { $nin: newDates }, 'activities.0': { $exists: true } } } },
    },
    [
      {
        $set: {
          ...Object.fromEntries(Object.entries(simple).map(([k, v]) => [k, { $literal: v }])),
          startDate: { $literal: startDate },
          endDate: { $literal: endDate },
          updatedAt: '$$NOW',
          days: {
            $sortArray: {
              input: {
                $map: {
                  input: {
                    $concatArrays: [
                      { $filter: { input: '$days', as: 'd', cond: { $in: ['$$d.date', { $literal: newDates }] } } },
                      { $literal: toAdd },
                    ],
                  },
                  as: 'd',
                  in: { $mergeObjects: ['$$d', { dayNumber: { $add: [{ $indexOfArray: [{ $literal: newDates }, '$$d.date'] }, 1] } }] },
                },
              },
              sortBy: { dayNumber: 1 },
            },
          },
        },
      },
    ],
  );
  if (result.matchedCount === 0) {
    throw new HttpError(409, 'Someone changed this trip at the same moment. Reload the page and try again.');
  }
  res.json({ trip: await loadTripForMember(db, tripId, req.user.uid) });
}

// DELETE /api/trips/:id (owner only): the trip, its expenses and its invites.
export async function deleteTrip(req, res) {
  const db = await getDb();
  const tripId = req.trip._id;
  await db.collection('trips').deleteOne({ _id: tripId, owner: req.user.uid });
  await db.collection('expenses').deleteMany({ tripId });
  await db.collection('invites').deleteMany({ tripId });
  res.json({ deleted: true });
}
