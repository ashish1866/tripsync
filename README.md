# TripSync

A website where a group plans a trip together: each day's stops on a map, the forecast for each day, every shared bill, and the shortest list of who pays whom. It does not book anything.

College full-stack project by Ashish Bisht (24BCF10042) and Dhruv Grover (24BCF10010).

**Live site:** https://tripsync.ashishbisht.workers.dev
(the API behind it runs at https://tripsync-api-lec8.onrender.com; use the site's address, which forwards `/api` there)

Service status before a demo: https://tripsync.ashishbisht.workers.dev/status

## What it does

Open a trip and it has these tabs:

| Tab | What it is for |
|---|---|
| Overview | The route as a row of day stones (date, stops, forecast), the map, the budget strip, packing progress, the group |
| Day plan | Pick a day, add stops (searched on the map), edit or move them, and ask for the nearest-first order |
| Explore | Cafes, restaurants, places to stay and things to see near the destination, with "Add to Day N" |
| Money | Settle up (who pays whom), the budget by category, every bill with filters and 20-a-page paging |
| Packing | One shared list with ticks and who packed what |
| Members | Invite links (Editor or Viewer, 7 days), roles, removing people, leaving |
| Trip settings | Owner only: name, dates, budget, delete the trip |

Roles are enforced twice: the screen hides what a role cannot do, and the API refuses it with 403 either way. Money is stored as whole paise and is never a decimal. A stop's map point is stored as `[longitude, latitude]` and converted in one place.

## How it fits together

```text
Browser ──> Cloudflare Worker (tripsync.ashishbisht.workers.dev)
              ├─ every page: the built React app (client/dist)
              ├─ /api/*: forwarded unchanged to the API on Render
              └─ every 10 minutes: pings the API so it does not fall asleep
                      │
                      v
            Render, free plan, Singapore (server/, plain Node + Express)
              ├─ checks the Firebase login token on every request
              ├─ asks Open-Meteo (forecast, town search) and Geoapify (places) for outside data
              └─ one shared MongoDB connection ──> MongoDB Atlas (Mumbai)
```

- `client/`: React + Vite (the website)
- `server/src/server.js` + `app.js`: the Express API (runs on Render, and on this PC for development)
- `server/src/worker.js` + `server/wrangler.jsonc`: the Cloudflare Worker (website + forwarder + keep-awake ping)
- `render.yaml`: how Render builds and runs the API. Setup steps: `docs/RENDER-SETUP.md`
- Firebase handles sign-up and log-in; TripSync never stores passwords.
- Every trip route runs the same chain, in this order: token valid (401), member of this trip (403), role allows it (403), input valid (400), then the work.

The Render address is a setting (`API_ORIGIN` in `server/wrangler.jsonc`), not written into the code. The Worker holds no secrets: the database link and the Geoapify key live only on Render (and in `server/.dev.vars` on this PC).

Things on the live setup that are worth knowing:

- **Speed:** see "Measured speed" at the end of this file.
- **The forecast depends on Open-Meteo accepting Render's address, unless a backup key is set (Visual Crossing's is counted per key, so the shared address does not matter to it).** Render's free plan shares its outgoing addresses between many customers, and Open-Meteo's free service limits each address per day. On 2026-10-12 it answered "Daily API request limit exceeded. Please try again tomorrow." to Render. When that happens the weather box says so, with Open-Meteo's own words, and the rest of the trip works. The forecast works normally from any other address (this PC, for example). Town search and Geoapify places were not affected.
- **Sleeping:** Render's free plan sleeps after 15 quiet minutes. The Worker's Cron Trigger pings `/api/health/ping` every 10 minutes to keep it awake (results are in the Worker's logs). If it does sleep, the first request takes about a minute and the site shows "not answering, try again in a minute".
- **Outside services:** the forecast (Open-Meteo, 16 days, cached 3 hours per town) and the place searches (Geoapify, cached 7 days) can fail on their own. Free keys add backup forecasts: if Open-Meteo refuses, TripSync asks Visual Crossing (`VISUALCROSSING_KEY`, 15 days, shown with "Powered by Visual Crossing Weather"), then OpenWeather (`OPENWEATHER_KEY`, 5 days), whichever has a key. The weather box says which one answered, and TripSync asks Open-Meteo again after 15 minutes. `WEATHER_PROVIDER=visualcrossing` or `openweather` forces one for testing; `open-meteo` turns the backups off; the default `auto` is the order above. When they do, only the weather box or the results list shows an error; the rest of the trip keeps working.

## Run it on your PC

On this PC, PowerShell blocks `npm` scripts, so type `npm.cmd` (or use Command Prompt).

1. Install Node.js 22 (22.12 or newer).
2. Copy `server/.dev.vars.example` to `server/.dev.vars`, and `client/.env.example` to `client/.env`. Fill both in from the private setup note. Both files are git-ignored. (`VISUALCROSSING_KEY` and `OPENWEATHER_KEY` in `.dev.vars` are optional: the backup forecasts. Paste keys only into these files and Render's Environment page, never into chat, the repo or a commit message.)
3. Install everything: `npm.cmd install`
4. Create the database indexes (safe to run again): `npm.cmd run setup-db`
5. Start the site and the API together: `npm.cmd run dev`
6. Open http://localhost:5173

`npm run dev` starts Vite on port 5173 and the API on port 8787. The API restarts itself when a file in `server/src` changes. Vite forwards every `/api` request to the API, so there is no CORS setup.

To try the Cloudflare Worker locally as well, keep `npm run dev` running and run `npm.cmd run preview:worker`. This builds the website and opens the Worker at http://localhost:8788, forwarding `/api` to the local API.

## The demo trip

`npm.cmd run seed` loads a ready-made "Manali Trip" so the demo starts with real-looking data: four days, 12 stops (10 with a real map point: Hadimba Devi Temple, Solang Valley, Jogini Falls and others; the last day's checkout and bus have none, on purpose), a Rs 45,000 budget, 14 bills (hotel, Volvo tickets, cabs, paragliding, food, with equal and exact splits), one payment already marked as paid, and a packing list that is 5 of 8 packed.

1. Open the website and sign up or log in with the account that should own the trip. (This creates your profile, which the seed needs.)
2. Load the trip: `npm.cmd run seed -- --owner your@email.com` (on this PC, into `tripsync_dev`), or for the live site `npm.cmd run seed -- --owner your@email.com --db tripsync`
3. Log in as that account. "Manali Trip" is on Your trips.

Options (after `--`): `--db NAME` loads into another database, `--start 2026-10-20` sets the first day (default: three days from today, so the forecast shows), `--remove` takes the demo trip and its demo friends out again. Running it again replaces the earlier demo trip and never touches your other trips. Run it against the same database the API uses (the one in `server/.dev.vars`, or `MONGODB_DB` on Render).

The group is you (owner), plus Rahul and Ankit (editors) and Rohan (viewer). The three friends are demo profiles flagged `demo`: they show up in the group, the bills and settle up, but have no login. To show how roles and invites work for real, make an invite on the Members tab and open it in a second browser (or a private window) with another account.

### A five-minute walk through it

1. **Your trips:** the trip with its dates, the budget strip and "Starts in 3 days".
2. **Overview:** the day stones with the real forecast (and a red rain warning if a day with stops has more than a 60% chance of rain; whether one shows depends on the weather that day), the map with a stone pin per stop, the packing strip.
3. **Day plan:** pick Day 2, see Solang Valley on the map. Add a stop with the place search. Press "Suggest the nearest-first order" and read the straight-line caution before using it.
4. **Explore:** cafes within 5 km, then "Add to Day 3" and see it on the plan.
5. **Money:** settle up first (the shortest list of who pays whom, in rupees with Indian grouping), then the budget by category in the kilometre-stone colours, then the bills. Filter by category or person and page through them. Press "Mark as paid" on one payment and watch settle up shrink.
6. **Members:** make an Editor link, open it in a private window and join. Make someone a viewer and show that the add buttons disappear and that the API refuses the same action (403).
7. **Packing:** tick an item in one window and refresh the other.

## Check it

- `npm.cmd test`: unit tests (the token check, dates to days, weather rules, the settle-up maths, equal splits with the leftover-paise rule, Haversine and nearest-first order, paging and filters, input rules, and the demo trip).
- `npm.cmd run check`: one pass/fail report with every step's checks: the "must fail" API requests (no token, forged token, a viewer writing, a stranger reading, bad input), concurrent edits, the invite flow, rate limits, and every screen in Chrome at laptop (1280 px) and phone (390 px) width. It also times 10 requests to each of three API routes. It needs `npm run dev` running and takes about three minutes.
- `npm.cmd run check -- --live`: the same checks against the live site. Name the database the live API uses if it is not the one in `server/.dev.vars`: `npm.cmd run check -- --live --db=tripsync`.
- `npm.cmd run check -- --url=http://localhost:8788`: against any address, for example the local Worker.
- `npm.cmd run check -- --look`: also saves screenshots in `checks/.artifacts` for judging the design.
- `node checks/slopGuard.mjs`: only the slop guard (banned design values in the website's source; no server needed). It also runs first inside `npm.cmd run check`.

**Test accounts.** Firebase limits how fast accounts can be created, so the check keeps a fixed pool of 14 accounts named `tripsync.check.pool.*@example.com`. Each is created once, and its email and random password are kept in `checks/.test-accounts.json` (git-ignored). Every run logs in to the same accounts, wipes everything they own in MongoDB at the start and again at the end, and checks the data is gone. Only the sign-up story makes one fresh account per run (`tripsync.check.<time>.web@example.com`), which is written to `checks/.artifacts/test-accounts.json` before it is created, deleted from Firebase and MongoDB at the end, and confirmed gone by trying to log in again. To remove the whole pool for good: `npm.cmd run check -- --delete-pool`.

## Deploy

- **API:** pushing to `main` redeploys it on Render by itself (when something in `server/` changed). After changing a server dependency, run `npm.cmd run lock:server` and commit `server/package-lock.json`, because Render installs from that file.
- **Website and Worker:** `npm.cmd run deploy` builds the website and uploads it with the Worker.
- **Databases:** one Atlas cluster, two databases. The **live site uses `tripsync`** (`MONGODB_DB` in `render.yaml` and on Render). **Development and the local check use `tripsync_dev`** (`server/.dev.vars`). Test data never reaches the live database except during `npm run check -- --live`, which wipes it again at the end. To set up indexes in the live database: `$env:MONGODB_DB='tripsync'; npm.cmd run setup-db`. The check asks the API which database it uses (`/api/health`), so it always inspects the right one.

## API

Every route needs a login (a Firebase token) except the two health routes and the invite preview. Errors always come back as `{ "error": "message" }`; answers are never cached (`Cache-Control: no-store`). "Planners" means the owner and editors.

| Route | Who | What |
|---|---|---|
| `GET /api/health/ping`, `GET /api/health` | anyone | Alive without the database; and with the MongoDB check |
| `GET` / `POST /api/users/me` | logged in | Your profile; create it once `{ name }` |
| `GET /api/trips`, `POST /api/trips` | logged in | Your trips (with spent so far); create one |
| `GET /api/trips/:id` | members | The whole trip |
| `PATCH` / `DELETE /api/trips/:id` | owner | Change name, dates, budget; delete it with its bills and invites |
| `GET /api/geo/destinations?q=`, `GET /api/geo/spots?q=&tripId=` | logged in / members | Town search (Open-Meteo); place search near the trip (Geoapify, key stays on the server) |
| `POST /api/trips/:id/days/:day/activities`, `PATCH` / `DELETE /api/trips/:id/activities/:actId` | planners | Add, change (field by field, or move to another day), remove a stop |
| `GET /api/trips/:id/days/:day/best-order`, `PUT /api/trips/:id/days/:day/order` | members / planners | Suggest the nearest-first order (straight-line); apply an order |
| `GET /api/trips/:id/weather` | members | Forecast per day (3-hour cache, 16 days ahead) |
| `GET /api/trips/:id/places?category=&radius=` | members | Cafes, restaurants, places to stay, things to see (cache first) |
| `POST` / `GET` / `DELETE /api/trips/:id/invites[/:code]` | owner | Make, list, stop an invite link |
| `GET /api/invites/:code`, `POST /api/invites/:code/join` | anyone / logged in | Preview an invite; join with it |
| `PATCH` / `DELETE /api/trips/:id/members/:uid` | owner (leave: yourself) | Change a role; remove someone or leave |
| `GET /api/trips/:id/expenses?category=&person=&page=` | members | Bills, newest first, 20 a page |
| `POST` / `PATCH` / `DELETE /api/trips/:id/expenses[/:id]` | planners (editors: only their own) | Add, change, delete a bill |
| `GET /api/trips/:id/budget`, `GET` / `POST /api/trips/:id/settlements` | members / planners | Spent by category (settlements left out); who pays whom; "Mark as paid" |
| `POST` / `PATCH` / `DELETE /api/trips/:id/checklist[/:itemId]` | planners | Add, tick, remove a packing item |

Joins, searches, weather and nearby-place requests are rate-limited per Firebase user (429 with `Retry-After`).

## Design

The visual decisions and the reasons for them are in `docs/DESIGN-DECISIONS.md`.

## Measured speed

Measured with `npm run check -- --live` from Ashish's PC on 2026-10-12 (median of 10 requests each, including the network; the website is served from Cloudflare, so a request goes PC ? Cloudflare (Marseille on this connection) ? Render in Singapore ? MongoDB in Mumbai and back):

| Request | Through the live site | Same API on this PC |
|---|---|---|
| `GET /api/health/ping` (no database) | 326 ms (min 303, max 410) | 5 ms |
| `GET /api/health` (MongoDB ping) | 376 ms (min 371, max 434) | 42 ms |
| `GET /api/users/me` (token check + a MongoDB read) | 418 ms (min 369, max 1157) | 44 ms |
| First request of the run | 1,168 ms | 27 ms |

Almost all of the live time is the journey, not the work: the database read adds about 50 to 90 ms to a bare ping. Calling Render directly (not through the Worker) took about 0.19 s when measured on 2026-10-11.
