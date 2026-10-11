// Weather helpers for the browser. The forecast itself, and the rain limit,
// come from the API (server/src/utils/weather.js holds the tested rule).

// This day's forecast from the loaded weather state, or null (still loading, failed).
export function weatherOn(weather, date) {
  if (weather?.status !== 'ready') return null;
  return weather.data.days.find((d) => d.date === date) || null;
}

// Rain warning: a day with planned stops and a rain chance above the limit (60%).
export function rainWarning(dayWeather, stopCount, rainLimit) {
  return dayWeather?.status === 'forecast' && stopCount > 0 && dayWeather.rainChance !== null && dayWeather.rainChance > rainLimit;
}

// "12° / 3°" and, for screen readers, "Light rain, high 12 °C, low 3 °C"
export function tempsShort(d) {
  if (d.max === null || d.min === null) return 'No temperature given';
  return `${d.max}° / ${d.min}°`;
}

export function tempsSpoken(d) {
  const temps = d.max === null || d.min === null ? 'no temperature given' : `high ${d.max} °C, low ${d.min} °C`;
  return `${d.label}, ${temps}`;
}
