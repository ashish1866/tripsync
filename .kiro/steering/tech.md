---
inclusion: always
---

# TripSync: technical rules (always true)

## Stack as actually built (do not change it)
- Client: React + Vite, plain JavaScript, React Router, Axios, Leaflet + OpenStreetMap, Recharts. Styling is plain CSS with tokens in `client/src/styles/tokens.css` plus CSS Modules. No Tailwind, no component library.
- Auth: Firebase Authentication in the browser. The server checks Firebase ID tokens with `jose` (RS256, issuer and audience = project `tripsync-d3e9b`). No passwords stored by us.
- Server: Express 5, plain `mongodb` driver (NOT Mongoose), `zod` for every body/param/query, built-in `fetch` for outside APIs. One shared MongoDB client.
- Hosting: API on Render (free, Singapore, `node src/server.js`). Cloudflare Worker serves the site and forwards `/api/*` to `API_ORIGIN`. The Worker holds no secrets and no database code.

## Data rules
- Money is whole paise (Rs 8,000 = 800000). Never floats. Leftover paise go to the first people in the split.
- MongoDB coordinates are `[lng, lat]`. Leaflet uses `[lat, lng]`. Geoapify filters use `lon,lat`. Convert in one helper, on purpose.
- Edit one item with `$push` / `$pull` / positional updates. Never load a whole trip, change it and save it back.

## Every trip route passes this chain, in this order
token valid? (401) -> member of this trip? (403) -> role allows it? (403) -> body valid? (400) -> do the work.
The membership check is never skipped. Errors are always `{ "error": "message" }`; 500s return one fixed plain sentence ("The TripSync server could not finish this request. Please try again in a minute.") and log the real error on the server, never sending internal details.

## Secrets
- Real values live only in `server/.dev.vars` (local) and Render's dashboard (live). Never in the repo, chat, logs, screenshots or commit messages.
- Geoapify key is server-only. Anything named `VITE_` is public.

## Commands on this PC (Windows)
- Use `npm.cmd` / `npx.cmd` (PowerShell blocks `npm`). Dev: `npm.cmd run dev`. Unit tests: `npm.cmd test`. Full check: `npm.cmd run check` (add `-- --live` for the live site).
- Host memory is tight: run one dev server at a time, stop it when done, and keep only one browser check running.

## Screenshots (a chat breaks if this is ignored)
- Take browser screenshots at a viewport no wider than 1280 px and no taller than 1600 px (phone checks at 390 px wide). Never full-page captures of long pages.
- Open a screenshot in the chat only when a check fails or the look itself must be judged, and at most 3 per step. Prefer reading the page as text.
- Delete screenshot files when the step is done.

## Git
- One commit per finished step, author passed with one-off flags; never change git config. No secrets in commits.
- Do not push in the middle of a step. A push that touches `server/` restarts Render for about a minute.
- After changing a server dependency, run `npm.cmd run lock:server`.
