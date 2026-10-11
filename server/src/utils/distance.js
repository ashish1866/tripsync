// DISTANCE and BEST ORDER: pure maths, no network and no database.
//
// Distances are STRAIGHT LINES over the earth's surface (the Haversine formula),
// not road distances. Mountain roads are longer, and the screens say so.
// Locations are [longitude, latitude], the way MongoDB stores them.

const EARTH_RADIUS_M = 6_371_000;
const rad = (degrees) => (degrees * Math.PI) / 180;

// Metres in a straight line between two [lng, lat] points.
export function haversine([lng1, lat1], [lng2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// NEAREST-FIRST ORDER for one day's stops.
//   stops: [{ id, location: [lng, lat] | null, ... }] in their current order
// Start at the first stop that has a place, then keep going to the nearest stop
// not yet visited. On a tie the stop that is earlier in the current order wins.
// A stop without a place cannot be measured, so it goes to the end, in its
// current order. The input is not changed; a new array comes back.
export function nearestFirst(stops) {
  const left = stops.filter((s) => s.location);
  const unplaced = stops.filter((s) => !s.location);
  const order = [];
  if (left.length) order.push(left.shift());
  while (left.length) {
    const here = order[order.length - 1].location;
    let best = 0;
    let bestDistance = Infinity;
    left.forEach((s, i) => {
      const d = haversine(here, s.location);
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    order.push(left.splice(best, 1)[0]);
  }
  return [...order, ...unplaced];
}

// For each stop in this order: metres from the stop with a place before it
// (null for the first one, and for stops without a place).
export function legs(stops) {
  let previous = null;
  return stops.map((s) => {
    if (!s.location) return null;
    const metres = previous ? Math.round(haversine(previous, s.location)) : null;
    previous = s.location;
    return metres;
  });
}

// Total straight-line metres through the stops that have a place, in this order.
export function routeLength(stops) {
  return legs(stops).reduce((sum, metres) => sum + (metres ?? 0), 0);
}
