import { HttpError } from '../utils/httpError.js';

// Any /api path that no router handled.
export function notFound(req, res) {
  res.status(404).json({ error: `There is no API route for ${req.method} ${req.originalUrl}.` });
}

// The last middleware. Every error in the app ends up here.
// Known errors (HttpError) keep their status and message.
// Unknown errors are logged in full on the server, but the user only gets a
// generic message, so database details or stack traces never leak out.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request body is too large.' });
  }

  console.error(`[500] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'The TripSync server could not finish this request. Please try again in a minute.' });
}
