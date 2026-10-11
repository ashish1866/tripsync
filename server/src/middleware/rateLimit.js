import { HttpError } from '../utils/httpError.js';

// RATE LIMITS, counted per Firebase user (req.user.uid, so after requireAuth).
//
// Each limit is a named bucket: at most `max` requests in any `windowMs`
// (a sliding window: we keep the times of recent requests and count them).
// Kept in this server's memory, which works because the API runs as one
// process on Render. Restarting the server clears the counts.
//
// Used on: joining with an invite code (stops guessing codes) and the routes
// that call outside services (Open-Meteo, Geoapify), so one account cannot
// use up TripSync's free quota.
const buckets = new Map(); // name -> Map(uid -> [timestamps])

export function rateLimit(name, { max, windowMs, message }) {
  if (!buckets.has(name)) buckets.set(name, new Map());
  const hits = buckets.get(name);

  return (req, res, next) => {
    const now = Date.now();
    const uid = req.user.uid;
    const recent = (hits.get(uid) || []).filter((t) => t > now - windowMs);
    if (recent.length >= max) {
      const waitS = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      hits.set(uid, recent);
      res.set('Retry-After', String(waitS));
      throw new HttpError(429, `${message} Try again in ${waitS < 90 ? `${waitS} seconds` : `${Math.ceil(waitS / 60)} minutes`}.`);
    }
    recent.push(now);
    hits.set(uid, recent);
    next();
  };
}

// Forget users with no recent requests, so memory does not grow forever.
const sweep = setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const hits of buckets.values()) {
    for (const [uid, times] of hits) if (times[times.length - 1] < cutoff) hits.delete(uid);
  }
}, 10 * 60 * 1000);
sweep.unref(); // never keeps the process (or a test run) alive on its own

export const LIMITS = {
  join: { max: 10, windowMs: 15 * 60 * 1000, message: 'Too many invite codes tried from this account.' },
  search: { max: 60, windowMs: 60 * 1000, message: 'Too many place searches in one minute.' },
  weather: { max: 30, windowMs: 60 * 1000, message: 'Too many weather requests in one minute.' },
  places: { max: 30, windowMs: 60 * 1000, message: 'Too many nearby-place searches in one minute.' },
};
