import { withDb } from '../config/db.js';

// One-time (safe to re-run) database setup: creates the indexes from the brief.
// Run with: npm run setup-db
// createIndex does nothing if the same index already exists.

const DAY = 24 * 60 * 60;

const indexes = [
  // One profile per Firebase account.
  { collection: 'users', keys: { firebaseUid: 1 }, options: { unique: true, name: 'firebaseUid_unique' } },
  // "Which trips is this user a member of?" (the trips list and every membership check).
  { collection: 'trips', keys: { 'members.uid': 1 }, options: { name: 'members_uid' } },
  // All expenses of one trip, newest first.
  { collection: 'expenses', keys: { tripId: 1, date: -1 }, options: { name: 'tripId_date' } },
  // Places: one row per Geoapify place, and "near this point" searches.
  { collection: 'places', keys: { placeId: 1 }, options: { unique: true, name: 'placeId_unique' } },
  { collection: 'places', keys: { location: '2dsphere' }, options: { name: 'location_2dsphere' } },
  // Weather cache entries delete themselves 3 hours after they were stored.
  { collection: 'weatherCache', keys: { key: 1 }, options: { unique: true, name: 'key_unique' } },
  { collection: 'weatherCache', keys: { createdAt: 1 }, options: { expireAfterSeconds: 3 * 60 * 60, name: 'createdAt_ttl_3h' } },
  // Invites: looked up by code, deleted automatically after 7 days.
  { collection: 'invites', keys: { code: 1 }, options: { unique: true, name: 'code_unique' } },
  { collection: 'invites', keys: { createdAt: 1 }, options: { expireAfterSeconds: 7 * DAY, name: 'createdAt_ttl_7d' } },
];

await withDb(async (db) => {
  for (const { collection, keys, options } of indexes) {
    const name = await db.collection(collection).createIndex(keys, options);
    console.log(`  ${collection}: ${name}`);
  }
  console.log('Indexes are in place.');
});
