# TripSync task list

Kiro: do the first unticked step only, then stop (see `.kiro/steering/workflow.md`).
Tick a box only when every "Done when" item has passed. Steps 0, 1 and 1.5 are finished (commits `5551242`, `8ef75e6`, `08d0101`, `70dcb53`).

- [x] Step 0: setup, Atlas connection, one-command dev, day-one Worker test
- [x] Step 1: Firebase sign-up/log-in, token check, `users/me`
- [x] Step 1.5: API on Render, Worker forwards `/api`, keep-awake cron

## - [x] Step 1.6: Slop guard (do this first)
Add a section to `npm.cmd run check` that scans `client/src` and `client/index.html` and FAILS on banned values from `.kiro/steering/design.md`: `indigo`, `violet`, `purple`, `linear-gradient`, `radial-gradient`, `bg-clip-text`, `background-clip: text`, `text-transparent`, `backdrop-filter`, `box-shadow` (except `none` and the shared focus ring), `Inter`, `Roboto`, `Open Sans`, `system-ui`, `-apple-system`, `alert(`, `confirm(`, `lorem`, `TODO`, `Vite + React`, emoji characters in JSX, and the copy phrases "Get started", "Learn more", "Submit", "Click here", "seamless", "effortless", "elevate", "unlock", "Oops".
- Match copy phrases only in user-visible text (JSX text and string literals shown on screen), case-sensitive, so variable names like `onSubmit` do not trip it.
- A line ending in the comment `slop-ok: <reason>` is skipped, and the reason must also be logged in DESIGN-DECISIONS.md.
- Done when: the check passes on the current code (fix or justify every hit), and a deliberately planted banned value makes it fail (then remove the plant).

## - [x] Step 2: Trips
Create, list, edit, delete. Destination search through `/api/geo/destinations` (Open-Meteo geocoding). Map point for the destination (stone-shaped pin, not Leaflet's default). One day per date created automatically. Owner-only edit/delete. Shortening a trip is refused if the removed days have activities, with the reason.
- Done when: "Manali Trip" shows on My Trips with its location; a stranger reading a trip gets 403; a non-owner editing gets 403; bad dates or budget get 400.
- Also in this step: log in DESIGN-DECISIONS.md the reason for the turning "still checking" mark on `/status` (the motion shows a check is still running) and confirm it stands still under reduced motion.

## - [x] Step 3: Itinerary and map
Activities per day (title, time, notes, place via Geoapify autocomplete `/api/geo/spots`). Pins for the destination and every activity. Single-item updates only.
- Done when: Day 2 shows Solang Valley with a pin; editing one activity never overwrites another member's edit; a viewer adding an activity gets 403.

## - [x] Step 4: Weather
Open-Meteo forecast through the 3-hour `weatherCache` (location rounded to 2 decimals). Forecast on each day stone. Rain warning when rain chance is above 60% on a day with activities. Beyond the forecast range, the "closer to your trip" message.
- Done when: forecast shows; a second visit does not call Open-Meteo (proved by a log or counter); the weather box failing does not break the rest of the page.

## - [x] Step 5: Members and roles
Invite link/code (Editor or Viewer, 7 days, expiry checked in code). Join works for a logged-out visitor (log in, come back to the invite). Owner changes roles and removes members; owner cannot leave; a member who owes money cannot be removed. Rate limits on invite join and outside-API routes, counted per Firebase user, in Express.
- Done when: a second test account joins; a Viewer gets 403 on every write route; an expired invite shows the expired message; joining twice says "You're already in this trip".

## - [x] Step 6: Expenses, budget, settle up
Add/edit/delete (editors only their own). Equal or exact splits in paise with the leftover-paise rule. Budget by category in one aggregation, settlements excluded, chart themed with our tokens (milestone colour code), not Recharts defaults. Settle up: biggest debtor pays biggest creditor until zero. "Mark as paid" stored as a settlement.
- Done when: unit tests pass for equal, uneven, rounding (Rs 1,000 / 3), already settled, and one-person-paid-everything; the brief's example gives Ankit -> Ashish 2,500, Rohan -> Ashish 2,500, Rahul -> Ashish 500; splits that do not add up get 400; an editor editing someone else's expense gets 403.

## - [x] Step 7: Explore nearby places
Cafes, attractions, hotels, restaurants via Geoapify, `places` cache first. List plus map pins, distance, "Add to Day N". No ratings.
- Done when: cafes near Manali appear; a second search for the same area uses the cache; "Add to Day 2" puts the place on Day 2.

## - [x] Step 8: Packing checklist
Shared list, add, tick, delete, "8 of 12 packed". Editors and owner only for changes.
- Done when: two accounts see each other's ticks after a refresh; a viewer ticking gets 403.

## - [x] Step 9: Extras
Best order for a day (nearest-first, Haversine, labelled straight-line). Expense filters by category and person, 20 per page.
- Done when: unit test for nearest-first passes; filters and paging return the right rows.

## - [x] Step 9.5: Full test run (all steps at once)
First make `npm.cmd run check` use a fixed pool of test accounts: create each once if missing, keep email + random password in a git-ignored file (e.g. `checks/.test-accounts.json`), reuse them every run, and wipe their MongoDB data at the start and end of each run. Only the sign-up test makes one fresh account per run and deletes it. Then run the full check locally, fix every failure (one small commit per fix), and re-run until it passes. If `TOO_MANY_ATTEMPTS_TRY_LATER` appears, do not sleep in a loop: write it under "Blocked" in `docs/PROGRESS.md` and stop.
- Done when: `npm.cmd test` and the full `npm.cmd run check` pass locally, covering every step's must-fail cases, with no leftover fresh test account.

## - [ ] Step 10: Demo prep and ship
Before the push: delete the fixed test-account pool from Firebase and its data from MongoDB, and prove both are gone (the live check may recreate them; delete them again after it).
Confirm `tripsync_app` can use a new database `tripsync`; ask Ashish before switching Render's `MONGODB_DB`. Seed script for the Manali demo trip with realistic bills. README run and demo instructions. Then push `main` once, deploy the Worker, run `npm.cmd run check -- --live`, report medians.
- Done when: the live site shows the seeded Manali trip end to end and the live check passes.

## - [x] Step 11: Motion revamp
Asked for by Ashish on 12-Oct-2026 while Step 10 waits on the demo-trip email (see Blocked in `docs/PROGRESS.md`). Motion only: no colour, font, layout or copy changes. Every animation tells the user something about the road world (still travelling, freshly painted, wet paint, stones moving along the road, a plate pressed) and has a written reason in DESIGN-DECISIONS.md.
- Done when:
  - The inventory of what moves today and where motion would help is in `docs/PROGRESS.md` before any code changes.
  - Every timing and easing lives in `tokens.css`, named for what it shows; JavaScript starts animations only through `client/src/utils/motion.js`.
  - The "still working" signals are rebuilt: the loading strip and a working button wait before they show (no flash on a quick answer), the dashes pull away and then cruise, and the `/status` mark is replaced by an unpainted outline whose dashes run round it, painted solid (passed) or replaced by the warning sign (failed) when the answer arrives.
  - Built and reasoned: plates pressed (down fast, up slower) on buttons, day stones, trip rows, choice plates and tick boxes; the tab cap painted in the direction you moved; the picked day stone painted up from its base; the day's stops travelling in from the side of the road you moved to; stops sliding to their new places (best order, a stop inserted by time, a stop removed); wet paint on the row you just added (stop, packing item, bill or payment, invite link); a new stop's map stone rising out of the ground; choice plates, packing ticks, the role plate and the Explore pick painted on; the packed and budget strips' paint edge moving; the dialog band painted across.
  - Only `transform` and `opacity` are animated. Nothing plays on page load, nothing loops except the road dash, nothing makes a control wait.
  - `prefers-reduced-motion`: every animation has a calm version (stands still, instant, or a plain fade), and it is checked in a real browser.
  - At rest every screen looks exactly as before (compared screenshot by screenshot against the code before this step).
  - The slop guard has a Motion group (properties, raw timings, missing reduced-motion rules, loops, hover transforms, scroll reveals, smooth scrolling, animation outside the helper, motion and count-up libraries, bouncy easing, slop keyframe names, Recharts' own animation) and a self-test in `npm.cmd test` that proves every rule fires.
  - After each chunk: `npm.cmd test`, `node checks/slopGuard.mjs` and the client build pass, one local commit per area.
  - At the end: the new Motion section of the check passes locally on its own, then `main` is pushed once, the Worker deployed, and `npm.cmd run check -- --live` passes once; the test-account pool is deleted again afterwards.
