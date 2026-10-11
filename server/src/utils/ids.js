import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';

// MongoDB id from a URL part, or null if it is not a valid id.
export function toObjectId(text) {
  return typeof text === 'string' && /^[a-f0-9]{24}$/i.test(text) ? new ObjectId(text) : null;
}

// Short random id for an item inside a trip (an activity or a checklist item).
export function newItemId() {
  return randomBytes(8).toString('hex');
}
