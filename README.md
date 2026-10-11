# TripSync

A website where a group plans a trip together: each day's stops on a map, the forecast for each day, every shared bill, and the shortest list of who pays whom. It does not book anything.

College full-stack project by Ashish Bisht (24BCF10042) and Dhruv Grover (24BCF10010).

Live: https://tripsync.ashishbisht.workers.dev

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
              └─ one shared MongoDB connection ──> MongoDB Atlas (Mumbai)
```

- `client/`: React + Vite (the website)
- `server/src/server.js` + `app.js`: the Express API (runs on Render, and on this PC for development)
- `server/src/worker.js` + `server/wrangler.jsonc`: the Cloudflare Worker (website + forwarder + keep-awake ping)
- `render.yaml`: how Render builds and runs the API. Setup steps: `docs/RENDER-SETUP.md`
- Firebase handles sign-up and log-in; TripSync never stores passwords.

The Render address is a setting (`API_ORIGIN` in `server/wrangler.jsonc`), not written into the code.

## Run it on your PC

On this PC, PowerShell blocks `npm` scripts, so type `npm.cmd` (or use Command Prompt).

1. Install Node.js 22 (22.12 or newer).
2. Copy `server/.dev.vars.example` to `server/.dev.vars`, and `client/.env.example` to `client/.env`. Fill both in from the private setup note. Both files are git-ignored.
3. Install everything: `npm.cmd install`
4. Create the database indexes (safe to run again): `npm.cmd run setup-db`
5. Start the site and the API together: `npm.cmd run dev`
6. Open http://localhost:5173

`npm run dev` starts Vite on port 5173 and the API on port 8787. The API restarts itself when a file in `server/src` changes. Vite forwards every `/api` request to the API, so there is no CORS setup.

To try the Cloudflare Worker locally as well, keep `npm run dev` running and run `npm.cmd run preview:worker`. This builds the website and opens the Worker at http://localhost:8788, forwarding `/api` to the local API.

## Check it

- `npm.cmd run check`: one pass/fail report. It runs every "must fail" API request (no token, forged token, bad input) and the sign-up, log-in and log-out story in Chrome. It also times 10 requests to each of three API routes. It needs `npm run dev` running.
- `npm.cmd run check -- --live`: the same checks against the live site.
- `npm.cmd run check -- --url=http://localhost:8788`: against any address, for example the local Worker.
- `npm.cmd run check -- --look`: also saves screenshots in `checks/.artifacts` for judging the design.
- `npm.cmd test`: unit tests (the token check now; the settle-up maths later).

The check creates throwaway accounts named `tripsync.check.*@example.com`. Each one is written to `checks/.artifacts/test-accounts.json` before it is created. At the end it is deleted from Firebase and MongoDB, and the deletion is confirmed by trying to log in again. If a run crashes, the next run deletes what it left behind.

## Deploy

- **API:** pushing to `main` redeploys it on Render by itself (when something in `server/` changed). After changing a server dependency, run `npm.cmd run lock:server` and commit `server/package-lock.json`, because Render installs from that file.
- **Website and Worker:** `npm.cmd run deploy` builds the website and uploads it with the Worker.

## API so far

| Route | Who | What |
|---|---|---|
| `GET /api/health/ping` | anyone | Answers without touching the database (keep-awake ping, Render health check) |
| `GET /api/health` | anyone | Checks that MongoDB answers |
| `GET /api/users/me` | logged in | Your TripSync profile, or 404 if not created yet |
| `POST /api/users/me` | logged in | Creates your profile `{ name }`; repeating it returns the existing one |

Errors always come back as `{ "error": "message" }`. API answers are never cached (`Cache-Control: no-store`).

## Design

The visual decisions and the reasons for them are in `docs/DESIGN-DECISIONS.md`.
