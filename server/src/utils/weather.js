// WEATHER: pure helpers (no network, no database), so they can be unit tested.

// Open-Meteo sends WMO weather codes (numbers). We name them ourselves.
// `kind` picks the painted symbol in the browser.
const CODES = {
  0: ['Clear sky', 'clear'],
  1: ['Mostly clear', 'clear'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'],
  48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'rain'],
  53: ['Drizzle', 'rain'],
  55: ['Heavy drizzle', 'rain'],
  56: ['Freezing drizzle', 'rain'],
  57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'rain'],
  68: ['Rain and snow', 'snow'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Light showers', 'rain'],
  81: ['Showers', 'rain'],
  82: ['Heavy showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with hail', 'storm'],
  99: ['Thunderstorm with heavy hail', 'storm'],
};

// A code we have no name for is shown as exactly that, never guessed.
export function describeCode(code) {
  const known = CODES[code];
  if (known) return { label: known[0], kind: known[1] };
  return { label: 'No description for this forecast', kind: 'unknown' };
}

const roundOrNull = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);

// Puts Open-Meteo's daily forecast onto the trip's days.
//   days:  [{ dayNumber, date }]
//   daily: { time: ['2026-10-11', ...], temperature_2m_max, temperature_2m_min,
//            precipitation_probability_max, weather_code }   (or null: not asked)
// Each day comes back as one of:
//   { status: 'forecast', max, min, rainChance, code, label, kind }
//   { status: 'later' }  the forecast does not reach this day yet
//   { status: 'past' }   the day is before the forecast's first day (it is over)
export function weatherForDays(days, daily) {
  const times = Array.isArray(daily?.time) ? daily.time : [];
  const first = times[0];
  return days.map(({ dayNumber, date }) => {
    const i = times.indexOf(date);
    if (i === -1) return { dayNumber, date, status: first && date < first ? 'past' : 'later' };
    const code = daily.weather_code?.[i];
    return {
      dayNumber,
      date,
      status: 'forecast',
      max: roundOrNull(daily.temperature_2m_max?.[i]),
      min: roundOrNull(daily.temperature_2m_min?.[i]),
      rainChance: roundOrNull(daily.precipitation_probability_max?.[i]),
      code: typeof code === 'number' ? code : null,
      ...describeCode(code),
    };
  });
}

// Rain warning rule (product): a day with planned stops and a rain chance above 60%.
export const RAIN_LIMIT = 60;
export function needsRainWarning(dayWeather, stopCount) {
  return dayWeather?.status === 'forecast' && stopCount > 0 && dayWeather.rainChance !== null && dayWeather.rainChance > RAIN_LIMIT;
}
