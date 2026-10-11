import { Router } from 'express';
import { requireMember, requireRole } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { createTripBody, updateTripBody } from '../schemas/trip.js';
import { listTrips, createTrip, getTrip, updateTrip, deleteTrip } from '../controllers/trips.js';

// Mounted at /api/trips, behind requireAuth (see app.js).
// Every route with :id runs the guard chain in this order:
//   token (requireAuth) -> member of this trip (requireMember) -> role (requireRole) -> body (validateBody) -> work
const router = Router();

router.get('/', listTrips);
router.post('/', validateBody(createTripBody), createTrip);

router.get('/:id', requireMember, getTrip);
router.patch('/:id', requireMember, requireRole('owner'), validateBody(updateTripBody), updateTrip);
router.delete('/:id', requireMember, requireRole('owner'), deleteTrip);

export default router;
