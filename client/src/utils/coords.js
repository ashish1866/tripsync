// COORDINATES in the browser: the one place where their order is converted.
// The API sends locations the way MongoDB stores them: [longitude, latitude].
// Leaflet wants [latitude, longitude]. Every map pin goes through toLatLng.
export function toLatLng(location) {
  return [location[1], location[0]];
}
