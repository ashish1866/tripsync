import { describe, it, expect } from 'vitest';
import { haversine, legs, nearestFirst, routeLength } from './distance.js';

// [lng, lat], as stored
const MANALI = [77.1892, 32.2432];
const SOLANG = [77.1565572, 32.3160963];

// Stops on a west-to-east line at one latitude: bigger offset = further east.
const at = (id, offset) => ({ id, location: [77 + offset, 32] });
const ids = (list) => list.map((s) => s.id);

describe('haversine (straight-line distance)', () => {
  it('is zero between a point and itself, and the same both ways', () => {
    expect(haversine(MANALI, MANALI)).toBe(0);
    expect(haversine(MANALI, SOLANG)).toBeCloseTo(haversine(SOLANG, MANALI), 6);
  });

  it('one degree of latitude is about 111.2 km', () => {
    expect(haversine([77, 32], [77, 33])).toBeCloseTo(111_195, -2);
  });

  it('Manali to Solang is about 8.7 km in a straight line', () => {
    const km = haversine(MANALI, SOLANG) / 1000;
    expect(km).toBeGreaterThan(8.4);
    expect(km).toBeLessThan(9.0);
  });

  it('longitude shrinks with latitude: one degree east is shorter at 60 degrees north than on the equator', () => {
    expect(haversine([0, 60], [1, 60])).toBeLessThan(haversine([0, 0], [1, 0]) * 0.55);
  });
});

describe('nearest-first order', () => {
  it('starts at the first stop and always goes to the nearest one not yet visited', () => {
    // far(0.30), near(0.05), mid(0.15), start(0): from start -> near -> mid -> far
    const stops = [at('start', 0), at('far', 0.3), at('near', 0.05), at('mid', 0.15)];
    expect(ids(nearestFirst(stops))).toEqual(['start', 'near', 'mid', 'far']);
  });

  it('leaves an order that is already nearest-first alone', () => {
    const stops = [at('a', 0), at('b', 0.1), at('c', 0.2), at('d', 0.3)];
    expect(ids(nearestFirst(stops))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not always walk in one direction: it can double back to the nearest stop', () => {
    // From the middle stop, the nearest is the one 0.05 to the west, then it must cross over to the east.
    const stops = [at('mid', 0.1), at('east', 0.2), at('west', 0.05)];
    expect(ids(nearestFirst(stops))).toEqual(['mid', 'west', 'east']);
  });

  it('puts stops without a place at the end, in their own order, and starts at the first stop with a place', () => {
    const stops = [{ id: 'note1', location: null }, at('far', 0.3), { id: 'note2', location: null }, at('first', 0), at('near', 0.05)];
    expect(ids(nearestFirst(stops))).toEqual(['far', 'near', 'first', 'note1', 'note2']);
  });

  it('on a tie, the stop earlier in the current order goes first', () => {
    const stops = [at('start', 0), at('east', 0.1), { id: 'west', location: [76.9, 32] }];
    expect(ids(nearestFirst(stops))).toEqual(['start', 'east', 'west']);
  });

  it('copes with nothing, one stop, and stops that all lack a place', () => {
    expect(nearestFirst([])).toEqual([]);
    expect(ids(nearestFirst([at('only', 0)]))).toEqual(['only']);
    const unplaced = [{ id: 'x', location: null }, { id: 'y', location: null }];
    expect(ids(nearestFirst(unplaced))).toEqual(['x', 'y']);
  });

  it('does not change the list it was given', () => {
    const stops = [at('a', 0), at('c', 0.3), at('b', 0.1)];
    const before = ids(stops);
    nearestFirst(stops);
    expect(ids(stops)).toEqual(before);
  });

  it('never makes the route longer than the order it started with, on a line of stops', () => {
    const stops = [at('a', 0), at('d', 0.3), at('b', 0.1), at('c', 0.2)];
    expect(routeLength(nearestFirst(stops))).toBeLessThan(routeLength(stops));
  });
});

describe('legs and route length', () => {
  it('gives the metres from the stop before, null for the first stop and for stops without a place', () => {
    const stops = [at('a', 0), { id: 'note', location: null }, at('b', 0.1)];
    const l = legs(stops);
    expect(l[0]).toBeNull();
    expect(l[1]).toBeNull();
    expect(l[2]).toBe(Math.round(haversine([77, 32], [77.1, 32])));
  });

  it('adds up the legs through the stops that have a place', () => {
    const stops = [at('a', 0), at('b', 0.1), at('c', 0.3)];
    expect(routeLength(stops)).toBe(Math.round(haversine([77, 32], [77.1, 32])) + Math.round(haversine([77.1, 32], [77.3, 32])));
    expect(routeLength([])).toBe(0);
    expect(routeLength([at('only', 0)])).toBe(0);
  });
});
