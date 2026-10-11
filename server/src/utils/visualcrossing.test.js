import { describe, it, expect } from 'vitest';
import { dailyFromVisualCrossing, vcIconToWmo } from './visualcrossing.js';
import { describeCode, weatherForDays } from './weather.js';

// The shape of a real answer for Manali (2026-10-12, unitGroup=metric, include=days).
const MANALI = [
  { datetime: '2026-10-12', tempmax: 6.6, tempmin: -0.4, precipprob: 100, icon: 'rain' },
  { datetime: '2026-10-13', tempmax: 5.7, tempmin: -0.3, precipprob: 100, icon: 'rain' },
  { datetime: '2026-10-14', tempmax: 5.8, tempmin: -0.7, precipprob: 97, icon: 'rain' },
  { datetime: '2026-10-15', tempmax: 3.3, tempmin: -2.2, precipprob: 100, icon: 'snow' },
  { datetime: '2026-10-16', tempmax: 9.1, tempmin: 1.2, precipprob: 4, icon: 'clear-day' },
];

// Every icon in Visual Crossing's icons2 set, as their documentation lists them.
const ICONS2 = [
  'snow', 'snow-showers-day', 'snow-showers-night', 'thunder-rain', 'thunder-showers-day', 'thunder-showers-night',
  'rain', 'showers-day', 'showers-night', 'fog', 'wind', 'cloudy', 'partly-cloudy-day', 'partly-cloudy-night', 'clear-day', 'clear-night',
];

describe('Visual Crossing icons as weather codes', () => {
  it('maps each kind of weather to a code the screens name and draw', () => {
    expect(describeCode(vcIconToWmo('clear-day'))).toEqual({ label: 'Clear sky', kind: 'clear' });
    expect(describeCode(vcIconToWmo('partly-cloudy-night')).kind).toBe('partly');
    expect(describeCode(vcIconToWmo('cloudy')).kind).toBe('cloud');
    expect(describeCode(vcIconToWmo('fog')).kind).toBe('fog');
    expect(describeCode(vcIconToWmo('rain')).kind).toBe('rain');
    expect(describeCode(vcIconToWmo('showers-day')).kind).toBe('rain');
    expect(describeCode(vcIconToWmo('snow')).kind).toBe('snow');
    expect(describeCode(vcIconToWmo('snow-showers-night')).kind).toBe('snow');
    expect(describeCode(vcIconToWmo('thunder-rain')).kind).toBe('storm');
  });

  it('day and night versions are the same weather', () => {
    expect(vcIconToWmo('clear-day')).toBe(vcIconToWmo('clear-night'));
    expect(vcIconToWmo('showers-day')).toBe(vcIconToWmo('showers-night'));
    expect(vcIconToWmo('thunder-showers-day')).toBe(vcIconToWmo('thunder-showers-night'));
  });

  it('every icon in the set either has a named code, or (wind) honestly has none', () => {
    for (const icon of ICONS2) {
      const code = vcIconToWmo(icon);
      if (icon === 'wind') expect(code).toBeNull();
      else expect(describeCode(code).kind, icon).not.toBe('unknown');
    }
  });

  it('an icon it does not know, or no icon at all, is admitted, not guessed', () => {
    expect(vcIconToWmo('hail-tornado')).toBeNull();
    expect(vcIconToWmo(undefined)).toBeNull();
    expect(vcIconToWmo('toString')).toBeNull(); // not tricked by built-in object names
    expect(describeCode(null).label).toBe('No description for this forecast');
  });
});

describe('Visual Crossing days in TripSync\'s daily shape', () => {
  it('keeps one line per date with its high, low, rain chance and code', () => {
    const daily = dailyFromVisualCrossing(MANALI);
    expect(daily.time).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
    expect(daily.temperature_2m_max[0]).toBe(6.6);
    expect(daily.temperature_2m_min[3]).toBe(-2.2);
    expect(daily.precipitation_probability_max).toEqual([100, 100, 97, 100, 4]);
    expect(daily.weather_code).toEqual([63, 63, 63, 73, 0]);
  });

  it('puts days in date order and drops repeats and rows without a real date', () => {
    const daily = dailyFromVisualCrossing([MANALI[2], MANALI[0], { ...MANALI[0], tempmax: 99 }, { datetime: 'tomorrow', tempmax: 1 }, null, MANALI[1]]);
    expect(daily.time).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(daily.temperature_2m_max[0]).toBe(6.6);
  });

  it('a missing value stays missing (null), never zero', () => {
    const daily = dailyFromVisualCrossing([{ datetime: '2026-10-12' }]);
    expect(daily.temperature_2m_max).toEqual([null]);
    expect(daily.precipitation_probability_max).toEqual([null]);
    expect(daily.weather_code).toEqual([null]);
    expect(dailyFromVisualCrossing(undefined).time).toEqual([]);
  });

  it('fits the trip-day code unchanged: rounded, rain warning ready, "later" beyond it', () => {
    const out = weatherForDays(
      [
        { dayNumber: 1, date: '2026-10-15' },
        { dayNumber: 2, date: '2026-10-16' },
        { dayNumber: 3, date: '2026-10-30' },
      ],
      dailyFromVisualCrossing(MANALI),
    );
    expect(out[0]).toMatchObject({ status: 'forecast', max: 3, min: -2, rainChance: 100, label: 'Snow', kind: 'snow' });
    expect(out[1]).toMatchObject({ status: 'forecast', max: 9, min: 1, rainChance: 4, kind: 'clear' });
    expect(out[2]).toEqual({ dayNumber: 3, date: '2026-10-30', status: 'later' });
  });
});
