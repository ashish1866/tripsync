import { randomInt } from 'node:crypto';
import { getDb } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { CODE_LENGTH, INVITE_ALPHABET } from '../schemas/member.js';

// INVITES: a code (and a link /join/CODE) that lets people join one trip with
// one role (Editor or Viewer). A code works for anyone who has it, as many
// times as needed, for 7 days.
//
// Expiry is checked HERE, in code, on every use. The TTL index on createdAt
// also deletes old invites, but MongoDB only runs that clean-up about once a
// minute, so it can never be the thing that decides.
export const INVITE_DAYS = 7;
const INVITE_MS = INVITE_DAYS * 24 * 60 * 60 * 1000;
export const MAX_MEMBERS = 20;

const EXPIRED = "This invite has expired, ask the owner for a new one.";
// Also what an expired invite says once MongoDB's TTL clean-up has removed it.
const UNKNOWN = 'There is no invite with this code. Check it with the person who sent it; if it is more than 7 days old it has expired, so ask the owner for a new one.';

const expiresAt = (invite) => new Date(invite.createdAt.getTime() + INVITE_MS);
const isExpired = (invite, now = Date.now()) => now >= expiresAt(invite).getTime();

function newCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}

const shape = (invite) => ({ code: invite.code, role: invite.role, createdAt: invite.createdAt, expiresAt: expiresAt(invite) });

// POST /api/trips/:id/invites (owner): { role }
export async function createInvite(req, res) {
  const invites = (await getDb()).collection('invites');
  const invite = { tripId: req.trip._id, role: req.body.role, createdBy: req.user.uid, createdAt: new Date() };
  // A clash with an existing code is about 1 in 800 billion; try again if it happens.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      invite.code = newCode();
      await invites.insertOne(invite);
      return res.status(201).json({ invite: shape(invite) });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      delete invite._id;
    }
  }
  throw new Error('Could not make a unique invite code after 3 tries.');
}

// GET /api/trips/:id/invites (owner): the invites that still work.
export async function listInvites(req, res) {
  const rows = await (await getDb())
    .collection('invites')
    .find({ tripId: req.trip._id, createdAt: { $gt: new Date(Date.now() - INVITE_MS) } })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ invites: rows.map(shape) });
}

// DELETE /api/trips/:id/invites/:code (owner): stop a code working at once.
export async function revokeInvite(req, res) {
  const result = await (await getDb()).collection('invites').deleteOne({ tripId: req.trip._id, code: req.valid.params.code });
  if (!result.deletedCount) throw new HttpError(404, UNKNOWN);
  res.json({ revoked: true });
}

// The invite and its trip, or the reason it cannot be used.
async function usableInvite(db, code) {
  const invite = await db.collection('invites').findOne({ code });
  if (!invite) throw new HttpError(404, UNKNOWN);
  if (isExpired(invite)) throw new HttpError(410, EXPIRED);
  const trip = await db
    .collection('trips')
    .findOne({ _id: invite.tripId }, { projection: { name: 1, destination: 1, startDate: 1, endDate: 1, owner: 1, members: 1 } });
  if (!trip) throw new HttpError(404, 'The trip for this invite was deleted.');
  return { invite, trip };
}

// GET /api/invites/:code (public, no login): what the invite is for, so the
// page can say "Ashish invited you to Manali Trip as an Editor" before anyone
// logs in. It shows no member names and nothing about money.
export async function previewInvite(req, res) {
  const db = await getDb();
  const { invite, trip } = await usableInvite(db, req.valid.params.code);
  const owner = await db.collection('users').findOne({ firebaseUid: trip.owner }, { projection: { name: 1 } });
  res.json({
    invite: {
      ...shape(invite),
      trip: {
        // The id alone opens nothing: every trip route still checks membership.
        id: trip._id.toString(),
        name: trip.name,
        destination: { name: trip.destination.name, state: trip.destination.state, country: trip.destination.country },
        startDate: trip.startDate,
        endDate: trip.endDate,
        memberCount: trip.members.length,
        ownerName: owner?.name || 'The trip owner',
      },
    },
  });
}

// POST /api/invites/:code/join (logged in)
export async function joinInvite(req, res) {
  const db = await getDb();
  const { invite, trip } = await usableInvite(db, req.valid.params.code);
  const uid = req.user.uid;
  if (trip.members.some((m) => m.uid === uid)) {
    throw new HttpError(409, "You're already in this trip.");
  }

  // One update that only matches if this person is not a member yet and the
  // trip has room, so pressing Join twice at once cannot add them twice.
  const result = await db.collection('trips').updateOne(
    { _id: trip._id, 'members.uid': { $ne: uid }, [`members.${MAX_MEMBERS - 1}`]: { $exists: false } },
    { $push: { members: { uid, role: invite.role, joinedAt: new Date() } } },
  );
  if (result.matchedCount === 0) {
    const again = await db.collection('trips').findOne({ _id: trip._id }, { projection: { members: 1 } });
    if (again?.members.some((m) => m.uid === uid)) throw new HttpError(409, "You're already in this trip.");
    if (!again) throw new HttpError(404, 'The trip for this invite was deleted.');
    throw new HttpError(409, `This trip already has ${MAX_MEMBERS} people, the most TripSync allows.`);
  }
  res.status(201).json({ tripId: trip._id.toString(), role: invite.role });
}
