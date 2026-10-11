# TripSync

A website where a group plans a trip together: each day's stops on a map, the forecast for each day, every shared bill, and the shortest list of who pays whom. It does not book anything.

College full-stack project by Ashish Bisht (24BCF10042) and Dhruv Grover (24BCF10010).

Live: https://tripsync.ashishbisht.workers.dev

## What it runs on

- `client/`: React + Vite (the website)
- `server/`: Express API, running inside a Cloudflare Worker (`src/worker.js`) or under plain Node (`src/server.js`)
- MongoDB Atlas for data, Firebase for sign-in

## Run it on your PC

On this PC, PowerShell blocks `npm` scripts, so type `npm.cmd` (or use Command Prompt).

1. Install Node.js 22.12 or newer.
2. Copy `server/.dev.vars.example` to `server/.dev.vars`, and `client/.env.example` to `client/.env`. Fill both in from the private setup note. Both files are git-ignored.
3. Install everything: `npm.cmd install`
4. Create the database indexes (safe to run again): `npm.cmd run setup-db`
5. Start the site and the API together: `npm.cmd run dev`
6. Open http://localhost:5173

`npm run dev` starts Vite on port 5173 and the Worker (`wrangler dev`) on port 8787. Vite forwards every `/api` request to the Worker.

## Check it

- `npm.cmd run check`: opens the local site in Chrome and prints a pass/fail list (needs `npm run dev` running)
- `npm.cmd run check -- --live`: the same checks against the live site
- `npm.cmd test`: unit tests for the pure maths in `server/src/utils`

## Deploy

`npm.cmd run deploy` builds the website and uploads it with the Worker. Secrets are stored on Cloudflare, not in this repo: set them once with `npx.cmd wrangler secret put MONGODB_URI` (and `GEOAPIFY_KEY`) from the `server` folder.

## Design

The visual decisions and the reasons for them are in `docs/DESIGN-DECISIONS.md`.
