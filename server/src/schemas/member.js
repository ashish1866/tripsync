import { z } from 'zod';

// Roles a member can be given. "owner" is never handed out: each trip has one,
// the person who created it.
const givenRole = z.enum(['editor', 'viewer'], 'Pick Editor or Viewer.');

export const inviteBody = z.strictObject({ role: givenRole });
export const roleBody = z.strictObject({ role: givenRole });

// Invite codes: 8 letters and digits from an alphabet without look-alikes
// (no 0/O, no 1/I/L), typed in any case.
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

export const codeParams = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(new RegExp(`^[${INVITE_ALPHABET}]{${CODE_LENGTH}}$`), 'This invite code is not valid. It has 8 letters and digits, for example K7TQ2MXP.'),
});

// /trips/:id/members/:uid (Firebase user ids are letters and digits)
export const memberParams = z.object({
  id: z.string(),
  uid: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'This member does not exist.'),
});

export const inviteParams = z.object({ id: z.string(), code: codeParams.shape.code });
