import { z } from 'zod';
import { CATEGORIES, RADII } from '../services/places.js';

// GET /trips/:id/places?category=cafe&radius=5000
export const placesQuery = z.object({
  category: z.enum(Object.keys(CATEGORIES), 'Pick what to look for: cafe, restaurant, hotel or attraction.'),
  radius: z
    .string()
    .default('5000')
    .transform(Number)
    .refine((n) => RADII.includes(n), `Pick a distance of ${RADII.map((r) => r / 1000).join(', ')} km.`),
});
