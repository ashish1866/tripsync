import { getDb } from '../config/db.js';
import { getConfig } from '../config/env.js';
import { fetchForecast, OPEN_METEO_DAYS, OPENWEATHER_DAYS } from './forecast.js';
import { weatherKey } from '../utils/coords.js';
import { addDays, datesBetween } from '../utils/dates.js';
import { RAIN_LIMIT, weatherForDays } from '../utils/weather.js';

// WEATHER with a 3-hour cache (the weatherCache collection).
//
// 1. Round the destination to 2 decimals (about 1 km): trips to the same town share one entry.
// 2. A cached entry younger than 3 hours is used as it is. The age is checked here
//    in code too, because MongoDB's TTL clean-up runs only about once a minute.
// 3. Otherwise ask for a forecast (Open-Meteo for 16 days; OpenWeather's 5 days if Open-Meteo
//    refuses and a key is set, see forecast.js), store it, use it.
// A forecast that came from the OpenWeather backup is kept for only 15 minutes, so TripSync
// goes back to Open-Meteo's longer forecast as soon as it answers again.
// Days beyond what the provider reaches come back as "later", and a trip that starts beyond
// 16 days does not call anything at all.
export const CACHE_MS = 3 * 60 * 60 * 1000;
export const BACKUP_CACHE_MS = 15 * 60 * 1000;

const todayUtc = () => new Date().toISOString().slice(0, 10);

// How long this stored forecast stays usable.
const freshFor = (data) => (data?.fellBack ? BACKUP_CACHE_MS : CACHE_MS);

async function cachedForecast(key) {
  const db = await getDb();
  const cache = db.collection('weatherCache');
  const mode = getConfig().WEATHER_PROVIDER;
  const stored = await cache.findOne({ key });
  // A forced provider (testing) ignores what the other one stored.
  const usable = stored && (mode === 'auto' || mode === (stored.data?.provider ?? 'open-meteo')) && Date.now() - stored.createdAt.getTime() < freshFor(stored.data);
  if (usable) {
    console.log(`[weather] ${key}: from the cache (stored ${stored.createdAt.toISOString()})`);
    return { data: stored.data, fetchedAt: stored.createdAt, source: 'cache' };
  }

  const [lat, lng] = key.split(',');
  const answer = await fetchForecast(lat, lng);
  const data = { provider: answer.provider, fellBack: answer.fellBack, timezone: answer.timezone, daily: answer.daily };
  const now = new Date();
  await cache.updateOne({ key }, { $set: { data, createdAt: now } }, { upsert: true });
  console.log(`[weather] ${key}: asked ${answer.provider}${answer.fellBack ? ' (backup)' : ''}`);
  return { data, fetchedAt: now, source: answer.provider };
}

// The weather for each day of a trip ({ destination, startDate, endDate }):
// { place, source: 'cache' | 'open-meteo' | 'openweather' | 'none', provider, fellBack, fetchedAt, timezone, forecastDays, days }.
export async function weatherForTrip(trip) {
  const key = weatherKey(trip.destination.location);
  const days = datesBetween(trip.startDate, trip.endDate).map((date, i) => ({ dayNumber: i + 1, date }));
  const today = todayUtc();

  // Nothing to ask for: the whole trip is beyond the longest forecast, or already over.
  const lastDate = days[days.length - 1].date;
  if (days[0].date >= addDays(today, OPEN_METEO_DAYS) || lastDate < addDays(today, -1)) {
    const none = weatherForDays(days, null).map((d) => (d.date < today ? { ...d, status: 'past' } : d));
    return { place: key, source: 'none', provider: null, fellBack: false, fetchedAt: null, timezone: null, forecastDays: OPEN_METEO_DAYS, rainLimit: RAIN_LIMIT, days: none };
  }

  const { data, fetchedAt, source } = await cachedForecast(key);
  const provider = data.provider ?? 'open-meteo'; // entries stored before the backup existed are Open-Meteo's
  // rainLimit goes to the browser, so the rain-warning rule lives in one place (utils/weather.js).
  return {
    place: key,
    source,
    provider,
    fellBack: Boolean(data.fellBack),
    fetchedAt,
    timezone: data.timezone,
    forecastDays: provider === 'openweather' ? OPENWEATHER_DAYS : OPEN_METEO_DAYS,
    rainLimit: RAIN_LIMIT,
    days: weatherForDays(days, data.daily),
  };
}
