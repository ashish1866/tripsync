# TripSync progress log

Kiro adds one short block per finished step, newest at the top. A fresh session reads the top block first.

## Blocked
(nothing)

## Step 6: Expenses, budget, settle up (done, not pushed)
- Works: a "Money" tab. Owners and editors add bills (equal or exact split, in paise, leftover paise to the first people), edit and delete them (editors only their own). Settle up lists who pays whom (biggest debtor pays biggest creditor) with "Mark as paid", stored as a `settlement`. Budget by category in one aggregation, settlements left out, drawn in the kilometre-stone colours (no Recharts defaults). The overview shows the budget strip.
- Tested: `npm.cmd test` 33/33, including equal, uneven (exact), rounding (Rs 1,000 / 3 = 333.34 + 333.33 + 333.33), already settled, one person paid everything, and paying the suggested list bringing everyone to zero. `npm.cmd run check` 275/275: the brief's example through the API gives "Ankit -> Ashish 2500, Rohan -> Ashish 2500, Rahul -> Ashish 500"; splits that do not add up get 400 "Splits must add up to Rs 4,500. ..."; an editor editing or deleting someone else's bill gets 403; a viewer is refused on all four money write routes; 10 bad bills 400; budget by category matches; marking every payment leaves everyone at zero and the spent total unchanged. In the browser: add a bill, exact-split error before sending, settle up updates, mark as paid via the dialog, chart bars in the stone colours with no tooltip/legend/grid, phone width with no sideways scroll.
- Not verified: two people marking the same payment at the same moment (the second would be refused only if it then exceeded what is owed). The client bundle is now larger because of Recharts; still one file.
- Next: Step 7 in `docs/TASKS.md`.

## Step 5: Members and roles (done, commit 0d60e82, not pushed)
- Works: a "Members" tab on every trip. The owner makes an Editor or Viewer invite (8-character code, link `/join/CODE`, 7 days), sees the links still working, copies or stops one, switches an Editor/Viewer, and removes people. Anyone else can leave. `/join/:code` opens for a logged-out visitor, who logs in or signs up and lands back on the same invite to join. Your trips has an "Got an invite code?" box. Expired code shows "This invite has expired, ask the owner for a new one."; joining twice shows "You're already in this trip."
- Rules enforced by the API (403/409): a Viewer is refused on every write route that exists (10 routes checked one by one); only the owner invites, changes roles, removes people; the owner cannot leave; a member who owes money can be neither removed nor leave (the message names the amount). Joins and outside-service routes are rate-limited per Firebase user in Express (10 joins per 15 min, 60 searches and 30 weather checks per minute), answering 429 with Retry-After.
- Tested: `npm.cmd test` 23/23 (new: balances, rupee wording). `npm.cmd run check` 232/232, including a second account joining by code, two codes used at the same moment adding the person once, an invite older than 7 days refused in code before MongoDB's clean-up runs, wrong-code lockout for one account but not another, and the whole logged-out round trip in a real browser. Phone width has no sideways scroll.
- One run of the check stopped at its MongoDB connection (a 10 s network timeout from this PC; the API itself was connected). The next run passed 232/232 with nothing changed.
- Not verified: the rate limit across several server processes (the counts live in one process's memory, which is how Render runs the API; a restart clears them). Copying the link to the clipboard works only in a browser that allows it; the failure message is written but was not triggered.
- Next: Step 6 in `docs/TASKS.md`.

## Step 4: Weather (done, commit cedc16f, not pushed)
- Works: `GET /api/trips/:id/weather` (members only) gives each trip day a forecast from Open-Meteo through the 3-hour `weatherCache` (key "32.26,77.17" for Manali). Day stones show symbol, high/low and rain chance; the overview has a weather box; the day plan says the day's forecast in words. Rain warning (red) on a day with stops above 60%. Days beyond the 16-day forecast say "Forecast later" and the box says when it will appear.
- Tested: `npm.cmd test` 20/20 (new: weather on days, codes, rain rule). `npm.cmd run check` 178/178: first visit `source: open-meteo`, second `source: cache` with the same check time and one cache document; another group's Manali trip shares it; an entry over 3 hours old is refreshed; a trip 40 days out never calls Open-Meteo; stranger 403, no token 401. In the browser: real forecast on every stone; planted forecast shows the warning only on Day 2 (not Day 1 at exactly 60%, not Day 3 without stops); a failing weather call shows an error only in the weather box, with the trip, stones and map still working, and "Try the forecast again" recovers. The dev server log shows "asked Open-Meteo" once, then "from the cache".
- Not verified: Open-Meteo actually being down (the failure was simulated in the browser, not on the server). Forecast accuracy is Open-Meteo's.
- Next: Step 5 in `docs/TASKS.md`.

## Step 3: Itinerary and map (done, commit bf9c5ce, not pushed)
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
