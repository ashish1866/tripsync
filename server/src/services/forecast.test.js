import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchForecast } from './forecast.js';
import { HttpError } from '../utils/httpError.js';

const meteoAnswer = { provider: 'open-meteo', timezone: 'Asia/Kolkata', daily: { time: ['2026-10-13'] } };
const owmAnswer = { provider: 'openweather', timezone: 'UTC+05:30', daily: { time: ['2026-10-13'] } };
const refusal = () => new HttpError(503, 'The weather service could not answer this time. It replied HTTP 429: Daily API request limit exceeded. Please try again tomorrow.');

const settings = (extra = {}) => ({ config: { WEATHER_PROVIDER: 'auto', OPENWEATHER_KEY: 'test-key-not-real', ...extra } });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('which forecast is used', () => {
  it('uses Open-Meteo when it answers, and never touches OpenWeather', async () => {
    const owm = vi.fn();
    const out = await fetchForecast('32.26', '77.17', { ...settings(), askOpenMeteo: async () => meteoAnswer, askOpenWeather: owm });
    expect(out).toEqual({ ...meteoAnswer, fellBack: false });
    expect(owm).not.toHaveBeenCalled();
  });

  it('falls back to OpenWeather when Open-Meteo refuses, and says it did', async () => {
    const owm = vi.fn().mockResolvedValue(owmAnswer);
    const out = await fetchForecast('32.26', '77.17', { ...settings(), askOpenMeteo: async () => Promise.reject(refusal()), askOpenWeather: owm });
    expect(out).toEqual({ ...owmAnswer, fellBack: true });
    expect(owm).toHaveBeenCalledWith('32.26', '77.17', 'test-key-not-real');
  });

  it('without a key there is no fallback: the person is told what Open-Meteo said', async () => {
    const owm = vi.fn();
    await expect(
      fetchForecast('32.26', '77.17', { ...settings({ OPENWEATHER_KEY: '' }), askOpenMeteo: async () => Promise.reject(refusal()), askOpenWeather: owm }),
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining('Daily API request limit exceeded') });
    expect(owm).not.toHaveBeenCalled();
  });

  it('when both fail, the person is told about the main service and the backup\'s failure only goes to the log', async () => {
    const backupDown = new HttpError(503, 'The backup weather service could not answer this time (it replied HTTP 401). Try again in a minute.');
    await expect(
      fetchForecast('32.26', '77.17', { ...settings(), askOpenMeteo: async () => Promise.reject(refusal()), askOpenWeather: async () => Promise.reject(backupDown) }),
    ).rejects.toMatchObject({ message: expect.stringContaining('Daily API request limit exceeded') });
    expect(console.error.mock.calls.flat().join(' ')).toContain('OpenWeather also failed');
  });

  it('a bug in our own code is not hidden by the backup', async () => {
    const owm = vi.fn();
    await expect(fetchForecast('32.26', '77.17', { ...settings(), askOpenMeteo: async () => Promise.reject(new TypeError('x is undefined')), askOpenWeather: owm })).rejects.toThrow(TypeError);
    expect(owm).not.toHaveBeenCalled();
  });
});

describe('forcing a provider (for testing)', () => {
  it('"openweather" uses only OpenWeather, even when Open-Meteo is fine, and is not marked as a fallback', async () => {
    const meteo = vi.fn();
    const out = await fetchForecast('32.26', '77.17', { ...settings({ WEATHER_PROVIDER: 'openweather' }), askOpenMeteo: meteo, askOpenWeather: async () => owmAnswer });
    expect(out).toEqual({ ...owmAnswer, fellBack: false });
    expect(meteo).not.toHaveBeenCalled();
  });

  it('"openweather" with no key says the backup is not set up', async () => {
    await expect(fetchForecast('32.26', '77.17', { ...settings({ WEATHER_PROVIDER: 'openweather', OPENWEATHER_KEY: '' }) })).rejects.toMatchObject({
      status: 503,
      message: 'The backup weather service is not set up on this server yet.',
    });
  });

  it('"open-meteo" never falls back, even with a key', async () => {
    const owm = vi.fn();
    await expect(
      fetchForecast('32.26', '77.17', { ...settings({ WEATHER_PROVIDER: 'open-meteo' }), askOpenMeteo: async () => Promise.reject(refusal()), askOpenWeather: owm }),
    ).rejects.toMatchObject({ status: 503 });
    expect(owm).not.toHaveBeenCalled();
  });
});
