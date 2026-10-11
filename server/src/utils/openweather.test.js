import { describe, it, expect } from 'vitest';
import { dailyFromThreeHourly, significance, toWmo, utcLabel } from './openweather.js';
import { describeCode, weatherForDays } from './weather.js';

const IST = 19800; // India, UTC+05:30

// One day's eight readings, every three hours from local midnight, built in UTC.
// local 00:00 IST on `date` = previous day 18:30 UTC.
const readingsFor = (date, { temps = [8, 7, 9, 13, 16, 15, 11, 9], pops = [0, 0, 0.1, 0.2, 0.5, 0.3, 0.1, 0], ids = [800, 800, 801, 802, 803, 803, 801, 800] } = {}) =>
  temps.map((temp, i) => ({
    dt: Date.parse(`${date}T00:00:00Z`) / 1000 - IST + i * 3 * 3600,
    main: { temp, temp_min: temp - 1, temp_max: temp + 1 },
    weather: [{ id: ids[i] }],
    pop: pops[i],
  }));

describe('OpenWeather conditions as weather codes', () => {
  it('maps the common conditions to the WMO codes the screens already name', () => {
    expect(toWmo(800)).toBe(0); // clear
    expect(toWmo(801)).toBe(1);
    expect(toWmo(802)).toBe(2);
    expect(toWmo(804)).toBe(3); // overcast
    expect(toWmo(500)).toBe(61); // light rain
    expect(toWmo(502)).toBe(65); // heavy rain
    expect(toWmo(601)).toBe(73); // snow
    expect(toWmo(211)).toBe(95); // thunderstorm
    expect(toWmo(741)).toBe(45); // fog
  });

  it('every code it can give has a name and a symbol on the screen', () => {
    for (let id = 200; id <= 804; id++) {
      const code = toWmo(id);
      if (code !== null) expect(describeCode(code).kind, `OpenWeather ${id} -> ${code}`).not.toBe('unknown');
    }
  });

  it('admits a condition it has no honest match for, instead of guessing', () => {
    expect(toWmo(781)).toBeNull(); // tornado
    expect(toWmo(762)).toBeNull(); // volcanic ash
    expect(describeCode(null).label).toBe('No description for this forecast');
  });

  it('a stormy or snowy reading outweighs clear ones when picking the day\'s symbol', () => {
    expect(significance(211)).toBeGreaterThan(significance(502));
    expect(significance(502)).toBeGreaterThan(significance(701));
    expect(significance(701)).toBeGreaterThan(significance(804));
    expect(significance(804)).toBeGreaterThan(significance(800));
  });
});

describe('three-hourly readings folded into days', () => {
  it('one line per local day: highest high, lowest low, highest rain chance as a percentage', () => {
    const daily = dailyFromThreeHourly(readingsFor('2026-10-13'), IST);
    expect(daily.time).toEqual(['2026-10-13']);
    expect(daily.temperature_2m_max).toEqual([17]); // 16 + 1
    expect(daily.temperature_2m_min).toEqual([6]); // 7 - 1
    expect(daily.precipitation_probability_max).toEqual([50]);
    expect(daily.weather_code).toEqual([3]); // overcast is the most significant of clear/few/scattered/overcast
  });

  it('days are cut at the PLACE\'s midnight, not at UTC midnight', () => {
    // The 14th starts warm: its first two readings (00:00 and 03:00 India time) are 40 degrees.
    // In UTC those two readings fall on the 13th (18:30 and 21:30), so cutting at UTC midnight
    // would wrongly give the 13th a 41 degree high.
    const warmStart = readingsFor('2026-10-14', { temps: [40, 40, 9, 13, 16, 15, 11, 9] });
    const list = [...readingsFor('2026-10-13'), ...warmStart];
    const right = dailyFromThreeHourly(list, IST);
    expect(right.time).toEqual(['2026-10-13', '2026-10-14']);
    expect(right.temperature_2m_max).toEqual([17, 41]);
    const wrong = dailyFromThreeHourly(list, 0); // what ignoring the time zone would do
    expect(wrong.temperature_2m_max[0]).toBe(41);
  });

  it('leaves out a day with fewer than four readings (a half day has no honest high or low)', () => {
    const partial = readingsFor('2026-10-12').slice(5); // only the last three readings of the day
    const daily = dailyFromThreeHourly([...partial, ...readingsFor('2026-10-13')], IST);
    expect(daily.time).toEqual(['2026-10-13']);
  });

  it('the most severe reading names the day', () => {
    const stormy = readingsFor('2026-10-13', { ids: [800, 800, 801, 211, 500, 500, 801, 800] });
    expect(dailyFromThreeHourly(stormy, IST).weather_code).toEqual([95]);
  });

  it('copes with nothing, rubbish and missing fields', () => {
    expect(dailyFromThreeHourly([], IST).time).toEqual([]);
    expect(dailyFromThreeHourly(undefined, IST).time).toEqual([]);
    expect(dailyFromThreeHourly([{ nope: 1 }, null], IST).time).toEqual([]);
    const bare = readingsFor('2026-10-13').map((r) => ({ dt: r.dt })); // no temperatures, no rain chance, no condition
    const daily = dailyFromThreeHourly(bare, IST);
    expect(daily.temperature_2m_max).toEqual([null]);
    expect(daily.precipitation_probability_max).toEqual([null]);
    expect(daily.weather_code).toEqual([null]);
  });

  it('fits the trip-day code unchanged: the same days, rounded, with "later" beyond what it covers', () => {
    const daily = dailyFromThreeHourly([...readingsFor('2026-10-13'), ...readingsFor('2026-10-14')], IST);
    const out = weatherForDays(
      [
        { dayNumber: 1, date: '2026-10-13' },
        { dayNumber: 2, date: '2026-10-14' },
        { dayNumber: 3, date: '2026-10-15' },
      ],
      daily,
    );
    expect(out[0]).toMatchObject({ status: 'forecast', max: 17, min: 6, rainChance: 50, label: 'Overcast', kind: 'cloud' });
    expect(out[2]).toEqual({ dayNumber: 3, date: '2026-10-15', status: 'later' });
  });
});

describe('time zone label', () => {
  it('writes the shift from UTC', () => {
    expect(utcLabel(19800)).toBe('UTC+05:30');
    expect(utcLabel(-18000)).toBe('UTC-05:00');
    expect(utcLabel(0)).toBe('UTC+00:00');
    expect(utcLabel(undefined)).toBe('UTC+00:00');
  });
});
