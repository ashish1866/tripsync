import { Router } from 'express';
import { requireMember, requireRole } from '../middleware/tripAccess.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { rateLimit, LIMITS } from '../middleware/rateLimit.js';
import { createTripBody, updateTripBody } from '../schemas/trip.js';
import { activityParams, dayParams, editActivityBody, newActivityBody } from '../schemas/activity.js';
import { inviteBody, inviteParams, memberParams, roleBody } from '../schemas/member.js';
import { listTrips, createTrip, getTrip, updateTrip, deleteTrip } from '../controllers/trips.js';
import { addActivity, editActivity, deleteActivity } from '../controllers/activities.js';
import { createInvite, listInvites, revokeInvite } from '../controllers/invites.js';
import { changeRole, ownerOrSelf, removeMember } from '../controllers/members.js';
import { weatherForTrip } from '../services/weather.js';

// Mounted at /api/trips, behind requireAuth (see app.js).
// Every route with :id runs the guard chain in this order:
//   token (requireAuth) -> member of this trip (requireMember) -> role (requireRole) -> input (validate*) -> work
const router = Router();
const owner = requireRole('owner');
const planners = requireRole('owner', 'editor');

router.get('/', listTrips);
router.post('/', validateBody(createTripBody), createTrip);

router.get('/:id', requireMember, getTrip);
router.patch('/:id', requireMember, owner, validateBody(updateTripBody), updateTrip);
router.delete('/:id', requireMember, owner, deleteTrip);

// Stops on a day
router.post('/:id/days/:day/activities', requireMember, planners, validateParams(dayParams), validateBody(newActivityBody), addActivity);
router.patch('/:id/activities/:actId', requireMember, planners, validateParams(activityParams), validateBody(editActivityBody), editActivity);
router.delete('/:id/activities/:actId', requireMember, planners, validateParams(activityParams), deleteActivity);

// Weather for each day (any member). requireMember already loaded the destination and dates.
router.get('/:id/weather', requireMember, rateLimit('weather', LIMITS.weather), async (req, res) => {
  res.json({ weather: await weatherForTrip(req.trip) });
});

// Invites and members (the owner runs the group; anyone but the owner may leave)
router.post('/:id/invites', requireMember, owner, validateBody(inviteBody), createInvite);
router.get('/:id/invites', requireMember, owner, listInvites);
router.delete('/:id/invites/:code', requireMember, owner, validateParams(inviteParams), revokeInvite);
router.patch('/:id/members/:uid', requireMember, owner, validateParams(memberParams), validateBody(roleBody), changeRole);
router.delete('/:id/members/:uid', requireMember, ownerOrSelf, validateParams(memberParams), removeMember);

export default router;
