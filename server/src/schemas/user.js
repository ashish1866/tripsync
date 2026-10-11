import { z } from 'zod';

// We use the plain MongoDB driver (no Mongoose), so the shape of each document
// is written down here with zod and checked before anything is saved.

// A display name: what the group sees next to bills and in settle-up.
export const displayName = z
  .string('Enter your name.')
  .trim()
  .min(1, 'Enter your name.')
  .max(60, 'Keep your name under 60 characters.')
  .regex(/^[^\u0000-\u001f\u007f]+$/, 'Your name contains characters that cannot be shown.');

// Body of POST /api/users/me. Only "name" is accepted: the email and user id
// come from the verified Firebase token, never from what the browser claims.
export const createProfileBody = z.strictObject({
  name: displayName,
});

// One document in the "users" collection.
export const userDocument = z.object({
  firebaseUid: z.string().min(1).max(128),
  name: displayName,
  email: z.email().nullable(),
  createdAt: z.date(),
});

// What the API sends back about a user (no MongoDB internals).
export function toPublicUser(doc) {
  return {
    uid: doc.firebaseUid,
    name: doc.name,
    email: doc.email,
    createdAt: doc.createdAt,
  };
}
