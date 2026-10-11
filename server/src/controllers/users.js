import { userDocument, toPublicUser } from '../schemas/user.js';
import { HttpError } from '../utils/httpError.js';

// GET /api/users/me
// The logged-in user's TripSync profile. 404 means "logged in with Firebase,
// but no TripSync profile yet", which tells the website to create one.
export async function getMe(req, res) {
  const db = await req.getDb();
  const user = await db.collection('users').findOne({ firebaseUid: req.user.uid });
  if (!user) {
    throw new HttpError(404, 'You do not have a TripSync profile yet.');
  }
  res.json({ user: toPublicUser(user) });
}

// POST /api/users/me   body: { name }
// Creates the profile after the first login. Safe to call more than once:
// if the profile already exists it is returned unchanged (200), otherwise it
// is created (201). The user id and email come from the verified token.
export async function createMe(req, res) {
  const db = await req.getDb();
  const users = db.collection('users');

  const newProfile = userDocument.parse({
    firebaseUid: req.user.uid,
    name: req.body.name,
    email: req.user.email,
    createdAt: new Date(),
  });

  let created = false;
  try {
    // $setOnInsert only writes when no profile matched, so an existing one is never overwritten.
    const result = await users.updateOne(
      { firebaseUid: req.user.uid },
      { $setOnInsert: newProfile },
      { upsert: true },
    );
    created = result.upsertedCount === 1;
  } catch (err) {
    // 11000 = duplicate key: two requests raced and the other one created the
    // profile first (the unique index on firebaseUid stopped a second copy).
    if (err?.code !== 11000) throw err;
  }

  const user = await users.findOne({ firebaseUid: req.user.uid });
  res.status(created ? 201 : 200).json({ user: toPublicUser(user) });
}
