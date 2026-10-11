import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import { createProfileBody } from '../schemas/user.js';
import { getMe, createMe } from '../controllers/users.js';

// Mounted at /api/users, behind requireAuth (see app.js).
const router = Router();

router.get('/me', getMe);
router.post('/me', validateBody(createProfileBody), createMe);

export default router;
