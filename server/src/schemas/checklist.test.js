import { describe, it, expect } from 'vitest';
import { itemParams, newItemBody, tickBody } from './checklist.js';

const problem = (schema, value) => {
  const r = schema.safeParse(value);
  return r.success ? null : r.error.issues[0].message;
};

describe('packing list input', () => {
  it('trims the text of a new item', () => {
    expect(newItemBody.parse({ text: '  Warm jacket  ' })).toEqual({ text: 'Warm jacket' });
  });

  it('refuses empty, too long, wrongly typed and unknown fields', () => {
    expect(problem(newItemBody, { text: '   ' })).toMatch(/Write what to pack/);
    expect(problem(newItemBody, { text: 'x'.repeat(81) })).toMatch(/under 80 characters/);
    expect(problem(newItemBody, { text: { $gt: '' } })).toMatch(/Write what to pack/);
    expect(problem(newItemBody, {})).toMatch(/Write what to pack/);
    expect(problem(newItemBody, { text: 'Torch', done: true })).not.toBeNull();
  });

  it('a tick must say which state it wants, as a real true or false', () => {
    expect(tickBody.parse({ done: true })).toEqual({ done: true });
    expect(tickBody.parse({ done: false })).toEqual({ done: false });
    expect(problem(tickBody, {})).toMatch(/true to mark it packed/);
    expect(problem(tickBody, { done: 'true' })).toMatch(/true to mark it packed/);
    expect(problem(tickBody, { done: true, text: 'Changed' })).not.toBeNull();
  });

  it('item ids from the address are checked', () => {
    expect(itemParams.parse({ id: 'abc', itemId: '0123456789abcdef' }).itemId).toBe('0123456789abcdef');
    expect(problem(itemParams, { id: 'abc', itemId: '../etc' })).toMatch(/does not exist/);
    expect(problem(itemParams, { id: 'abc', itemId: '' })).toMatch(/does not exist/);
  });
});
