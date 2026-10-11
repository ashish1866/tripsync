import { getDb } from '../config/db.js';
import { toObjectId } from '../utils/ids.js';
import { HttpError } from '../utils/httpError.js';

// THE MEMBERSHIP CHECK (guard chain, step 2): "is this user a member of THIS trip?"
// Every /api/trips/:id/... route runs this first. Without it, changing the trip
// id in the URL would show another group's trip.
//
// The database query itself asks for "this trip AND this user in its members",
// so a stranger can never get the trip back, even by accident.
// On success: req.trip = { _id, owner, members } and req.role = 'owner' | 'editor' | 'viewer'.
export const requireMember = memberOf((req) => req.params.id);

// The same check for routes that name the trip somewhere else, for example
// /geo/spots?tripId=... (the stop search is biased towards that trip's destination).
export function memberOf(readTripId) {
  return (req, res, next) => checkMember(readTripId(req), req, next);
}

async function checkMember(rawId, req, next) {
  const tripId = toObjectId(rawId);
  if (!tripId) throw new HttpError(404, 'This trip does not exist. The link may be mistyped.');

  const trips = (await getDb()).collection('trips');
  const trip = await trips.findOne(
    { _id: tripId, 'members.uid': req.user.uid },
    { projection: { owner: 1, members: 1, startDate: 1, endDate: 1, destination: 1, budget: 1 } },
  );

  if (!trip) {
    // Tell apart "no such trip" (404) and "not your trip" (403).
    const exists = await trips.countDocuments({ _id: tripId }, { limit: 1 });
    if (exists) throw new HttpError(403, 'You are not a member of this trip. Ask the owner for an invite link.');
    throw new HttpError(404, 'This trip does not exist, or it was deleted.');
  }

  req.trip = trip;
  req.role = trip.members.find((m) => m.uid === req.user.uid).role;
  next();
}

// THE ROLE CHECK (guard chain, step 3): "does this member's role allow it?"
// Used after requireMember, for example requireRole('owner', 'editor').
const ROLE_NAMES = { owner: 'the trip owner', editor: 'editors', viewer: 'viewers' };

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.role)) {
      const who = allowed.map((r) => ROLE_NAMES[r]).join(' and ');
      throw new HttpError(403, `Only ${who} can do this. You are a ${req.role} on this trip.`);
    }
    next();
  };
}
