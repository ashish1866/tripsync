// OPENWEATHER FORECAST -> THE SHAPE OPEN-METEO USES. Pure: no network, no database.
//
// OpenWeather's free "5 day / 3 hour" forecast gives 40 readings, one every three hours:
//   { dt (unix seconds, UTC), main: { temp, temp_min, temp_max }, weather: [{ id }], pop (0 to 1) }
// TripSync shows one line per day, so the readings of each local day are folded into:
//   { time: ['2026-10-12', ...], temperature_2m_max, temperature_2m_min,
//     precipitation_probability_max, weather_code }          (the daily shape Open-Meteo returns)
// which means the rest of the app (day stones, rain warning, labels, symbols) needs no change.

// A day needs at least this many of its eight readings (12 hours) before its high and low mean anything.
// Today (only the hours left) and the last day (only its first hours) are often partial.
export const MIN_READINGS = 4;

// OpenWeather condition id -> WMO weather code (the numbers utils/weather.js names).
// A condition with no honest WMO equivalent (smoke, dust, ash, tornado...) gives null,
// which the screen shows as "No description for this forecast", never a guess.
export function toWmo(id) {
  if (id >= 200 && id <= 232) return 95; // thunderstorm
  if (id === 300 || id === 310) return 51; // light drizzle
  if (id === 301 || id === 311 || id === 313 || id === 321) return 53;
  if (id === 302 || id === 312 || id === 314) return 55; // heavy drizzle
  if (id === 500) return 61;
  if (id === 501) return 63;
  if (id >= 502 && id <= 504) return 65; // heavy rain
  if (id === 511) return 66; // freezing rain
  if (id === 520) return 80;
  if (id === 521) return 81;
  if (id === 522 || id === 531) return 82;
  if (id === 600) return 71;
  if (id === 601) return 73;
  if (id === 602) return 75;
  if (id >= 611 && id <= 616) return 68; // sleet, rain and snow mixed
  if (id === 620) return 85;
  if (id === 621 || id === 622) return 86;
  if (id === 701 || id === 741) return 45; // mist, fog
  if (id === 800) return 0;
  if (id === 801) return 1;
  if (id === 802) return 2;
  if (id === 803 || id === 804) return 3;
  return null;
}

// How much a condition matters for the day's one symbol: a day with a thunderstorm
// is a thunderstorm day, whatever the other readings say (Open-Meteo's daily code works the same way).
export function significance(id) {
  if (id >= 200 && id < 300) return 1000 + id;
  if (id >= 600 && id < 700) return 800 + id;
  if (id >= 500 && id < 600) return 600 + id;
  if (id >= 300 && id < 400) return 400 + id;
  if (id === 701 || id === 741) return 300;
  if (id >= 801 && id <= 804) return 100 + (id - 800); // few clouds ... overcast: below fog, above clear
  if (id === 800) return 50;
  return 0;
}

// 19800 -> "UTC+05:30", -18000 -> "UTC-05:00", 0 -> "UTC+00:00"
export function utcLabel(seconds) {
  const s = Number.isFinite(seconds) ? seconds : 0;
  const sign = s < 0 ? '-' : '+';
  const minutes = Math.round(Math.abs(s) / 60);
  return `UTC${sign}${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

const localDate = (unixSeconds, tzSeconds) => new Date((unixSeconds + tzSeconds) * 1000).toISOString().slice(0, 10);

// list: OpenWeather's 3-hourly readings; tzSeconds: the place's shift from UTC (city.timezone).
export function dailyFromThreeHourly(list, tzSeconds = 0) {
  const byDay = new Map();
  for (const reading of Array.isArray(list) ? list : []) {
    if (!Number.isFinite(reading?.dt)) continue;
    const date = localDate(reading.dt, tzSeconds);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(reading);
  }

  const daily = { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], weather_code: [] };
  for (const date of [...byDay.keys()].sort()) {
    const readings = byDay.get(date);
    if (readings.length < MIN_READINGS) continue;
    const highs = readings.map((r) => r.main?.temp_max ?? r.main?.temp).filter(Number.isFinite);
    const lows = readings.map((r) => r.main?.temp_min ?? r.main?.temp).filter(Number.isFinite);
    const pops = readings.map((r) => r.pop).filter(Number.isFinite);
    const conditions = readings.map((r) => r.weather?.[0]?.id).filter(Number.isFinite);
    const main = conditions.reduce((best, id) => (best === undefined || significance(id) > significance(best) ? id : best), undefined);

    daily.time.push(date);
    daily.temperature_2m_max.push(highs.length ? Math.max(...highs) : null);
    daily.temperature_2m_min.push(lows.length ? Math.min(...lows) : null);
    daily.precipitation_probability_max.push(pops.length ? Math.max(...pops) * 100 : null);
    daily.weather_code.push(main === undefined ? null : toWmo(main));
  }
  return daily;
}
