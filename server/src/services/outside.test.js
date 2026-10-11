import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './outside.js';

const reply = (status, body = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const fast = { service: 'The weather service', retryPauseMs: 0 };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('calling an outside service', () => {
  it('returns the JSON when the service answers, and says who is asking', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { daily: { time: ['2026-10-12'] } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchJson('https://example.test/forecast', fast)).toEqual({ daily: { time: ['2026-10-12'] } });
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/^TripSync\//);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tries once more after a 429, and uses the second answer', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(429, { reason: 'too many requests' })).mockResolvedValueOnce(reply(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchJson('https://example.test/a', fast)).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tries once more after a 5xx, and after a dropped connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(200, { ok: 2 })));
    expect(await fetchJson('https://example.test/a', fast)).toEqual({ ok: 2 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce(reply(200, { ok: 3 })));
    expect(await fetchJson('https://example.test/a', fast)).toEqual({ ok: 3 });
  });

  it('gives up after the retry with a 503 that names the service and the status it replied with', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(429, { reason: 'minutely limit' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.test/a', fast)).rejects.toMatchObject({
      status: 503,
      message: 'The weather service could not answer this time (it replied HTTP 429). Try again in a minute.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the service\'s own reason only when the caller says that service\'s text is public', async () => {
    const limited = () => reply(429, { error: true, reason: 'Hourly API request limit exceeded. Please try again in the next hour.' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => limited()));
    await expect(fetchJson('https://example.test/a', { ...fast, showReason: true })).rejects.toMatchObject({
      message: 'The weather service could not answer this time (it replied HTTP 429: Hourly API request limit exceeded. Please try again in the next hour.). Try again in a minute.',
    });
    // Off by default, so a service like Geoapify can never put its text in front of a user.
    await expect(fetchJson('https://example.test/a', fast)).rejects.toMatchObject({
      message: 'The weather service could not answer this time (it replied HTTP 429). Try again in a minute.',
    });
  });

  it('does not retry a plain refusal such as 401 or 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(401, { message: 'Invalid apiKey' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.test/a', fast)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('HTTP 401') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says "not answering" when the service never answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(fetchJson('https://example.test/a', fast)).rejects.toMatchObject({ status: 503, message: 'The weather service is not answering right now. Try again in a minute.' });
  });

  it('never puts the address or an API key in the error or the log', async () => {
    const secret = 'sk_live_123456';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, `Bad request for ?apiKey=${secret}&text=x`)));
    const error = await fetchJson(`https://example.test/search?apiKey=${secret}`, fast).catch((e) => e);
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain('example.test');
    const logged = console.error.mock.calls.flat().join(' ');
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('example.test');
  });
});
