import { getDb } from '../config/db.js';
import { fetchJson } from './outside.js';
import { weatherKey } from '../utils/coords.js';
import { addDays, datesBetween } from '../utils/dates.js';
import { RAIN_LIMIT, weatherForDays } from '../utils/weather.js';

// WEATHER with a 3-hour cache (the weatherCache collection).
//
// 1. Round the destination to 2 decimals (about 1 km): trips to the same town share one entry.
// 2. A cached entry younger than 3 hours is used as it is. The age is checked here
//    in code too, because MongoDB's TTL clean-up runs only about once a minute.
// 3. Otherwise ask Open-Meteo (free, no key) for 16 days, store it, use it.
// Open-Meteo's forecast reaches about 16 days ahead. Days beyond it come back
// as "later", and a trip that starts beyond it does not call Open-Meteo at all.
const BASE = 'https://api.open-meteo.com/v1/forecast';
export const CACHE_MS = 3 * 60 * 60 * 1000;
const FORECAST_DAYS = 16;
const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code';

const todayUtc = () => new Date().toISOString().slice(0, 10);

async function cachedForecast(key) {
  const db = await getDb();
  const cache = db.collection('weatherCache');
  const fresh = await cache.findOne({ key, createdAt: { $gt: new Date(Date.now() - CACHE_MS) } });
  if (fresh) {
    console.log(`[weather] ${key}: from the cache (stored ${fresh.createdAt.toISOString()})`);
    return { data: fresh.data, fetchedAt: fresh.createdAt, source: 'cache' };
  }

  const [lat, lng] = key.split(',');
  const params = new URLSearchParams({ latitude: lat, longitude: lng, daily: DAILY, timezone: 'auto', forecast_days: String(FORECAST_DAYS) });
  const answer = await fetchJson(`${BASE}?${params}`, { service: 'The weather service' });
  const data = { timezone: answer.timezone ?? null, daily: answer.daily ?? null };
  const now = new Date();
  await cache.updateOne({ key }, { $set: { data, createdAt: now } }, { upsert: true });
  console.log(`[weather] ${key}: asked Open-Meteo`);
  return { data, fetchedAt: now, source: 'open-meteo' };
}

// The weather for each day of a trip ({ destination, startDate, endDate }):
// { place, source: 'cache' | 'open-meteo' | 'none', fetchedAt, timezone, days }.
export async function weatherForTrip(trip) {
  const key = weatherKey(trip.destination.location);
  const days = datesBetween(trip.startDate, trip.endDate).map((date, i) => ({ dayNumber: i + 1, date }));
  const today = todayUtc();

  // Nothing to ask for: the whole trip is beyond the forecast, or already over.
  const lastDate = days[days.length - 1].date;
  if (days[0].date >= addDays(today, FORECAST_DAYS) || lastDate < addDays(today, -1)) {
    const none = weatherForDays(days, null).map((d) => (d.date < today ? { ...d, status: 'past' } : d));
    return { place: key, source: 'none', fetchedAt: null, timezone: null, forecastDays: FORECAST_DAYS, rainLimit: RAIN_LIMIT, days: none };
  }

  const { data, fetchedAt, source } = await cachedForecast(key);
  // rainLimit goes to the browser, so the rain-warning rule lives in one place (utils/weather.js).
  return { place: key, source, fetchedAt, timezone: data.timezone, forecastDays: FORECAST_DAYS, rainLimit: RAIN_LIMIT, days: weatherForDays(days, data.daily) };
}
