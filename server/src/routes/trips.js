import { Router } from 'express';
import { requireMember, requireRole } from '../middleware/tripAccess.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { rateLimit, LIMITS } from '../middleware/rateLimit.js';
import { createTripBody, updateTripBody } from '../schemas/trip.js';
import { activityParams, dayParams, editActivityBody, newActivityBody } from '../schemas/activity.js';
import { inviteBody, inviteParams, memberParams, roleBody } from '../schemas/member.js';
import { listTrips, createTrip, getTrip, updateTrip, deleteTrip } from '../controllers/trips.js';
import { addActivity, editActivity, deleteActivity } from '../controllers/activities.js';
import { createInvite, listInvites, revokeInvite } from '../controllers/invites.js';
import { changeRole, ownerOrSelf, removeMember } from '../controllers/members.js';
import { addExpense, budget, deleteExpense, editExpense, listExpenses, markPaid, ownBillOrOwner, settlements } from '../controllers/expenses.js';
import { expenseBody, expenseParams, settlementBody } from '../schemas/expense.js';
import { itemParams, newItemBody, tickBody } from '../schemas/checklist.js';
import { addItem, deleteItem, tickItem } from '../controllers/checklist.js';
import { weatherForTrip } from '../services/weather.js';
import { nearbyPlaces } from '../services/places.js';
import { placesQuery } from '../schemas/places.js';

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

// The shared packing list (the list itself comes with GET /:id; only owner and editors change it)
router.post('/:id/checklist', requireMember, planners, validateBody(newItemBody), addItem);
router.patch('/:id/checklist/:itemId', requireMember, planners, validateParams(itemParams), validateBody(tickBody), tickItem);
router.delete('/:id/checklist/:itemId', requireMember, planners, validateParams(itemParams), deleteItem);

// Nearby places for Explore (any member): ?category=cafe&radius=5000
router.get('/:id/places', requireMember, rateLimit('places', LIMITS.places), validateQuery(placesQuery), async (req, res) => {
  const { category, radius } = req.valid.query;
  res.json(await nearbyPlaces(req.trip.destination, category, radius));
});

// Invites and members (the owner runs the group; anyone but the owner may leave)
router.post('/:id/invites', requireMember, owner, validateBody(inviteBody), createInvite);
router.get('/:id/invites', requireMember, owner, listInvites);
router.delete('/:id/invites/:code', requireMember, owner, validateParams(inviteParams), revokeInvite);
router.patch('/:id/members/:uid', requireMember, owner, validateParams(memberParams), validateBody(roleBody), changeRole);
router.delete('/:id/members/:uid', requireMember, ownerOrSelf, validateParams(memberParams), removeMember);

// Bills, budget and settle up. Editing or deleting a bill: the owner any, an
// editor only their own (ownBillOrOwner is the role step for those two routes).
router.get('/:id/expenses', requireMember, listExpenses);
router.post('/:id/expenses', requireMember, planners, validateBody(expenseBody), addExpense);
router.patch('/:id/expenses/:expenseId', requireMember, planners, ownBillOrOwner, validateParams(expenseParams), validateBody(expenseBody), editExpense);
router.delete('/:id/expenses/:expenseId', requireMember, planners, ownBillOrOwner, validateParams(expenseParams), deleteExpense);
router.get('/:id/budget', requireMember, budget);
router.get('/:id/settlements', requireMember, settlements);
router.post('/:id/settlements', requireMember, planners, validateBody(settlementBody), markPaid);

export default router;
