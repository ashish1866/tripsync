import { HttpError } from '../utils/httpError.js';

// Calls an outside API (Open-Meteo, Geoapify) and returns its JSON.
// If the service is slow or broken, the user gets a 502 that names only that
// service, so the rest of the page keeps working. The real problem is logged.
export async function fetchJson(url, { service, timeoutMs = 8000 }) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
  } catch (err) {
    console.error(`[${service}] request failed: ${err.message}`);
    throw new HttpError(502, `${service} is not answering right now. Try again in a minute.`);
  }
  if (!res.ok) {
    // Log the status but never the URL: Geoapify URLs carry the API key.
    console.error(`[${service}] answered HTTP ${res.status}`);
    throw new HttpError(502, `${service} could not answer this time. Try again in a minute.`);
  }
  return res.json();
}
