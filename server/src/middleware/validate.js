import { HttpError } from '../utils/httpError.js';

// The last check before the work (guard chain, step 4): is the input valid?
// Each helper checks one part of the request against a zod schema.
// Bad input stops here with 400 and the first problem in plain words.
// On success, the cleaned value (trimmed text, numbers) replaces the original,
// and fields the schema does not know about have already been refused.

export function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'Send the details as a JSON object.');
    }
    req.body = parse(schema, body);
    next();
  };
}

// Query strings (?q=...&page=2). Express 5 makes req.query read-only, so the
// cleaned values go on req.valid.query.
export function validateQuery(schema) {
  return (req, res, next) => {
    req.valid = { ...req.valid, query: parse(schema, { ...req.query }) };
    next();
  };
}

// URL parts (/days/:day). Cleaned values go on req.valid.params.
export function validateParams(schema) {
  return (req, res, next) => {
    req.valid = { ...req.valid, params: parse(schema, { ...req.params }) };
    next();
  };
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues[0].message);
  return result.data;
}
