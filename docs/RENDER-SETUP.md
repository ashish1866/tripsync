# Moving the API to Render: steps for Ashish

You do the parts that involve secrets or your accounts. Kiro does the rest and never sees the secret values.
About 15 minutes. Everything stays on free plans: if any screen asks for a card or offers a paid plan, stop and tell Kiro.

## Before you start

- The code must be on GitHub first. Send Kiro the repo URL; Kiro pushes, and `render.yaml` arrives in the repo.
- Keep `C:\Users\Asus\tripsync-setup-note.txt` open. You need two values from it.

## Part 1: Render (about 10 minutes)

1. Open https://dashboard.render.com and sign in. "Sign in with GitHub" is easiest, because Render then sees your repos.
2. At the top right, click **+ New**, then **Blueprint**.
3. Under "Connect a repository", find **tripsync**.
   - If it is not listed, click **Configure GitHub** (or "Connect account"), give Render access to the tripsync repo only, then come back.
4. Click **Connect** next to tripsync.
5. Render reads `render.yaml` and shows what it will create. Check:
   - Blueprint name: type `tripsync`
   - Branch: `main`
   - One web service, **tripsync-api**, plan **Free**, region **Singapore**
6. Render asks for two values (these are the ones marked secret in `render.yaml`). Paste each one exactly: no quotes, no spaces before or after.
   - **MONGODB_URI**: the `mongodb+srv://...` link from the note, with your real Atlas password in place of `YOUR_PASSWORD`. Keep `/tripsync_dev` in it, the same as in `server/.dev.vars`.
   - **GEOAPIFY_KEY**: the Geoapify API key from the note. It is not used yet, but Render only asks for these values when the Blueprint is first created, so enter it now.
7. Click the button at the bottom (**Deploy Blueprint** or **Apply**).
8. Click **tripsync-api** to open it, then **Logs**. The first build takes a few minutes. Wait until you see:
   - `TripSync API listening on port 10000`
   - `MongoDB connected`

   The status at the top changes to **Live**.
9. At the top of the service page, under the name **tripsync-api**, there is an address ending in `.onrender.com`. Copy it from there exactly. Someone else already owns `tripsync-api.onrender.com`, so Render adds a few letters to ours (something like `tripsync-api-ab12.onrender.com`). Never type the address from memory: the Worker sends login tokens to it.
10. Paste that address into a browser tab and add `/api/health` to the end. You should see `"mongo":"connected"`.
11. Send Kiro the address. Kiro puts it into `server/wrangler.jsonc` (the `API_ORIGIN` setting), deploys the Cloudflare Worker, and runs the live check.

### If something goes wrong on Render

| What you see in the Logs | What it means | What to do |
|---|---|---|
| `TripSync API settings are incomplete: MONGODB_URI ...` | A value is missing or mistyped | Service page, then **Environment**: fix `MONGODB_URI`, Save. Render redeploys by itself. |
| `MongoDB connection failed: bad auth` | Wrong Atlas password in the link | Same place: fix the password part of `MONGODB_URI`. The note is the source of truth. |
| `MongoDB connection failed: ... timed out` | Atlas is refusing the connection | In Atlas, under **Network Access**, check that `0.0.0.0/0` is still there and Active. |
| `npm ci` errors in the build | The server lockfile is out of date | Tell Kiro (fix: `npm run lock:server`, then push). |

## Part 2: Firebase authorized domain (about 2 minutes)

This lets people log in from the live site. It is the Cloudflare address, not the Render one: the browser never opens pages from Render.

1. Open https://console.firebase.google.com and click the **TripSync** project.
2. In the left menu, open **Authentication** (it may sit under **Build** or **Security**).
3. Click the **Settings** tab at the top, then **Authorized domains**.
4. Click **Add domain** and type exactly:

   `tripsync.ashishbisht.workers.dev`

   No `https://` and no slash at the end. Click **Add**.
5. The list should now show `localhost`, `tripsync-d3e9b.firebaseapp.com`, `tripsync-d3e9b.web.app` and the new address.

Email/Password sign-in is already confirmed working (the check creates and deletes real test accounts), so nothing else in Firebase needs changing.

## Done on 2026-10-11

- Render service: https://tripsync-api-lec8.onrender.com (free, Singapore)
- `API_ORIGIN` in `server/wrangler.jsonc` set to that address, and the Worker deployed with the 10-minute Cron Trigger
- `MONGODB_URI` and `GEOAPIFY_KEY` deleted from the Cloudflare Worker's secrets. The Worker has no secrets now, so the database password lives only on Render and on this PC.
- Firebase authorized domain `tripsync.ashishbisht.workers.dev` added
- `npm run check -- --live` passed

## Good to know

- **Sleeping:** Render's free plan sleeps after 15 minutes with no requests, and waking takes about a minute. The Cloudflare Cron Trigger pings `/api/health/ping` every 10 minutes, so it should stay awake. Before a demo, open `https://tripsync.ashishbisht.workers.dev/status` once anyway.
- **Free hours:** Render gives 750 free instance hours a month per workspace. One service kept awake all month uses at most 744 (31 days), so this fits only if tripsync-api is the only free service in your Render workspace.
- **Changing secrets later:** edit them on the service's **Environment** page. Editing `render.yaml` does not change secrets.
- **Deploys:** every push to `main` that changes something in `server/` redeploys the API by itself.
