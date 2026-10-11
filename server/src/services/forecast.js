import { getConfig } from '../config/env.js';
import { fetchJson } from './outside.js';
import { HttpError } from '../utils/httpError.js';
import { dailyFromThreeHourly, utcLabel } from '../utils/openweather.js';

// WHERE THE FORECAST COMES FROM.
//
//   auto (normal):   ask Open-Meteo (16 days, no key). If it refuses (for example its
//                    daily limit on Render's shared address), and an OpenWeather key is set,
//                    ask OpenWeather's free 5-day forecast instead and say so on screen.
//   open-meteo:      Open-Meteo only (never OpenWeather).
//   openweather:     OpenWeather only (for testing the backup on purpose).
// Set with WEATHER_PROVIDER; the key is OPENWEATHER_KEY. Both live only in server/.dev.vars
// and on Render, never in the repo.
//
// Every provider answers in the same shape: { provider, timezone, daily }, where daily is
// Open-Meteo's daily shape, so nothing after this point cares which one it was.
export const OPEN_METEO_DAYS = 16;
export const OPENWEATHER_DAYS = 5;

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code';
const OPENWEATHER = 'https://api.openweathermap.org/data/2.5/forecast';

export async function askOpenMeteo(lat, lng) {
  const params = new URLSearchParams({ latitude: lat, longitude: lng, daily: OPEN_METEO_DAILY, timezone: 'auto', forecast_days: String(OPEN_METEO_DAYS) });
  const answer = await fetchJson(`${OPEN_METEO}?${params}`, { service: 'The weather service', showReason: true });
  return { provider: 'open-meteo', timezone: answer.timezone ?? null, daily: answer.daily ?? null };
}

export async function askOpenWeather(lat, lng, apiKey) {
  // units=metric: degrees Celsius, like Open-Meteo. The key is in the address, which fetchJson never logs or shows.
  const params = new URLSearchParams({ lat, lon: lng, units: 'metric', appid: apiKey });
  const answer = await fetchJson(`${OPENWEATHER}?${params}`, { service: 'The backup weather service' });
  const shift = Number(answer.city?.timezone ?? 0);
  return { provider: 'openweather', timezone: utcLabel(shift), daily: dailyFromThreeHourly(answer.list, shift) };
}

// { provider, timezone, daily, fellBack }. fellBack is true only when Open-Meteo failed and OpenWeather answered.
// `deps` lets the tests stand in for the two services and the settings.
export async function fetchForecast(lat, lng, deps = {}) {
  const config = deps.config ?? getConfig();
  const meteo = deps.askOpenMeteo ?? askOpenMeteo;
  const owm = deps.askOpenWeather ?? askOpenWeather;
  const mode = config.WEATHER_PROVIDER;

  if (mode === 'openweather') {
    if (!config.OPENWEATHER_KEY) throw new HttpError(503, 'The backup weather service is not set up on this server yet.');
    return { ...(await owm(lat, lng, config.OPENWEATHER_KEY)), fellBack: false };
  }

  try {
    return { ...(await meteo(lat, lng)), fellBack: false };
  } catch (err) {
    if (mode === 'open-meteo' || !config.OPENWEATHER_KEY || !(err instanceof HttpError)) throw err;
    console.error(`[weather] Open-Meteo failed (${err.message}) - trying OpenWeather`);
    try {
      return { ...(await owm(lat, lng, config.OPENWEATHER_KEY)), fellBack: true };
    } catch (backupErr) {
      // Both failed: the person is told about the main service, the backup's problem goes to the log.
      console.error(`[weather] OpenWeather also failed: ${backupErr.message}`);
      throw err;
    }
  }
}
