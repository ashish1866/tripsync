// VISUAL CROSSING FORECAST -> THE SHAPE OPEN-METEO USES. Pure: no network, no database.
//
// Visual Crossing's Timeline API (unitGroup=metric, include=days, iconSet=icons2) gives one
// record per local day: { datetime: '2026-10-12', tempmax, tempmin, precipprob (0-100), icon }.
// It is folded into Open-Meteo's daily shape ({ time, temperature_2m_max, temperature_2m_min,
// precipitation_probability_max, weather_code }) so the rest of TripSync (stones, symbols,
// rain warning) needs no change.

// Visual Crossing icon (icons2 set, its own list) -> WMO weather code (the numbers utils/weather.js names).
// Day and night versions are the same weather. An icon not in this list gives null, which the
// screen shows as "No description for this forecast", never a guess.
const ICONS = {
  snow: 73,
  'snow-showers-day': 85,
  'snow-showers-night': 85,
  'thunder-rain': 95,
  'thunder-showers-day': 95,
  'thunder-showers-night': 95,
  rain: 63,
  'showers-day': 80,
  'showers-night': 80,
  fog: 45,
  cloudy: 3,
  'partly-cloudy-day': 2,
  'partly-cloudy-night': 2,
  'clear-day': 0,
  'clear-night': 0,
  // "wind" has no WMO weather code (wind is not a sky condition), so it is left out on purpose.
};

export function vcIconToWmo(icon) {
  return Object.hasOwn(ICONS, icon) ? ICONS[icon] : null;
}

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// days: Visual Crossing's days[] array.
export function dailyFromVisualCrossing(days) {
  const daily = { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], weather_code: [] };
  const rows = (Array.isArray(days) ? days : []).filter((d) => isDate(d?.datetime)).sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
  for (const d of rows) {
    if (daily.time.includes(d.datetime)) continue; // one line per date
    daily.time.push(d.datetime);
    daily.temperature_2m_max.push(num(d.tempmax));
    daily.temperature_2m_min.push(num(d.tempmin));
    daily.precipitation_probability_max.push(num(d.precipprob));
    daily.weather_code.push(vcIconToWmo(d.icon));
  }
  return daily;
}
