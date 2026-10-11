import { getConfig } from '../config/env.js';
import { verifyFirebaseToken } from '../services/firebaseToken.js';
import { HttpError } from '../utils/httpError.js';

// Step 1 of the guard chain: "is this a logged-in TripSync user?"
// Reads "Authorization: Bearer <Firebase ID token>", checks the token, and puts
// the user on req.user = { uid, email, name } for the routes after it.
// No token or a bad token stops the request here with 401.
export async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  // A Firebase token is three base64url parts joined by dots, about 1 KB long.
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
  if (!match || match[1].length > 4096) {
    throw new HttpError(401, 'Log in to TripSync to do this.');
  }

  req.user = await verifyFirebaseToken(match[1], { projectId: getConfig().FIREBASE_PROJECT_ID });
  next();
}
