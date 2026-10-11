import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, AttributionControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toLatLng } from '../utils/coords';
import styles from './TripMap.module.css';

// The trip map: OpenStreetMap tiles, toned to grey so the yellow stone pins
// stand out, inside a plain 2px ink frame.
//
// pins: [{ id, location: [lng, lat], kind: 'destination' | 'stop' | 'place', label, title, faded }]
//   destination: the "0 km" stone of the trip
//   stop:        a planned stop, label is its number in the day
//   place:       a nearby place from Explore, label is a category letter
export default function TripMap({ pins, height = '22rem', label = 'Map', onPinClick }) {
  const first = pins[0];
  return (
    <figure className={styles.frame} style={{ '--map-height': height }}>
      <MapContainer
        className={styles.map}
        center={first ? toLatLng(first.location) : [22.5, 79]}
        zoom={first ? 12 : 4}
        scrollWheelZoom={false}
        attributionControl={false}
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
            icon={stoneIcon(pin)}
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

// Moves the map so every pin is in view whenever the pins change.
function FitToPins({ pins }) {
  const map = useMap();
  const key = useMemo(() => pins.map((p) => `${p.id}:${p.location.join(',')}`).join('|'), [pins]);
  useEffect(() => {
    if (!pins.length) return;
    if (pins.length === 1) {
      map.setView(toLatLng(pins[0].location), 12);
    } else {
      map.fitBounds(L.latLngBounds(pins.map((p) => toLatLng(p.location))), { padding: [40, 40], maxZoom: 14 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

// A pin is a tiny kilometre stone drawn in HTML and CSS (no image files).
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function stoneIcon({ kind, label = '', faded }) {
  const size = kind === 'destination' ? [34, 44] : [28, 36];
  return L.divIcon({
    className: '', // no Leaflet default styling
    html: `<span class="ts-pin ts-pin-${kind}${faded ? ' ts-pin-faded' : ''}" aria-hidden="true"><span class="ts-pin-cap"></span><span class="ts-pin-face">${escapeHtml(label)}</span></span>`,
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1]],
  });
}
