import { fetchJson } from './outside.js';
import { toStored } from '../utils/coords.js';

// DESTINATION SEARCH: towns and cities from Open-Meteo's free geocoding (no key).
//
// TripSync's groups mostly travel inside India, so we ask twice at once:
// Indian places (up to 100) and places worldwide. Indian towns come first,
// biggest first, then a few large places abroad (Bangkok, Dubai). Open-Meteo
// matches whole words better than prefixes: "Man" does not reach Manali,
// "Mana" does.
const BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const SHOW_INDIA = 6;
const SHOW_ABROAD = 2;

async function search(q, countryCode) {
  const params = new URLSearchParams({ name: q, count: '100', language: 'en', format: 'json' });
  if (countryCode) params.set('countryCode', countryCode);
  const data = await fetchJson(`${BASE}?${params}`, { service: 'The place search', showReason: true });
  return Array.isArray(data.results) ? data.results : [];
}

export async function searchDestinations(q) {
  const [india, world] = await Promise.all([search(q, 'IN'), search(q, '')]);

  // Only populated places (towns, cities), not airports, rivers or mountains.
  const towns = (list) => list.filter((r) => typeof r.feature_code === 'string' && r.feature_code.startsWith('PPL'));
  const biggestFirst = (a, b) => (b.population || 0) - (a.population || 0);

  const indian = towns(india).sort(biggestFirst);
  const abroad = towns(world)
    .filter((r) => r.country_code !== 'IN' && (r.population || 0) >= 100_000)
    .sort(biggestFirst);

  // The same town can appear twice (two ids, same name and state): keep one.
  const seen = new Set();
  const unique = (r) => {
    const key = `${r.name}|${r.admin1 || ''}|${r.country_code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  return [...indian.filter(unique).slice(0, SHOW_INDIA), ...abroad.filter(unique).slice(0, SHOW_ABROAD)].map((r) => ({
    name: r.name,
    state: r.admin1 || '',
    country: r.country || r.country_code || '',
    location: toStored(r.latitude, r.longitude),
  }));
}
