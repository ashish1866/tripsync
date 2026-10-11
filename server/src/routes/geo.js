import { Router } from 'express';
import { validateQuery } from '../middleware/validate.js';
import { destinationQuery } from '../schemas/trip.js';
import { searchDestinations } from '../services/geocode.js';

// Mounted at /api/geo, behind requireAuth.
const router = Router();

// GET /api/geo/destinations?q=Mana  ->  { results: [{ name, state, country, location: [lng, lat] }] }
router.get('/destinations', validateQuery(destinationQuery), async (req, res) => {
  res.json({ results: await searchDestinations(req.valid.query.q) });
});

export default router;
