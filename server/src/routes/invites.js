import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateParams } from '../middleware/validate.js';
import { rateLimit, LIMITS } from '../middleware/rateLimit.js';
import { codeParams } from '../schemas/member.js';
import { previewInvite, joinInvite } from '../controllers/invites.js';

// Mounted at /api/invites.
const router = Router();

// The ONE route that needs no login: the invite page shows what you are being
// invited to before you log in. It reveals no member names and no money.
router.get('/:code', validateParams(codeParams), previewInvite);

// Joining needs a login, and is rate-limited per account so codes cannot be guessed.
router.post('/:code/join', requireAuth, rateLimit('join', LIMITS.join), validateParams(codeParams), joinInvite);

export default router;
