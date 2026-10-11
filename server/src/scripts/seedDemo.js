import { ObjectId } from 'mongodb';
import { getDb, closeDb } from '../config/db.js';
import { addDays } from '../utils/dates.js';
import { buildDemo, DEMO_DAYS, DEMO_TAG, FRIENDS } from './demoTrip.js';

// Loads the Manali demo trip (see demoTrip.js) into a database.
//
//   npm run seed -- --owner you@example.com            owner = an account that has logged in once
//   npm run seed -- --owner you@example.com --db tripsync      into the database named tripsync
//   npm run seed -- --owner you@example.com --start 2026-10-20  first day of the trip
//   npm run seed -- --owner you@example.com --remove   take the demo trip and its demo friends out again
//
// The owner must already exist in the TARGET database: log in to the website once
// with that email (the profile is created on first login). Running it again
// replaces the earlier demo trip; it never touches any other trip.

function readArgs(argv) {
  const out = { owner: null, db: null, start: null, remove: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remove') out.remove = true;
    else if (a === '--owner' || a === '--db' || a === '--start') out[a.slice(2)] = argv[++i] ?? null;
    else fail(`I do not know "${a}". Use --owner EMAIL, and optionally --db NAME, --start YYYY-MM-DD, --remove.`);
  }
  return out;
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// Today's date in India, "2026-10-12".
const todayInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const args = readArgs(process.argv.slice(2));
if (!args.owner) fail('Say whose trip this is: npm run seed -- --owner you@example.com');
if (args.db) process.env.MONGODB_DB = args.db; // before the first database call reads the settings
if (args.start && !/^\d{4}-\d{2}-\d{2}$/.test(args.start)) fail('--start must look like 2026-10-20.');

try {
  const db = await getDb();
  console.log(`Database: ${db.databaseName}`);

  const owner = await db.collection('users').findOne({ email: args.owner.trim().toLowerCase() }, { projection: { firebaseUid: 1, name: 1, email: 1 } });
  if (!owner) {
    fail(
      `There is no TripSync profile for ${args.owner} in the database "${db.databaseName}".\n` +
        'Open the website, log in (or sign up) with that email once, then run this again.',
    );
  }

  // Take out any earlier demo trip of this owner (and only that).
  const earlier = await db.collection('trips').find({ owner: owner.firebaseUid, seed: DEMO_TAG }, { projection: { _id: 1 } }).toArray();
  const earlierIds = earlier.map((t) => t._id);
  if (earlierIds.length) {
    await db.collection('expenses').deleteMany({ tripId: { $in: earlierIds } });
    await db.collection('invites').deleteMany({ tripId: { $in: earlierIds } });
    await db.collection('trips').deleteMany({ _id: { $in: earlierIds } });
    console.log(`Removed ${earlierIds.length} earlier demo trip(s).`);
  }

  if (args.remove) {
    const gone = await db.collection('users').deleteMany({ demo: true, firebaseUid: { $in: FRIENDS.map((f) => f.uid) } });
    console.log(`Removed the demo friends (${gone.deletedCount} profiles). Nothing else was touched.`);
  } else {
    const startDate = args.start ?? addDays(todayInIndia(), 3);
    const tripId = new ObjectId();
    const demo = buildDemo({ owner: { uid: owner.firebaseUid, name: owner.name }, startDate, tripId });

    // The demo friends: one profile each, replaced if it is already there.
    for (const u of demo.users) await db.collection('users').replaceOne({ firebaseUid: u.firebaseUid }, u, { upsert: true });
    await db.collection('trips').insertOne(demo.trip);
    await db.collection('expenses').insertMany(demo.expenses);

    const spent = demo.expenses.filter((e) => e.type === 'expense').reduce((n, e) => n + e.amount, 0);
    console.log(`Loaded "${demo.trip.name}" for ${owner.name} (${owner.email}).`);
    console.log(`  ${DEMO_DAYS} days, ${demo.dates[0]} to ${demo.dates[demo.dates.length - 1]}; ${demo.trip.days.reduce((n, d) => n + d.activities.length, 0)} stops; ${demo.trip.checklist.length} packing items`);
    console.log(`  ${demo.expenses.filter((e) => e.type === 'expense').length} bills and 1 payment; Rs ${(spent / 100).toLocaleString('en-IN')} spent of Rs ${(demo.trip.budget / 100).toLocaleString('en-IN')}`);
    console.log(`  Open it at /trips/${tripId.toString()} after logging in as ${owner.email}`);
  }
} finally {
  await closeDb();
}
