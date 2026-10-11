// COORDINATES: the one place where their order is converted, on purpose.
//
//   MongoDB (and everything TripSync stores):  [longitude, latitude]
//   Leaflet in the browser:                    [latitude, longitude]   (see client/src/utils/coords.js)
//   Geoapify filters:                          "lon,lat" text
//
// Outside APIs give us separate lat and lng numbers; we turn them into our
// stored order here and nowhere else.

export function toStored(lat, lng) {
  return [Number(lng), Number(lat)];
}

export function latOf(location) {
  return location[1];
}

export function lngOf(location) {
  return location[0];
}

// "lon,lat" for Geoapify's filter and bias parameters.
export function toGeoapify(location) {
  return `${lngOf(location)},${latOf(location)}`;
}

// The weather cache key: rounded to 2 decimals (about 1 km), so trips to the
// same town share one cached forecast. Written "lat,lng" like a map reference.
export function weatherKey(location) {
  return `${latOf(location).toFixed(2)},${lngOf(location).toFixed(2)}`;
}

// A valid stored location: [lng, lat] with both in range.
export function isStoredLocation(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}
