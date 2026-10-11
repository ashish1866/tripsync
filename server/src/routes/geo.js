import { Router } from 'express';
import { validateQuery } from '../middleware/validate.js';
import { memberOf } from '../middleware/tripAccess.js';
import { destinationQuery } from '../schemas/trip.js';
import { spotQuery } from '../schemas/activity.js';
import { searchDestinations } from '../services/geocode.js';
import { searchSpots } from '../services/spots.js';

// Mounted at /api/geo, behind requireAuth.
const router = Router();

// GET /api/geo/destinations?q=Mana  ->  { results: [{ name, state, country, location: [lng, lat] }] }
router.get('/destinations', validateQuery(destinationQuery), async (req, res) => {
  res.json({ results: await searchDestinations(req.valid.query.q) });
});

// GET /api/geo/spots?q=Solang&tripId=...  ->  { results: [{ name, address, location: [lng, lat], placeId }] }
// Only members of that trip may search around it (the guard chain's membership step).
router.get('/spots', memberOf((req) => req.query.tripId), validateQuery(spotQuery), async (req, res) => {
  res.json({ results: await searchSpots(req.valid.query.q, req.trip.destination) });
});

export default router;
