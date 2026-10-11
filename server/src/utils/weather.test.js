import { describe, it, expect } from 'vitest';
import { describeCode, needsRainWarning, weatherForDays } from './weather.js';

const daily = {
  time: ['2026-10-11', '2026-10-12', '2026-10-13'],
  temperature_2m_max: [14.6, 12.2, 9.9],
  temperature_2m_min: [3.4, 2.5, -1.2],
  precipitation_probability_max: [10, 85, null],
  weather_code: [1, 63, 71],
};

describe('weather on trip days', () => {
  it('puts each forecast day on the matching trip day, rounded', () => {
    const [d1, d2] = weatherForDays(
      [
        { dayNumber: 1, date: '2026-10-12' },
        { dayNumber: 2, date: '2026-10-13' },
      ],
      daily,
    );
    expect(d1).toEqual({ dayNumber: 1, date: '2026-10-12', status: 'forecast', max: 12, min: 3, rainChance: 85, code: 63, label: 'Rain', kind: 'rain' });
    expect(d2).toMatchObject({ status: 'forecast', min: -1, rainChance: null, label: 'Light snow', kind: 'snow' });
  });

  it('says "later" beyond the forecast and "past" before it, never inventing weather', () => {
    const out = weatherForDays(
      [
        { dayNumber: 1, date: '2026-10-10' },
        { dayNumber: 2, date: '2026-10-11' },
        { dayNumber: 3, date: '2026-10-14' },
      ],
      daily,
    );
    expect(out.map((d) => d.status)).toEqual(['past', 'forecast', 'later']);
    expect(out[2]).not.toHaveProperty('max');
  });

  it('with no forecast at all, every day is "later"', () => {
    expect(weatherForDays([{ dayNumber: 1, date: '2027-01-01' }], null)).toEqual([{ dayNumber: 1, date: '2027-01-01', status: 'later' }]);
  });

  it('names known weather codes and admits unknown ones', () => {
    expect(describeCode(95)).toEqual({ label: 'Thunderstorm', kind: 'storm' });
    expect(describeCode(42)).toEqual({ label: 'No description for this forecast', kind: 'unknown' });
  });
});

describe('rain warning', () => {
  const day = (rainChance) => ({ status: 'forecast', rainChance });
  it('warns only above 60% on a day with stops', () => {
    expect(needsRainWarning(day(61), 1)).toBe(true);
    expect(needsRainWarning(day(60), 3)).toBe(false);
    expect(needsRainWarning(day(90), 0)).toBe(false);
    expect(needsRainWarning(day(null), 2)).toBe(false);
    expect(needsRainWarning({ status: 'later' }, 2)).toBe(false);
  });
});
