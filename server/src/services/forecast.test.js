import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAYS, fetchForecast } from './forecast.js';
import { HttpError } from '../utils/httpError.js';

const meteoAnswer = { provider: 'open-meteo', timezone: 'Asia/Kolkata', daily: { time: ['2026-10-13'] } };
const vcAnswer = { provider: 'visualcrossing', timezone: 'Asia/Kolkata', daily: { time: ['2026-10-13'] } };
const owmAnswer = { provider: 'openweather', timezone: 'UTC+05:30', daily: { time: ['2026-10-13'] } };
const refusal = () => new HttpError(503, 'The weather service could not answer this time. It replied HTTP 429: Daily API request limit exceeded. Please try again tomorrow.');
const backupDown = () => new HttpError(503, 'The backup weather service could not answer this time (it replied HTTP 401). Try again in a minute.');

const settings = (extra = {}) => ({ config: { WEATHER_PROVIDER: 'auto', VISUALCROSSING_KEY: 'vc-test-key', OPENWEATHER_KEY: 'owm-test-key', ...extra } });
const refusing = () => Promise.reject(refusal());

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('forecast lengths', () => {
  it('Open-Meteo 16 days, Visual Crossing 15, OpenWeather 5', () => {
    expect(DAYS).toEqual({ 'open-meteo': 16, visualcrossing: 15, openweather: 5 });
  });
});

describe('which forecast is used', () => {
  it('uses Open-Meteo when it answers, and never touches a backup', async () => {
    const vc = vi.fn();
    const owm = vi.fn();
    const out = await fetchForecast('32.26', '77.17', { ...settings(), askOpenMeteo: async () => meteoAnswer, askVisualCrossing: vc, askOpenWeather: owm });
    expect(out).toEqual({ ...meteoAnswer, fellBack: false });
    expect(vc).not.toHaveBeenCalled();
    expect(owm).not.toHaveBeenCalled();
  });

  it('Open-Meteo refuses: Visual Crossing answers (first backup), and it says it fell back', async () => {
    const vc = vi.fn().mockResolvedValue(vcAnswer);
    const owm = vi.fn();
    const out = await fetchForecast('32.26', '77.17', { ...settings(), askOpenMeteo: refusing, askVisualCrossing: vc, askOpenWeather: owm });
    expect(out).toEqual({ ...vcAnswer, fellBack: true });
    expect(vc).toHaveBeenCalledWith('32.26', '77.17', 'vc-test-key');
    expect(owm).not.toHaveBeenCalled();
  });

  it('Visual Crossing also fails: OpenWeather answers (second backup)', async () => {
    const out = await fetchForecast('32.26', '77.17', {
      ...settings(),
      askOpenMeteo: refusing,
      askVisualCrossing: async () => Promise.reject(backupDown()),
      askOpenWeather: async () => owmAnswer,
    });
    expect(out).toEqual({ ...owmAnswer, fellBack: true });
    expect(console.error.mock.calls.flat().join(' ')).toContain('visualcrossing also failed');
  });

  it('a backup with no key is skipped: with only an OpenWeather key, OpenWeather is the one asked', async () => {
    const vc = vi.fn();
    const out = await fetchForecast('32.26', '77.17', { ...settings({ VISUALCROSSING_KEY: '' }), askOpenMeteo: refusing, askVisualCrossing: vc, askOpenWeather: async () => owmAnswer });
    expect(out.provider).toBe('openweather');
    expect(vc).not.toHaveBeenCalled();
  });

  it('no backup keys: the person is told what Open-Meteo said', async () => {
    const vc = vi.fn();
    const owm = vi.fn();
    await expect(
      fetchForecast('32.26', '77.17', { ...settings({ VISUALCROSSING_KEY: '', OPENWEATHER_KEY: '' }), askOpenMeteo: refusing, askVisualCrossing: vc, askOpenWeather: owm }),
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining('Daily API request limit exceeded') });
    expect(vc).not.toHaveBeenCalled();
    expect(owm).not.toHaveBeenCalled();
  });

  it('everything fails: the person is told about the main service; the backups only reach the log', async () => {
    await expect(
      fetchForecast('32.26', '77.17', {
        ...settings(),
        askOpenMeteo: refusing,
        askVisualCrossing: async () => Promise.reject(backupDown()),
        askOpenWeather: async () => Promise.reject(backupDown()),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('Daily API request limit exceeded') });
    const log = console.error.mock.calls.flat().join(' ');
    expect(log).toContain('visualcrossing also failed');
    expect(log).toContain('openweather also failed');
  });

  it('a bug in our own code is not hidden by a backup', async () => {
    const vc = vi.fn();
    await expect(fetchForecast('32.26', '77.17', { ...settings(), askOpenMeteo: async () => Promise.reject(new TypeError('x is undefined')), askVisualCrossing: vc })).rejects.toThrow(TypeError);
    expect(vc).not.toHaveBeenCalled();
  });
});

describe('forcing a provider (for testing)', () => {
  it('"visualcrossing" uses only Visual Crossing, even when Open-Meteo is fine, and is not marked as a fallback', async () => {
    const meteo = vi.fn();
    const out = await fetchForecast('32.26', '77.17', { ...settings({ WEATHER_PROVIDER: 'visualcrossing' }), askOpenMeteo: meteo, askVisualCrossing: async () => vcAnswer });
    expect(out).toEqual({ ...vcAnswer, fellBack: false });
    expect(meteo).not.toHaveBeenCalled();
  });

  it('"openweather" uses only OpenWeather', async () => {
    const meteo = vi.fn();
    const out = await fetchForecast('32.26', '77.17', { ...settings({ WEATHER_PROVIDER: 'openweather' }), askOpenMeteo: meteo, askOpenWeather: async () => owmAnswer });
    expect(out).toEqual({ ...owmAnswer, fellBack: false });
    expect(meteo).not.toHaveBeenCalled();
  });

  it('forcing a backup that has no key says it is not set up', async () => {
    for (const mode of ['visualcrossing', 'openweather']) {
      await expect(fetchForecast('32.26', '77.17', { ...settings({ WEATHER_PROVIDER: mode, VISUALCROSSING_KEY: '', OPENWEATHER_KEY: '' }) })).rejects.toMatchObject({
        status: 503,
        message: 'The backup weather service is not set up on this server yet.',
      });
    }
  });

  it('"open-meteo" never falls back, even with keys', async () => {
    const vc = vi.fn();
    const owm = vi.fn();
    await expect(fetchForecast('32.26', '77.17', { ...settings({ WEATHER_PROVIDER: 'open-meteo' }), askOpenMeteo: refusing, askVisualCrossing: vc, askOpenWeather: owm })).rejects.toMatchObject({ status: 503 });
    expect(vc).not.toHaveBeenCalled();
    expect(owm).not.toHaveBeenCalled();
  });
});
