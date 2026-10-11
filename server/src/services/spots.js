import { getConfig } from '../config/env.js';
import { fetchJson } from './outside.js';
import { HttpError } from '../utils/httpError.js';
import { toGeoapify, toStored } from '../utils/coords.js';

// STOP SEARCH: specific places (a valley, a temple, a cafe) from Geoapify's
// autocomplete, kept within 60 km of the trip's destination and nearest first.
// The key stays on the server: the browser only ever calls /api/geo/spots.
const BASE = 'https://api.geoapify.com/v1/geocode/autocomplete';
const RADIUS_M = 60_000;

export async function searchSpots(q, destination) {
  const { GEOAPIFY_KEY } = getConfig();
  if (!GEOAPIFY_KEY) throw new HttpError(503, 'The place search is not set up on this server yet.');

  const around = toGeoapify(destination.location); // "lon,lat"
  const params = new URLSearchParams({
    text: q,
    bias: `proximity:${around}`,
    filter: `circle:${around},${RADIUS_M}`,
    limit: '8',
    lang: 'en',
    format: 'json',
    apiKey: GEOAPIFY_KEY,
  });
  const data = await fetchJson(`${BASE}?${params}`, { service: 'The place search' });
  const results = Array.isArray(data.results) ? data.results : [];

  // Same name at almost the same point (a road and the valley it is named after): keep one.
  const seen = new Set();
  return results
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && (r.name || r.address_line1))
    .map((r) => ({
      name: String(r.name || r.address_line1).slice(0, 120),
      address: String(r.address_line2 || '').slice(0, 200),
      location: toStored(r.lat, r.lon),
      placeId: String(r.place_id || '').slice(0, 300),
    }))
    .filter((p) => {
      const key = `${p.name.toLowerCase()}|${p.location[0].toFixed(3)},${p.location[1].toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
