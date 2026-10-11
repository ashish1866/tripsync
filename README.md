# TripSync

A website where a group plans a trip together: each day's stops on a map, the forecast for each day, every shared bill, and the shortest list of who pays whom. It does not book anything.

College full-stack project by Ashish Bisht (24BCF10042) and Dhruv Grover (24BCF10010).

Live: https://tripsync.ashishbisht.workers.dev

## What it runs on

- `client/`: React + Vite (the website)
- `server/`: Express API under plain Node (`src/server.js`), with one shared MongoDB connection
- MongoDB Atlas for data, Firebase for sign-up and log-in (TripSync never stores passwords)
- Cloudflare Workers serves the built website

## Run it on your PC

On this PC, PowerShell blocks `npm` scripts, so type `npm.cmd` (or use Command Prompt).

1. Install Node.js 22.12 or newer.
2. Copy `server/.dev.vars.example` to `server/.dev.vars`, and `client/.env.example` to `client/.env`. Fill both in from the private setup note. Both files are git-ignored.
3. Install everything: `npm.cmd install`
4. Create the database indexes (safe to run again): `npm.cmd run setup-db`
5. Start the site and the API together: `npm.cmd run dev`
6. Open http://localhost:5173

`npm run dev` starts Vite on port 5173 and the API on port 8787. The API restarts itself when a file in `server/src` changes. Vite forwards every `/api` request to the API, so there is no CORS setup.

## Check it

- `npm.cmd run check`: one pass/fail report. It opens the local site in Chrome and runs the sign-up, log-in and log-out story. It also sends every "must fail" API request (no token, forged token, bad input). It needs `npm run dev` running. It creates throwaway accounts named `tripsync.check.*@example.com` and deletes them from Firebase and MongoDB when it finishes.
- `npm.cmd run check -- --look`: the same, plus screenshots in `checks/.artifacts` for judging the design.
- `npm.cmd test`: unit tests (the token check now; the settle-up maths later).

## API so far

| Route | Who | What |
|---|---|---|
| `GET /api/health/ping` | anyone | Answers without touching the database (for keep-awake pings) |
| `GET /api/health` | anyone | Checks that MongoDB answers |
| `GET /api/users/me` | logged in | Your TripSync profile, or 404 if not created yet |
| `POST /api/users/me` | logged in | Creates your profile `{ name }`; repeating it returns the existing one |

Errors always come back as `{ "error": "message" }`.

## Design

The visual decisions and the reasons for them are in `docs/DESIGN-DECISIONS.md`.
