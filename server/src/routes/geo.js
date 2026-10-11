import { Router } from 'express';
import { validateQuery } from '../middleware/validate.js';
import { memberOf } from '../middleware/tripAccess.js';
import { rateLimit, LIMITS } from '../middleware/rateLimit.js';
import { destinationQuery } from '../schemas/trip.js';
import { spotQuery } from '../schemas/activity.js';
import { searchDestinations } from '../services/geocode.js';
import { searchSpots } from '../services/spots.js';

// Mounted at /api/geo, behind requireAuth. Both routes call outside services,
// so both count against the per-account search limit.
const router = Router();
const searchLimit = rateLimit('search', LIMITS.search);

// GET /api/geo/destinations?q=Mana  ->  { results: [{ name, state, country, location: [lng, lat] }] }
router.get('/destinations', searchLimit, validateQuery(destinationQuery), async (req, res) => {
  res.json({ results: await searchDestinations(req.valid.query.q) });
});

// GET /api/geo/spots?q=Solang&tripId=...  ->  { results: [{ name, address, location: [lng, lat], placeId }] }
// Only members of that trip may search around it (the guard chain's membership step).
router.get('/spots', memberOf((req) => req.query.tripId), searchLimit, validateQuery(spotQuery), async (req, res) => {
  res.json({ results: await searchSpots(req.valid.query.q, req.trip.destination) });
});

export default router;
