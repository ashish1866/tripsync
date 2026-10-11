import { HttpError } from '../utils/httpError.js';

// Calls an outside API (Open-Meteo, Geoapify) and returns its JSON.
//
// - It says who is asking (a User-Agent), the way public APIs ask their callers to.
// - One retry, after a short pause, if the service answered 429 (too many requests,
//   which a shared server address can trigger) or a 5xx, or did not answer at all.
// - If it still fails, the user gets a 503 that names only that service and, when the
//   service replied, the status it replied with. The rest of the page keeps working.
//   (A 502 or 504 from our API is replaced by Cloudflare's own error page on its way
//   through the Worker, so those two are not used.)
// - The real problem is logged. The URL is never logged or sent: Geoapify URLs carry the API key.
const USER_AGENT = 'TripSync/1.0 (college project; https://tripsync.ashishbisht.workers.dev)';
const RETRY_PAUSE_MS = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const worthRetrying = (status) => status === 429 || status >= 500;

export async function fetchJson(url, { service, timeoutMs = 8000, retries = 1, retryPauseMs = RETRY_PAUSE_MS }) {
  let failure = { kind: 'network' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(retryPauseMs);
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    } catch (err) {
      console.error(`[${service}] request failed (try ${attempt + 1}): ${err.message}`);
      failure = { kind: 'network' };
      continue;
    }
    if (res.ok) return res.json();

    // The service's own reason helps when diagnosing, but never anything that could hold a key.
    const reason = (await res.text().catch(() => '')).replace(/apikey=[^&"\s]+/gi, 'apikey=***').slice(0, 160);
    console.error(`[${service}] answered HTTP ${res.status} (try ${attempt + 1}): ${reason}`);
    failure = { kind: 'status', status: res.status };
    if (!worthRetrying(res.status)) break;
  }

  if (failure.kind === 'status') {
    throw new HttpError(503, `${service} could not answer this time (it replied HTTP ${failure.status}). Try again in a minute.`);
  }
  throw new HttpError(503, `${service} is not answering right now. Try again in a minute.`);
}
