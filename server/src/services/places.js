import { getConfig } from '../config/env.js';
import { getDb } from '../config/db.js';
import { fetchJson } from './outside.js';
import { HttpError } from '../utils/httpError.js';
import { toGeoapify, toStored, weatherKey } from '../utils/coords.js';

// NEARBY PLACES (Explore): cafes, restaurants, hotels and attractions around
// the trip's destination, from Geoapify Places, cached in the `places` collection.
//
// 1. Look in `places` first with a geo query ($geoNear on the 2dsphere index):
//    places saved by this same search (category + area + radius) in the last 7 days,
//    nearest first, with MongoDB working out each distance.
// 2. Nothing there: ask Geoapify (categories + filter=circle:lon,lat,radius),
//    save every place (one document per Geoapify place_id), then run step 1 again.
// Geoapify has no star ratings, so none are shown: name, category, address, distance.
export const CATEGORIES = {
  cafe: { geoapify: 'catering.cafe', label: 'Cafes' },
  restaurant: { geoapify: 'catering.restaurant', label: 'Restaurants' },
  hotel: { geoapify: 'accommodation.hotel,accommodation.guest_house,accommodation.hostel', label: 'Places to stay' },
  attraction: { geoapify: 'tourism.attraction,tourism.sights', label: 'Things to see' },
};
export const RADII = [2000, 5000, 10000];
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const LIMIT = 20;
const BASE = 'https://api.geoapify.com/v2/places';

// One search = one key: "cafe|32.26,77.17|5000" (the area rounded to about 1 km).
const searchKey = (category, location, radius) => `${category}|${weatherKey(location)}|${radius}`;

async function fromCache(places, key, location, radius) {
  return places
    .aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: location }, // [lng, lat], as stored
          distanceField: 'distance', // metres, straight line
          maxDistance: radius,
          spherical: true,
          query: { searchKeys: key, fetchedAt: { $gt: new Date(Date.now() - FRESH_MS) } },
        },
      },
      { $limit: LIMIT },
      { $project: { _id: 0, placeId: 1, name: 1, address: 1, location: 1, distance: 1, fetchedAt: 1 } },
    ])
    .toArray();
}

async function fromGeoapify(category, location, radius) {
  const { GEOAPIFY_KEY } = getConfig();
  if (!GEOAPIFY_KEY) throw new HttpError(503, 'The nearby places search is not set up on this server yet.');
  const around = toGeoapify(location); // "lon,lat"
  const params = new URLSearchParams({
    categories: CATEGORIES[category].geoapify,
    filter: `circle:${around},${radius}`,
    bias: `proximity:${around}`,
    limit: String(LIMIT * 2), // nameless places are dropped below
    lang: 'en',
    apiKey: GEOAPIFY_KEY,
  });
  const data = await fetchJson(`${BASE}?${params}`, { service: 'The nearby places search' });
  const features = Array.isArray(data.features) ? data.features : [];
  return features
    .map((f) => f.properties || {})
    // A place without a name cannot be shown honestly ("Peddler Street" is a street, not a sight).
    .filter((p) => typeof p.name === 'string' && p.name.trim() && typeof p.place_id === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({
      placeId: p.place_id.slice(0, 300),
      name: p.name.trim().slice(0, 120),
      category,
      address: String(p.address_line2 || p.formatted || '').slice(0, 200),
      location: toStored(p.lat, p.lon),
    }));
}

// { category, radius, source: 'cache' | 'geoapify', fetchedAt, places: [...] }
export async function nearbyPlaces(destination, category, radius) {
  const places = (await getDb()).collection('places');
  const key = searchKey(category, destination.location, radius);

  let rows = await fromCache(places, key, destination.location, radius);
  let source = 'cache';
  if (rows.length === 0) {
    const found = await fromGeoapify(category, destination.location, radius);
    const now = new Date();
    if (found.length) {
      // One document per place: searches that find the same cafe share it.
      await places.bulkWrite(
        found.map((p) => ({
          updateOne: {
            filter: { placeId: p.placeId },
            // A place can be a cafe AND a restaurant: categories collects every search that found it.
            update: { $set: { placeId: p.placeId, name: p.name, address: p.address, location: p.location, fetchedAt: now }, $addToSet: { searchKeys: key, categories: category } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    console.log(`[places] ${key}: asked Geoapify, ${found.length} places`);
    rows = await fromCache(places, key, destination.location, radius);
    source = 'geoapify';
  } else {
    console.log(`[places] ${key}: from the cache, ${rows.length} places`);
  }

  const fetchedAt = rows.reduce((oldest, r) => (!oldest || r.fetchedAt < oldest ? r.fetchedAt : oldest), null);
  return {
    category,
    radius,
    source,
    fetchedAt,
    places: rows.map(({ fetchedAt: _f, distance, ...p }) => ({ ...p, category, distance: Math.round(distance) })),
  };
}
