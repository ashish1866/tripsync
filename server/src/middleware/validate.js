import { HttpError } from '../utils/httpError.js';

// Checks the request body against a zod schema before the route runs.
// Bad input stops here with 400 and the first problem in plain words.
// On success, req.body is replaced by the cleaned value (for example trimmed text),
// and any field the schema does not know about has already been refused.
export function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'Send the details as a JSON object.');
    }
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new HttpError(400, result.error.issues[0].message);
    }
    req.body = result.data;
    next();
  };
}
