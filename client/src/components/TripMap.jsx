import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, AttributionControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toLatLng } from '../utils/coords';
import { calm, useCalm } from '../utils/motion';
import styles from './TripMap.module.css';

// The trip map: OpenStreetMap tiles, toned to grey so the yellow stone pins
// stand out, inside a plain 2px ink frame.
//
// pins: [{ id, location: [lng, lat], kind: 'destination' | 'stop' | 'place', label, title, faded }]
//   destination: the "0 km" stone of the trip
//   stop:        a planned stop, label is its number in the day
//   place:       a nearby place from Explore, label is a category letter
// plantNew: a pin that appears after the map was first drawn (a stop just
//   added) rises out of the ground, so you can see where it went.
//
// Under prefers-reduced-motion, Leaflet's own zoom, fade, pan and drag
// inertia are switched off too, and the map jumps to fit its pins.
export default function TripMap({ pins, height = '22rem', label = 'Map', onPinClick, plantNew = false }) {
  const still = useCalm();
  const first = pins[0];
  const planted = usePlanted(pins, plantNew);
  return (
    <figure className={styles.frame} style={{ '--map-height': height }}>
      <MapContainer
        key={still ? 'still' : 'moving'} // Leaflet reads these options once, so a changed setting draws a new map
        className={styles.map}
        center={first ? toLatLng(first.location) : [22.5, 79]}
        zoom={first ? 12 : 4}
        scrollWheelZoom={false}
        attributionControl={false}
        zoomAnimation={!still}
        fadeAnimation={!still}
        markerZoomAnimation={!still}
        inertia={!still}
        aria-label={label}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <AttributionControl position="bottomright" prefix={false} />
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={toLatLng(pin.location)}
            icon={stoneIcon(pin, planted.has(pin.id))}
            title={pin.title}
            alt={pin.title}
            zIndexOffset={pin.kind === 'destination' ? -100 : pin.faded ? 0 : 500}
            eventHandlers={onPinClick ? { click: () => onPinClick(pin) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -36]} className={styles.tooltip}>
              {pin.title}
            </Tooltip>
          </Marker>
        ))}
        <FitToPins pins={pins} />
      </MapContainer>
    </figure>
  );
}

// Pins first seen after the map's first drawing, for as long as they are
// rising. Pins there from the start (and every pin without plantNew) never rise.
const RISE_MS = 1000;
function usePlanted(pins, plantNew) {
  const seen = useRef(null); // id -> when it was first drawn
  const now = Date.now();
  const planted = new Set();
  if (plantNew && seen.current) {
    for (const p of pins) {
      const at = seen.current.get(p.id);
      if (at === undefined || now - at < RISE_MS) planted.add(p.id);
    }
  }
  useEffect(() => {
    const first = !seen.current;
    if (first) seen.current = new Map();
    for (const p of pins) if (!seen.current.has(p.id)) seen.current.set(p.id, first ? -Infinity : Date.now());
  });
  return planted;
}

// Moves the map so every pin is in view whenever the pins change.
function FitToPins({ pins }) {
  const map = useMap();
  const key = useMemo(() => pins.map((p) => `${p.id}:${p.location.join(',')}`).join('|'), [pins]);
  useEffect(() => {
    if (!pins.length) return;
    const animate = !calm();
    if (pins.length === 1) {
      map.setView(toLatLng(pins[0].location), 12, { animate });
    } else {
      map.fitBounds(L.latLngBounds(pins.map((p) => toLatLng(p.location))), { padding: [40, 40], maxZoom: 14, animate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

// A pin is a tiny kilometre stone drawn in HTML and CSS (no image files).
// Icons are kept and reused, so Leaflet redraws a pin only when its look
// changes (a redraw would restart a rising stone).
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icons = new Map();

function stoneIcon({ kind, label = '', faded }, rising) {
  const key = `${kind}|${label}|${faded ? 1 : 0}|${rising ? 1 : 0}`;
  if (!icons.has(key)) {
    const size = kind === 'destination' ? [34, 44] : [28, 36];
    icons.set(
      key,
      L.divIcon({
        className: 'ts-pin-ground', // no Leaflet default styling; clips a stone rising out of the ground
        html: `<span class="ts-pin ts-pin-${kind}${faded ? ' ts-pin-faded' : ''}${rising ? ' ts-pin-planted' : ''}" aria-hidden="true"><span class="ts-pin-cap"></span><span class="ts-pin-face">${escapeHtml(label)}</span></span>`,
        iconSize: size,
        iconAnchor: [size[0] / 2, size[1]],
      }),
    );
  }
  return icons.get(key);
}
