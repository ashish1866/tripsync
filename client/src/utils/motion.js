import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

// TripSync's motion helper: the ONLY place JavaScript starts an animation
// (the slop guard fails any other `.animate(` call). CSS does the rest.
//
// - Timings and easings are read from tokens.css, so they live in one place.
// - Under prefers-reduced-motion, travelling becomes a plain fade and sliding
//   rows simply appear in their new places (see DESIGN-DECISIONS, "Motion").
// - Only transform and opacity are animated, so nothing reflows while it moves
//   and every control works the moment it is drawn.

const REDUCED = '(prefers-reduced-motion: reduce)';

export function calm() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED).matches);
}

// For components that must decide up front (Leaflet's options), and follow the setting if it changes.
function subscribe(onChange) {
  const query = window.matchMedia?.(REDUCED);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}
export function useCalm() {
  return useSyncExternalStore(subscribe, calm, () => false);
}

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// "220ms" or "0.7s" from tokens.css, in milliseconds.
export function motionTime(name) {
  const value = token(name);
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return value.endsWith('ms') ? n : value.endsWith('s') ? n * 1000 : 0;
}

function play(el, keyframes, { time, ease, id }) {
  const duration = motionTime(time);
  if (!el?.animate || duration <= 0) return null;
  el.getAnimations?.().forEach((a) => a.id === id && a.cancel());
  return el.animate(keyframes, { duration, easing: token(ease) || 'linear', id });
}

// Travelling along the road: when `position` (a day number) changes, the
// element arrives from the side you moved towards. Forward (Day 2 to Day 3)
// comes in from the right, back from the left, like the view from a bus.
// Never on the first render. Calm version: a plain fade.
const TRAVEL_PX = 24;
export function useTravel(ref, position) {
  const last = useRef(position);
  useLayoutEffect(() => {
    const before = last.current;
    last.current = position;
    if (before === position || !ref.current) return;
    if (calm()) {
      play(ref.current, [{ opacity: 0 }, { opacity: 1 }], { time: '--t-fade', ease: '--ease-settle', id: 'ts-travel' });
      return;
    }
    const from = position > before ? TRAVEL_PX : -TRAVEL_PX;
    play(ref.current, [{ transform: `translateX(${from}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], {
      time: '--t-travel',
      ease: '--ease-settle',
      id: 'ts-travel',
    });
  }, [position, ref]);
}

// Stones moving along the road: when the order of a list's rows changes
// (best order applied, a stop inserted by its time, a row removed), each row
// that stayed slides from where it was to where it is now. Rows are the
// list's children with data-shift-id. `group` (the day number) changes when a
// different list is shown; nothing slides then. Never on the first render.
// Calm version: the rows are simply in their new places.
export function useListShift(ref, ids, group) {
  const last = useRef(null);
  const key = ids.join('|');
  // Runs after every render, so the remembered positions are always the latest drawn.
  // offsetTop is the laid-out position: scrolling and a slide still running do not change it.
  useLayoutEffect(() => {
    const list = ref.current;
    const rows = list ? [...list.children].filter((el) => el.dataset.shiftId) : [];
    const topOf = (el) => (el.offsetParent === list ? el.offsetTop : el.offsetTop - list.offsetTop);
    const tops = new Map(rows.map((el) => [el.dataset.shiftId, topOf(el)]));
    const before = last.current;
    last.current = { group, key, tops };
    if (!before || before.group !== group || before.key === key || calm()) return;
    for (const el of rows) {
      const was = before.tops.get(el.dataset.shiftId);
      if (was === undefined) continue; // a new row: it gets wet paint instead
      const dy = was - tops.get(el.dataset.shiftId);
      if (Math.abs(dy) < 1) continue;
      play(el, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { time: '--t-shift', ease: '--ease-settle', id: 'ts-shift' });
    }
  });
}
