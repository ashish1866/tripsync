# TripSync progress log

Kiro adds one short block per finished step, newest at the top. A fresh session reads the top block first.

## Blocked
(nothing)

## Step 3: Itinerary and map (done, not pushed)
- Works: trip page has a "Day plan" tab (`/trips/:id/plan?day=2`). Owners and editors add stops (name, time, notes, place from `/api/geo/spots`, Geoapify within 60 km of the destination), edit them field by field, move them to another day and remove them. Pins: the "0" destination stone plus a stone per stop with a place, on the day plan and the overview. Viewers see the plan with no way to change it.
- Tested: `npm.cmd test` 15/15. `npm.cmd run check` 160/160, including: "Solang Valley" found and added to Day 2 with a pin (API and browser); a viewer adding, editing or removing a stop gets 403; a stranger 403; two members editing different fields of one stop at the same moment, and two different stops, keep both edits; 6 bad stop bodies 400; time order; moving to Day 3 keeps the notes; phone width with no sideways scroll.
- Not verified: two members changing the SAME field at the same moment (the later save wins; there is no warning). Geoapify's free-plan daily limit was not reached or measured.
- Next: Step 4 in `docs/TASKS.md`.

## Step 2: Trips (done, commit 2aab372, not pushed)
- Works: My Trips lists every trip you are in (stone with destination and days, dates, people, your role, budget strip). "Plan a new trip" searches destinations through `/api/geo/destinations` (Open-Meteo), shows the pick as a stone pin on a grey OSM map, and creates one day per date. The trip page shows the route of day stones, the map and the group. Owner-only settings edit name, dates and budget, and delete the trip (with its expenses and invites) after a TripSync dialog. Shortening past a day with stops is refused with 409 and the day named.
- Tested: `npm.cmd test` 15/15. `npm.cmd run check` 119/119: stranger reads 403, non-owner edit/delete 403, 11 bad create bodies and 5 bad edits 400, dates longer/shorter keep stops, "Manali Trip" on My Trips with "Manali, Himachal Pradesh", stone pin and "© OpenStreetMap contributors", no default pins, phone width with no sideways scroll, `/status` mark stands still with reduced motion. Client build passes.
- Fixed while finishing: the check now uses 1280 px laptop and 390 px phone viewports and never full-page screenshots (new Screenshots rule), and waits for the trips list and map tiles instead of reading too early.
- Not verified: the 409 "changed at the same moment" path (a date change racing another edit) is in code but not forced by a test. The JS bundle is 614 kB (Vite warns above 500 kB); splitting it is not part of this step.
- Next: Step 3 in `docs/TASKS.md`.

## Step 1.6: Slop guard (done, commit b3ecae6, not pushed)
- Works: `npm.cmd run check` starts with a "Slop guard" section (`checks/slopGuard.mjs`, also runs alone with `node checks/slopGuard.mjs`). It scans 42 files in `client/src` and `client/index.html`. Copy phrases are found with a JS parser (acorn + acorn-jsx, pinned root dev dependencies), so only visible text counts.
- Fixed hits: 2 striped fills became the shared `RoadDashes` component, and 4 non-focus `box-shadow`s became outlines. 0 slop-ok exceptions.
- Tested: guard passes on current code. With planted files it failed on every rule (colour, gradient, blur, shadow, JS boxShadow, fonts, alert, TODO, emoji, five copy phrases, an unlogged slop-ok). It did not trip on `onSubmit`, `type="submit"`, a comment saying "Get started", or "©". Plants removed. `npm.cmd test` 10/10, `npm.cmd run check` 66/66. Dashes move on the working button and loading strip, and stand still under reduced motion.
- Not verified: the guard reads source text, so a banned value built at runtime (string joined in code) would get past it.
- Next: Step 2 in `docs/TASKS.md`.

## Step 1.5: API on Render (done, commit 70dcb53)
- Works: live site https://tripsync.ashishbisht.workers.dev forwards `/api/*` to https://tripsync-api-lec8.onrender.com. Worker has no secrets. Keep-awake cron every 10 minutes reaches Render.
- Tested: `npm.cmd run check -- --live` 58/58, twice. Medians through the Worker about 330-430 ms (Cloudflare routes this connection via Marseille; direct to Render about 190 ms).
- Not verified: Render's own logs; staying awake over many hours; speed from other networks.
- Next: Step 1.6 in `docs/TASKS.md`.
