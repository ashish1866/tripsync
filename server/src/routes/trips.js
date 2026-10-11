import { Router } from 'express';
import { requireMember, requireRole } from '../middleware/tripAccess.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { createTripBody, updateTripBody } from '../schemas/trip.js';
import { activityParams, dayParams, editActivityBody, newActivityBody } from '../schemas/activity.js';
import { listTrips, createTrip, getTrip, updateTrip, deleteTrip } from '../controllers/trips.js';
import { addActivity, editActivity, deleteActivity } from '../controllers/activities.js';

// Mounted at /api/trips, behind requireAuth (see app.js).
// Every route with :id runs the guard chain in this order:
//   token (requireAuth) -> member of this trip (requireMember) -> role (requireRole) -> input (validate*) -> work
const router = Router();
const planners = requireRole('owner', 'editor');

router.get('/', listTrips);
router.post('/', validateBody(createTripBody), createTrip);

router.get('/:id', requireMember, getTrip);
router.patch('/:id', requireMember, requireRole('owner'), validateBody(updateTripBody), updateTrip);
router.delete('/:id', requireMember, requireRole('owner'), deleteTrip);

// Stops on a day
router.post('/:id/days/:day/activities', requireMember, planners, validateParams(dayParams), validateBody(newActivityBody), addActivity);
router.patch('/:id/activities/:actId', requireMember, planners, validateParams(activityParams), validateBody(editActivityBody), editActivity);
router.delete('/:id/activities/:actId', requireMember, planners, validateParams(activityParams), deleteActivity);

export default router;
