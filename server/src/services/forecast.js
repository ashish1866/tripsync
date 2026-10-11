import { getConfig } from '../config/env.js';
import { fetchJson } from './outside.js';
import { HttpError } from '../utils/httpError.js';
import { dailyFromThreeHourly, utcLabel } from '../utils/openweather.js';
import { dailyFromVisualCrossing } from '../utils/visualcrossing.js';

// WHERE THE FORECAST COMES FROM.
//
//   auto (normal):     Open-Meteo (16 days, no key). If it refuses (for example its daily
//                      limit on Render's shared address), the backups in order, each only if
//                      its key is set: Visual Crossing (15 days), then OpenWeather (5 days).
//                      The screen says which one answered and why.
//   open-meteo:        Open-Meteo only, no backup.
//   visualcrossing:    Visual Crossing only (to test that backup on purpose).
//   openweather:       OpenWeather only (to test that backup on purpose).
// Set with WEATHER_PROVIDER. Keys: VISUALCROSSING_KEY, OPENWEATHER_KEY. They live only in
// server/.dev.vars and on Render, never in the repo or the browser.
//
// Every provider answers in the same shape: { provider, timezone, daily }, where daily is
// Open-Meteo's daily shape, so nothing after this point cares which one it was.
export const DAYS = { 'open-meteo': 16, visualcrossing: 15, openweather: 5 };

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code';
const VISUAL_CROSSING = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';
const OPENWEATHER = 'https://api.openweathermap.org/data/2.5/forecast';

export async function askOpenMeteo(lat, lng) {
  const params = new URLSearchParams({ latitude: lat, longitude: lng, daily: OPEN_METEO_DAILY, timezone: 'auto', forecast_days: String(DAYS['open-meteo']) });
  const answer = await fetchJson(`${OPEN_METEO}?${params}`, { service: 'The weather service', showReason: true });
  return { provider: 'open-meteo', timezone: answer.timezone ?? null, daily: answer.daily ?? null };
}

export async function askVisualCrossing(lat, lng, apiKey) {
  // One forecast for one place costs one "record" (1,000 free a day, counted per key).
  // Only the fields TripSync shows are asked for. The key is in the address, which fetchJson
  // never logs or shows; Visual Crossing's error text ("Invalid API key") is never shown either.
  const params = new URLSearchParams({ unitGroup: 'metric', include: 'days', iconSet: 'icons2', elements: 'datetime,tempmax,tempmin,precipprob,icon', contentType: 'json', key: apiKey });
  const answer = await fetchJson(`${VISUAL_CROSSING}/${encodeURIComponent(`${lat},${lng}`)}?${params}`, { service: 'The backup weather service' });
  return { provider: 'visualcrossing', timezone: answer.timezone ?? null, daily: dailyFromVisualCrossing(answer.days) };
}

export async function askOpenWeather(lat, lng, apiKey) {
  // units=metric: degrees Celsius, like Open-Meteo.
  const params = new URLSearchParams({ lat, lon: lng, units: 'metric', appid: apiKey });
  const answer = await fetchJson(`${OPENWEATHER}?${params}`, { service: 'The backup weather service' });
  const shift = Number(answer.city?.timezone ?? 0);
  return { provider: 'openweather', timezone: utcLabel(shift), daily: dailyFromThreeHourly(answer.list, shift) };
}

// { provider, timezone, daily, fellBack }. fellBack is true when Open-Meteo failed and a backup answered.
// `deps` lets the tests stand in for the services and the settings.
export async function fetchForecast(lat, lng, deps = {}) {
  const config = deps.config ?? getConfig();
  const ask = {
    'open-meteo': deps.askOpenMeteo ?? askOpenMeteo,
    visualcrossing: deps.askVisualCrossing ?? askVisualCrossing,
    openweather: deps.askOpenWeather ?? askOpenWeather,
  };
  const keyOf = { visualcrossing: config.VISUALCROSSING_KEY, openweather: config.OPENWEATHER_KEY };
  const mode = config.WEATHER_PROVIDER;

  // Forcing one backup, for testing.
  if (mode === 'visualcrossing' || mode === 'openweather') {
    if (!keyOf[mode]) throw new HttpError(503, 'The backup weather service is not set up on this server yet.');
    return { ...(await ask[mode](lat, lng, keyOf[mode])), fellBack: false };
  }

  let mainError;
  try {
    return { ...(await ask['open-meteo'](lat, lng)), fellBack: false };
  } catch (err) {
    // A bug in our own code is never hidden by a backup: only a service's refusal falls back.
    if (mode === 'open-meteo' || !(err instanceof HttpError)) throw err;
    mainError = err;
  }

  for (const provider of ['visualcrossing', 'openweather']) {
    if (!keyOf[provider]) continue;
    console.error(`[weather] ${mainError.message} - trying ${provider}`);
    try {
      return { ...(await ask[provider](lat, lng, keyOf[provider])), fellBack: true };
    } catch (backupErr) {
      // The person is told about the main service; a backup's problem goes to the log.
      console.error(`[weather] ${provider} also failed: ${backupErr.message}`);
    }
  }
  throw mainError;
}
