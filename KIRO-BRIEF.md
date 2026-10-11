# TripSync: Brief for Kiro IDE

Written 2026-10-11 by the instructor (the Kiro Crew assistant) for Kiro IDE.
Owners: Ashish Bisht (24BCF10042) and Dhruv Grover (24BCF10010). College full-stack project, demoed and examined in a viva.

---

## 0. How to read this file

This file has two halves, and they never overlap.

1. **The product and technical contract (sections 2-6, 8).** This is *what* to build and *what it runs on*. It is fixed, because it comes from decisions already made and from services already set up.
2. **The design section (section 7).** This is *only a list of things not to do*. It never says what the site should look like. Everything not banned there is yours to decide, and you have full creative freedom over it.

Rules that keep this file consistent:
- If a design rule and a product rule ever seem to clash, the product contract wins on *behavior* (what a feature does) and section 7 wins on *appearance* (how it looks). They cannot truly clash, because one is about behavior and the other about looks.
- Nothing in this file names a recommended font, color, layout, or visual style. If you catch yourself copying a value from any example (this file's, another site's, a tutorial's), that value is a default, not a decision. See 7.6.
- If something is not covered here, decide it yourself, write the decision down (7.11), and carry on. Do not stall.

---

## 1. Who does what

| Who | Job |
|---|---|
| **Kiro IDE (you)** | All the code. Every file, every command, every design decision. |
| **The instructor** | Wrote this brief. Does **not** write, edit or run any of the project's code. |
| **Ashish** | Drives Kiro IDE, gives the go-ahead for each step, has the final say on how it looks. |
| **Dhruv** | Tests each finished step with a second account. Builds the demo data (the Manali trip and its bills). Writes the synopsis. |

Because this is examined in a viva, **the code must be explainable by two students**:
- Plain JavaScript (no TypeScript), small files, clear names.
- The logic examiners ask about gets short plain-language comments: token check, trip-membership check, role check, settle-up maths, budget aggregation, weather cache, nearest-first ordering.
- No clever abstractions that two students could not explain out loud.

---

## 2. What TripSync is

A website where a group plans a trip together. It keeps the plan, the map, the weather and the money in one place.

**TripSync does not book flights, hotels or taxis.** It is a collaborative travel-planning and trip-management platform. It uses outside APIs for location, weather and nearby places. Do not add payment, booking or live-traffic features.

Academic title: *TripSync: A Collaborative Full-Stack Travel Planning and Expense Management Platform.*

---

## 3. Product contract (what must exist)

### 3.1 Roles

Every trip has members, and each member has one role.

| Action | Owner | Editor | Viewer |
|---|---|---|---|
| See trip, map, weather, expenses | yes | yes | yes |
| Add/edit activities and checklist items | yes | yes | no |
| Add expenses | yes | yes | no |
| Edit/delete an expense | any | only their own | no |
| Invite people | yes | no | no |
| Change roles, remove members | yes | no | no |
| Edit trip name, dates, budget | yes | no | no |
| Delete the trip | yes | no | no |

The UI must hide what a role cannot do. The API must **also** refuse it (403). Hiding a button is never the security.

### 3.2 Features

| Feature | What the user gets | Priority |
|---|---|---|
| Account | Sign up, log in, log out, stay logged in (Firebase) | Core |
| Trips | Create, edit, delete; all trips on one page | Core |
| Destination search | Type "Man", pick "Manali, Himachal Pradesh" from suggestions | Core |
| Itinerary | One day per trip date; activities with time and notes | Core |
| Map | Pins for the destination and every activity | Core |
| Weather | Forecast per trip day, shown on that day | Core |
| Rain warning | Warn when a day with planned activities has rain chance above 60% | Core |
| Members | Invite link/code, joining, roles | Core |
| Expenses | Add a bill, pick who paid, split equally or by exact amounts | Core |
| Budget | Spent vs budget, plus a breakdown by category | Core |
| Settle up | Shortest list of "A pays B", plus a "Mark as paid" action | Core |
| Checklist | Shared packing list, tickable | Core |
| Explore | Nearby cafes, attractions, hotels, restaurants on the map, with "add to day N" | Core (second day of the build) |
| Best order | Reorder a day's stops nearest-first | Extra |
| Filters and pages | Filter expenses by category or person; 20 per page | Extra |
| AI planner, live co-editing, currency conversion, email, installable app | Not now (future scope) | Later |

### 3.3 The user story (every step must be possible)

1. A person opens TripSync, signs up (name, email, password), and is logged in.
2. They land on their trips (empty at first) and create a trip: destination (searched), dates, budget. One day per date is created automatically.
3. The trip has: Overview (weather, budget progress, members), Itinerary + map, Explore, Members, Expenses + Settle up, Checklist.
4. They add activities to days (by hand with a place search, or from Explore). Pins appear on the map.
5. A day with a bad forecast and planned activities shows a rain warning.
6. The owner creates an invite (role: Editor or Viewer, valid 7 days) and shares the link. A friend opens it, logs in if needed, comes back to the same page, and joins.
7. Members add expenses. Budget and balances update.
8. Anyone opens Settle up and sees who owes whom. A payment made in real life is recorded with "Mark as paid".
9. Everyone ticks off the packing list.

### 3.4 Screens (the minimum that must exist, not a layout)

| URL | Purpose |
|---|---|
| `/` | Landing, with sign up and log in |
| `/register`, `/login` | Auth forms with real error messages |
| `/trips` | All my trips (name, dates, member count, spent vs budget) |
| `/trips/new` | Create trip with destination search |
| `/trips/:id` | The trip: overview, itinerary, explore, members, expenses, checklist |
| `/join/:code` | Invite page |
| `*` | Not found |

You may organize tabs, panels, navigation and page flow however you think is best, as long as every capability above is reachable. Every screen needs four states designed on purpose: loading, empty, error, and filled.

---

## 4. Technical contract (what it runs on)

### 4.1 Architecture

```text
Browser (React, served by the same Cloudflare Worker)
   |  1. sign up / log in
   +--> Firebase Auth --> returns an ID token (valid 1 hour)
   |
   |  2. every API call carries that token (get a fresh one each call via getIdToken())
   v
Cloudflare Worker (Express API under /api, plus the built React app for everything else)
   |  3. verify the token with jose against Google's public keys
   |  4. check: is this user a member of this trip? does the role allow it?
   v
MongoDB Atlas (plain `mongodb` driver)
```

One URL for site and API, so no CORS setup in production.

### 4.2 Stack

| Layer | Use |
|---|---|
| Frontend | React + Vite, plain JavaScript, React Router, Axios, Leaflet + react-leaflet (OpenStreetMap tiles), Recharts for the budget chart |
| Styling | Tailwind CSS is in the plan, but **you may use any CSS approach, font host, animation or UI library you think serves the design**. Section 7 bans specific *looks*, not tools. Raw framework defaults are a banned look (7.4, 7.5). |
| Backend | Node.js, Express 5, plain `mongodb` driver (not Mongoose), `jose` (Firebase token check), `zod` (input validation), built-in `fetch` for outside APIs |
| Auth | Firebase Authentication (Email/Password, optionally Google). **No passwords are stored by us.** No `bcryptjs`, no `jsonwebtoken`, no `JWT_SECRET`. |
| Database | MongoDB Atlas (free M0, AWS Mumbai) |
| Outside APIs | Open-Meteo (weather and city search, no key), Geoapify (nearby places and place search, key), OpenStreetMap (tiles) |
| Hosting | Cloudflare Workers Free |

**Keep the backend portable.** Write it so the same Express app runs (a) inside a Cloudflare Worker and (b) under plain Node. Only one small entry file differs (`worker.js` vs `server.js`). If Cloudflare causes trouble near the demo, the API can move to Render with no rewrite.

Cloudflare facts to verify against current docs before relying on them (APIs change): running Express through `httpServerHandler` from `cloudflare:node`, the `nodejs_compat` flag, and static-assets config. Free Workers allow 10 ms of CPU per request (waiting on Atlas or APIs does not count).

### 4.3 Folder structure

```text
tripsync/
  KIRO-BRIEF.md        (this file)
  docs/DESIGN-DECISIONS.md   (you write this, see 7.11)
  client/
    src/ api/  context/  components/  pages/  utils/
  server/
    src/ config/  middleware/  routes/  controllers/  services/  utils/
    wrangler.jsonc   .dev.vars   .dev.vars.example
```

`services/` holds outside API calls (weather, geo, places). `utils/` holds the pure maths (settle-up, distance) so they can be unit tested.

### 4.4 Database (plain driver, six collections)

You do not have Mongoose models, so describe each shape with zod and create indexes in a small setup script.

```text
users          firebaseUid (unique), name, email, createdAt
trips          name, budget (paise), startDate, endDate, owner (firebaseUid)
               destination: { name, state, country, location: [lng, lat] }
               members:   [ { uid, role, joinedAt } ]
               days:      [ { dayNumber, date, activities: [ { id, title, time, notes, place: { name, location } } ] } ]
               checklist: [ { id, text, done, addedBy } ]
expenses       tripId, title, amount (paise), category, paidBy, date, createdBy,
               type: "expense" | "settlement",
               splits: [ { uid, share } ]      (shares add up to amount exactly)
places         placeId (unique), name, category, address, location [lng, lat], fetchedAt
weatherCache   key ("32.24,77.19"), data, createdAt        (TTL: 3 hours)
invites        code (unique), tripId, role, createdBy, createdAt   (TTL: 7 days)
```

Indexes: `users.firebaseUid` unique, `trips.members.uid`, `expenses.tripId`, `places.location` 2dsphere, TTL on `weatherCache.createdAt` and `invites.createdAt`.

Two rules that prevent bugs:
- **Money is stored as whole paise** (Rs 8,000 is `800000`). Never floats.
- **MongoDB coordinates are `[longitude, latitude]`.** Leaflet wants `[lat, lng]`. Geoapify filters use `lon,lat`. Convert in one place, on purpose.

### 4.5 API (all under `/api`, JSON in and out)

Every route needs a valid Firebase token except `GET /invites/:code` (preview). Errors always come back as `{ "error": "message" }`. Status codes: 200, 201, 400 bad input, 401 not logged in, 403 not allowed, 404, 409 conflict, 500 (generic message; log the real error on the server).

| Area | Routes | Who |
|---|---|---|
| Users | `POST /users/me` (create profile after first login), `GET /users/me` | Logged in |
| Trips | `GET /trips`, `POST /trips`, `GET /trips/:id` | Members |
| | `PATCH /trips/:id`, `DELETE /trips/:id` | Owner |
| Search | `GET /geo/destinations?q=` (cities), `GET /geo/spots?q=&tripId=` (specific places) | Logged in |
| Itinerary | `POST /trips/:id/days/:day/activities`, `PATCH`/`DELETE /trips/:id/activities/:actId` | Owner, Editor |
| | `GET /trips/:id/days/:day/best-order` | Members |
| Weather | `GET /trips/:id/weather` | Members |
| Places | `GET /trips/:id/places?category=&radius=` | Members |
| Members | `POST /trips/:id/invites` | Owner |
| | `GET /invites/:code`, `POST /invites/:code/join` | Preview public, join logged in |
| | `PATCH`/`DELETE /trips/:id/members/:uid` | Owner (or yourself to leave) |
| Expenses | `GET /trips/:id/expenses?category=&page=` | Members |
| | `POST`/`PATCH`/`DELETE /trips/:id/expenses/...` | Owner, Editor (editors only their own) |
| Money | `GET /trips/:id/budget`, `GET /trips/:id/settlements` | Members |
| | `POST /trips/:id/settlements` ("Mark as paid") | Owner, Editor |
| Checklist | `POST`/`PATCH`/`DELETE /trips/:id/checklist/...` | Owner, Editor |

### 4.6 The guard chain (examiners will ask)

```text
Request -> token valid? -> member of this trip? -> role allows this? -> body valid (zod)? -> do the work
             no: 401         no: 403                no: 403             no: 400
```

The membership check is the most important line in the project. Without it, changing a trip id in the URL would expose another group's trip.

### 4.7 Logic

**Token check.** With `jose`: algorithm RS256, keys from Google's Firebase JWKS endpoint (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`; confirm in Firebase docs), issuer `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`, audience `<FIREBASE_PROJECT_ID>`, not expired. Do **not** use `firebase-admin` on Workers.

**Settle up.**
1. For each person: balance = what they paid minus their share.
2. Split into people owed money (positive) and people who owe (negative).
3. Repeatedly: the biggest debtor pays the biggest creditor as much as possible, until all are zero.

Example: Ashish paid Rs 8,000, Rahul paid Rs 2,000, four people share it, each share Rs 2,500. Balances: Ashish +5,500, Rahul -500, Ankit -2,500, Rohan -2,500. Result: Ankit pays Ashish 2,500, Rohan pays Ashish 2,500, Rahul pays Ashish 500.

Rounding: split in whole paise and give the leftover paise to the first people, so shares always add up exactly (Rs 1,000 over 3 = 33,333 + 33,333 + 33,334 paise). Reject any split that does not add up to the total (400, "Splits must add up to Rs X").

"Mark as paid" is stored as an expense of `type: "settlement"` where the payer pays the full amount "for" the receiver. The same balance maths then reaches zero with no extra logic.

**Budget.** One MongoDB aggregation grouping expenses by category. Settlements are excluded from spending totals.

**Weather.**
1. Round the trip location to 2 decimals, so nearby trips share a cache entry.
2. Look in `weatherCache`; if present, return it.
3. Else call Open-Meteo `forecast?daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto`, store it, return it.
4. The forecast only reaches about 16 days ahead. Beyond that, say the forecast appears closer to the trip. Do not invent weather.
5. Weather codes are numbers; map them to labels and visuals yourself.

**Places.** Geo query on `places` first; if empty, call Geoapify Places (`categories`, `filter=circle:lon,lat,radius`), save, return. Geoapify gives no star ratings, so show category, address and distance. Never show a rating you do not have.

**Best order.** Start at the first stop and keep choosing the nearest unvisited stop. Distance is straight-line (Haversine). Say so in the UI or docs honestly; mountain roads are longer.

**Safe edits.** Use `$push`/`$pull`/positional updates for one item. Never load a whole trip, edit it in memory and write it back, because that wipes out someone else's simultaneous edit.

**Dates to days.** Create one day per date at trip creation. If the owner shortens the trip, refuse when the removed days still have activities and explain why.

### 4.8 Edge cases that must be handled

| Situation | Behavior |
|---|---|
| Viewer tries to add an expense | Button hidden **and** API returns 403 |
| Invite expired | "This invite has expired, ask the owner for a new one." |
| Joining a trip you are already in | "You're already in this trip." |
| Owner tries to leave | Not allowed; they can delete the trip |
| Removing a member who still owes money | Blocked until settled |
| Trip deleted | Its expenses and invites are deleted too |
| Weather or places API down | Only that box shows an error; the rest of the page works |
| Invite link while logged out | Log in, then return to the same invite page |
| Firebase token expired | Fetch a fresh one with `getIdToken()`; on repeated 401, log out |

### 4.9 Security

- Keys and the Atlas link live only in server secrets. Anything starting with `VITE_` is public in the browser.
- zod-validate every body, param and query. Use `$`-operator-safe queries (never pass raw user objects into a filter).
- CORS needed only for local development (Vite on 5173, Worker on 8787) unless the proxy removes the need.
- Rate-limit invite joins and outside-API routes in a Workers-friendly way (no Node-only middleware that breaks the Worker).
- Generic 500 messages; real errors only in server logs.
- Token kept by the Firebase SDK. Known limitation to state honestly in the synopsis: browser storage is acceptable for a college project, httpOnly cookies are stronger.

### 4.10 Testing

- **Vitest** on the pure functions: settle-up (equal split, uneven split, rounding, everyone settled, one person paid everything), budget grouping, nearest-first order, date-to-day generation.
- Each API route has a saved request (Postman or a script), including the "must fail" ones (viewer adds expense gives 403; stranger reads trip gives 403).
- Two-account run: Ashish in a normal window, Dhruv in incognito.
- Browser checks must be **scripted as one command that returns one short pass/fail report** (Playwright or similar), not a long chain of screenshot-and-look steps. Take a screenshot only when a step fails or when the *look itself* must be judged.

---

## 5. Services and credentials (already created, do not recreate)

All account setup is done. Secrets live in one private note on Ashish's PC:

`C:\Users\Asus\tripsync-setup-note.txt`

Read it for the values. **Do not copy secrets into this repo, this file, chat, logs, commit messages or screenshots.**

| Service | Facts (non-secret) | Where the value goes |
|---|---|---|
| MongoDB Atlas | Cluster `tripsync`, free M0, AWS Mumbai. Database user `tripsync_app`. Network access `0.0.0.0/0` (Cloudflare has no fixed IP). Use database **`tripsync_dev`** for development. | `MONGODB_URI` in `server/.dev.vars` (local) and `wrangler secret put` (live) |
| Firebase | Project **TripSync**, ID `tripsync-d3e9b`, free Spark plan, web app `tripsync-web`, Email/Password sign-in turned on. | Public web config into `client/.env` as `VITE_FIREBASE_*`. The project ID is also needed by the server for token checks. |
| Geoapify | Project TripSync, key tested on a Manali cafe search. | `GEOAPIFY_KEY` in `server/.dev.vars` and `wrangler secret put`. **Never in the client.** |
| Cloudflare | `wrangler` is already logged in on this PC. No domain needed. The `workers.dev` subdomain is chosen at first deploy. | `server/wrangler.jsonc` (no secrets in it) |

Rules:
1. Create `.gitignore` **before the first commit**. It must cover `.dev.vars`, `.env`, `.env.*` (but not the `.example` files), `node_modules`, `dist`, `.wrangler`.
2. Commit only `.dev.vars.example` and `.env.example` with empty values.
3. Never use or move the file `atlas-credentials.env` in Ashish's Downloads folder.
4. The Atlas password was shown in an earlier chat, so Ashish may change it. If a connection fails with "bad auth", the note is the source of truth; ask Ashish to update it. Do not guess passwords.
5. Firebase's Email/Password switch was saved but never visually confirmed. If sign-up fails with `auth/operation-not-allowed`, tell Ashish to open Authentication, then Sign-in method, and enable Email/Password.
6. After the first deploy, Ashish must add the live `workers.dev` address under Firebase, then Authentication, then Settings, then Authorized domains. Tell him exactly which address.
7. Stay on free plans. If any service suggests upgrading, stop and tell Ashish.

---

## 6. Build order and reporting

Build one feature at a time: API and screen together, fully working before the next one starts. Like building room by room; if time runs out, finished rooms exist.

| Step | Build | Done when |
|---|---|---|
| 0 | Project setup, MongoDB connection, one-command local dev, **day-one test deploy** | Server logs "MongoDB connected"; React page opens; a tiny deployed Worker reads one Atlas document and its CPU time in Workers Logs is under 10 ms |
| 1 | Auth: sign up, log in, log out, protected pages, token check on the Worker, `users/me` | Logged-out visitor is sent to login; a real Firebase user gets a profile in MongoDB |
| 2 | Trips: create, list, edit, delete, destination search with map point | "Manali Trip" shows with its location |
| 3 | Itinerary and map: days, activities, pins | Day 2 shows Solang Valley and a pin |
| 4 | Weather with 3-hour cache and rain warning | Forecast shows; a second visit does not call Open-Meteo again |
| 5 | Members: invite code, join, roles, role enforcement | Dhruv joins from his own account; a Viewer is refused (403) on write routes |
| 6 | Expenses, budget breakdown, settle up, mark as paid | Rs 8,000 hotel split 4 ways shows "Rahul owes Ashish Rs 2,000"-style results that sum correctly |

Later: Explore (Geoapify nearby places), packing checklist, polish, best-order, filters, deploy hardening.

**Day-one test (Step 0).** Before building features, deploy a tiny Worker that registers or reads one user and reads one document from Atlas, then check CPU time in Workers Logs.
- Under 10 ms: stay all-Cloudflare.
- Error 1102: report it to Ashish with the numbers. The fallback is moving only the API to Render; the portable code makes that a small change.

**Local run.** One command (`npm run dev`) must start the React dev server (5173) and `wrangler dev` (8787), with Vite proxying `/api` to the Worker. Do not use Cloudflare's Vite plugin (known clash with the MongoDB driver). Do not use the Firebase emulator (needs Java; real Firebase already allows localhost).

**After each step, report in this shape:**
1. What now works and how Ashish can see it (URL or click path).
2. What you tested and the result.
3. What you could **not** verify.
4. The design decisions you made or changed (7.11).

Stop after each step unless Ashish says to continue.

---

## 7. Design: what NOT to do

### 7.1 Your freedom

You may choose the direction, the typefaces, the colors, the layout, the shapes, the motion, the illustration or photography approach, the voice of the writing, the names of things in the UI, and the structure of every screen. Nobody is handing you a mood board. Surprise us.

The only limit is **AI slop**: the generic look that interchangeable AI-built sites share. This section defines it so you can avoid it. It does not tell you what to do instead.

### 7.2 What AI slop is, and why it happens

Image and code models predict what is *most likely*. For web design, the most likely output is the average of a decade of Tailwind tutorials, starter templates and component-library demos. That average is the same everywhere, so every AI-built site looks like every other one: a dark or white page, a purple-to-blue gradient, one neutral sans-serif, a centered headline over three identical rounded cards with little icons, and copy that could describe any product.

Key facts, drawn from published analyses:
- Studies of AI-built sites (including a scan of about 1,400 recent Show HN projects) found the same cluster again and again: centered titles on about a quarter of sites, untouched shadcn defaults on about a quarter, a few "friendly free fonts" on about 16%, frosted-glass blur on about 17%, colored side-border cards on about 13%, vague stat strips on about 12%, indigo buttons on about 11%.
- The purple gradient is traced to Tailwind's old default of `indigo-500` buttons. The model did not choose purple; purple is the average.
- **Replacing one default with another does not fix it.** In 2024 the tell was a purple gradient on a dark hero. In 2026 the tell is a warm cream page with a serif display font and a sage or terracotta accent (the current "Claude look"), and a near-black page with one acid-green accent. Designers and users spot these just as quickly.
- Layout is where most sameness lives, not color. A page can dodge every color cliche and still read as generated if its structure is the standard template.
- A tell is *a default nobody chose*. It is not a banned color or a banned shape for all time. That is why section 7.3 has two levels.

### 7.3 Two levels of ban

| Level | Meaning |
|---|---|
| **HARD BAN (7.4)** | Never, in any form, with no exception. A layperson recognizes these as AI-made. |
| **DEFAULT BAN (7.5)** | Banned **unless** you record, in `docs/DESIGN-DECISIONS.md`, a reason tied specifically to TripSync's subject (travelers, mountains, group money, shared plans). "It looks modern", "it is clean", "it is popular" and "it felt right" are not reasons. If the reason would be equally true for any other app, it is not a reason. |

### 7.4 HARD BANS

**Color**
- H1. Any purple, indigo or violet gradient, or an indigo-to-blue or violet-to-cyan gradient, anywhere: background, glow, button, border, shadow, chart, text.
- H2. Gradient-filled text (`background-clip: text` with a transparent fill, or `bg-clip-text text-transparent`), on headings, numbers or anything else.
- H3. Colored glow shadows (a vivid shadow under cards or buttons) and neon accents on dark backgrounds.
- H4. Raw framework color defaults used as the identity: Tailwind's `indigo-*`, `violet-*`, `purple-*` as the brand color; untouched `zinc`/`slate`/`neutral` shells.
- H5. Body or muted text below WCAG AA contrast (4.5:1).

**Type**
- H6. Inter, Roboto, Arial, Open Sans, or the system font stack (`system-ui`, `-apple-system`) as the *only* typeface, or with no deliberate pairing decision.
- H7. A font named in CSS that is never actually loaded. Declared is not shipped. Confirm in the rendered page.

**Layout**
- H8. The centered hero template: small pill badge, centered headline, centered sub-line, one or two centered buttons.
- H9. A row of three (or six) identical cards, each with a small icon, a short title and two lines of text.
- H10. Cards nested inside cards.
- H11. Untouched shadcn/ui, or any component library left on its default theme, default radius and default look.

**Icons and imagery**
- H12. Emoji used as icons, bullets or navigation (for example airplane, globe, mountain, camera, money bag). Emoji only as real user-written content.
- H13. A sparkle (the four-point star or sparkle emoji) as a brand or "AI" marker; `Sparkles`, `Zap`, `Rocket`, `Shield` icons used for their cliche meaning.
- H14. Stock "smiling team at a laptop", glossy 3D blobs, "Corporate Memphis" faceless people, and generic stock travel photos (sunset beach, hot-air balloon, solo hiker on a peak).
- H15. Gray placeholder boxes standing in for imagery, avatars or screenshots in anything shipped.
- H16. Fake window chrome (red/yellow/green dots) used as a hero visual, and a fake terminal.

**Fabricated proof**
- H17. Invented numbers: "10,000+ travelers", "4.9 stars", "99.9% uptime", fake testimonials, fake avatars (pravatar, DiceBear), logo walls of companies that are not customers, invented badges. If a number is shown, it is real data from the database.
- H18. Count-up number animations as theater.

**Copy**
- H19. Vague headlines that could describe any product: "Build the future of...", "Your all-in-one platform", "Elevate your...", "Transform your...", "Unlock...", "Unleash...", "Supercharge...", "Revolutionize...", "Scale without limits".
- H20. Filler words: *seamless / seamlessly, effortless / effortlessly, empower, cutting-edge, next-generation, game-changer, best-in-class, robust, streamline, leverage, harness, delve*.
- H21. Travel-brochure cliches: "Plan your dream vacation", "Your journey begins here", "Adventure awaits", "Embark on", "Wanderlust", "Explore the world", "Create unforgettable memories", "Welcome back, Traveler!".
- H22. Three-word slogans in a row ("Plan. Share. Split." / "Faster, smarter, simpler").
- H23. Arrow glyphs stuck on button text ("Get started ->", "Learn more ->").
- H24. Generic button labels: "Submit", "Click here", "Learn more", "Get started". Name the action and its object.
- H25. Generic error copy: "Oops! Something went wrong", "An error occurred".

**Leftovers**
- H26. Any template leftover in the shipped site: the Vite or React logo, the default favicon, the page title "Vite + React", lorem ipsum, "TODO", sample text, "Hello World", counter demos.

### 7.5 DEFAULT BANS (allowed only with a logged, subject-specific reason)

**Whole-page looks (the "tasteful escape" defaults)**
- D1. Near-black page with a single acid-green, lime or vermilion accent, often with monospace type. Also any dark theme chosen because dark "feels premium", and any light/dark toggle nobody asked for.
- D2. Warm cream or parchment page with a terracotta, clay, rust or sage/forest-green accent and a high-contrast serif display face.
- D3. "Broadsheet cosplay": hairline rules everywhere, zero radius, newspaper columns and a masthead on something that is not a publication.
- D4. Reflexive "handmade" styling (grain, scrapbook collage, hand-drawn scribbles, retro or brutalist costume) used mainly to look human. Legitimate only if the subject earns it.
- D5. Emerald or teal as the one accent on an otherwise neutral page, when nothing in the product calls for green.
- D6. A palette of several colors at similar weight with no dominant color and no sharp accent (timid and evenly spread). Likewise two swatches of nearly the same hue pretending to be two colors.

**Type**
- D7. The "friendly free font" cluster: Space Grotesk, Geist, Syne, Sora, Instrument Serif, Fraunces, Playfair Display, Cal Sans, and the commonly reached-for Poppins, Montserrat, Plus Jakarta Sans, Manrope, Outfit, DM Sans, Nunito. Also do not reuse any typeface Ashish used in another project of his.
- D8. One family, one weight, headings barely larger than body (a flat scale with no hierarchy decision).
- D9. One word in a headline singled out by color, italic, highlighter or serif-italic ("The *modern* way to...").
- D10. Template chrome: a tracked, all-caps small label above every heading; `A · B · C` metadata strings; `WORD - fragment` labels; monospace for small decorative labels; Title Case on everything; `->` on every link.
- D11. Decorative `01 / 02 / 03` markers on things that are not a real sequence.

**Layout and composition**
- D12. A fixed section order of hero, logos, features, how-it-works, testimonials, stats, FAQ, final call-to-action, four-column footer. Test: shrink the page to a thin silhouette; if it matches any competitor's, the structure is slop.
- D13. Everything centered, every section in the same container width, even spacing everywhere with no rhythm.
- D14. A bento grid used because it is trendy rather than because tiles differ in importance.
- D15. A stat strip (big number over small label) or a dashboard of "hero metric" tiles with a gradient accent.
- D16. A numbered 1-2-3 "How it works" that is not truly ordered.
- D17. A four-column footer with newsletter box and social icons when none of it exists.

**Surfaces and components**
- D18. The same large radius plus the same soft gray shadow on every surface; a one-pixel gray border on every card; the "ghost card" (hairline plus wide diffuse shadow).
- D19. Frosted glass (`backdrop-blur` on translucent surfaces) applied by reflex. Fine for real layering such as a navigation bar over scrolling content or a modal.
- D20. Colored left or top border stripes on cards.
- D21. An icon centered in a tinted rounded square, one per feature; the default icon set used unedited.
- D22. A pill badge above the title; status chips and badges on every row with no real state behind them.
- D23. The default dark "SaaS card" (`zinc-900` surface with a faint white hairline border).

**Motion**
- D24. The same fade-and-rise on scroll for every section.
- D25. Bounce, overshoot or elastic easing on interface motion.
- D26. Stock effect-library pieces used as shipped: spotlight, background beams, meteors, shimmer buttons, sparkles, marquees, 3D tilt cards, the blurred animated glow behind a product shot.
- D27. Many random hover micro-animations with no shared motion language.

**TripSync-specific defaults**
- D28. Leaflet's default blue marker and an unthemed map frame left exactly as installed.
- D29. Recharts' default rainbow palette, default tooltip and default legend.
- D30. Browser-default form controls, native `alert()` / `confirm()` dialogs, and a toast library left on its default look.
- D31. A big gray icon plus "No data found" as the empty state; a lone spinner as the only loading state.
- D32. A fintech look borrowed wholesale for the expense screens (dark navy, neon green positive numbers, red negative numbers on black) without a reason.

### 7.6 The trap of swapping one default for another

- Never fix a banned value by dropping in the *next most likely* value. Purple replaced by emerald is still a default. Inter replaced by Space Grotesk is still a default.
- This file names **no** recommended font, hex code, spacing scale or layout, on purpose. Anything copied from an example, a tutorial, another site or this file's ban lists is a default, not a decision.
- The test for any choice: *"Would I have arrived at this for any similar app?"* If yes, it is a default. Search outward from TripSync's own world instead (places, journeys, shared money, the feel of planning together) and be able to say why.
- Restraint is allowed. A minimal design that is a deliberate decision is not "timid". A minimal design that is just "nothing chosen" is.

### 7.7 Where travel and expense apps go wrong (so you can avoid it)

- Hero built around a stock destination photo with an overlaid headline and a search bar.
- Globe, compass, passport, plane or suitcase icons as the entire visual language.
- "Destination cards" with a stock photo, a star rating and a heart icon, when we have no photos and no ratings.
- A dashboard of cheerful gradient tiles for budget, with a donut chart in default colors.
- Money screens that celebrate with confetti or emoji.
- Itinerary rendered as a plain vertical timeline of identical rows with a dot and a line.
- Weather as a row of default cartoon-sun icons.
- Maps with only the default tile look and default pins, framed in a rounded card with a shadow.
- Member lists as a row of overlapping gradient-ringed circles.

### 7.8 Craft floor (these are quality rules, not style rules)

They never limit how the site looks.

- Contrast meets WCAG AA. Keyboard focus is clearly visible. Everything works with the keyboard.
- Motion respects `prefers-reduced-motion`.
- Every interactive element has designed hover, active, focus, disabled, loading and error states. Forms show field-level errors.
- Every screen has designed loading, empty, error and filled states.
- Text never overflows, truncates mysteriously or collides with other elements. Check long trip names and large amounts.
- Works on a laptop width and a phone width. The whole story must be usable on both.
- Money is shown in rupees with Indian digit grouping (for example via `Intl.NumberFormat('en-IN')`); dates are readable and consistent.
- The map shows "© OpenStreetMap contributors" visibly (a legal requirement).
- The shipped site has its own page title, favicon and name (see H26).
- Demo and test data are realistic (the Manali trip, real-sounding bills), never lorem ipsum.

### 7.9 Consistency (the other half of looking human)

AI sites often fall apart *across pages*: a new page quietly changes the font, radius or palette because the model rebuilt it from scratch. Avoid this.

- One set of design tokens (colors, type scale, spacing, radius, shadow, motion timings) in one place. Every page uses them.
- Shared components (navigation, buttons, inputs, cards, modals, toasts) are built once and imported, never re-written per page.
- Before finishing any step, open two different screens side by side and confirm they clearly belong to the same product.
- If Ashish chooses a font, color or style himself, that choice is the contract. Match it exactly on every new screen, even if you would have picked differently.

### 7.10 Process bans

- Do not start the UI before writing the first entry of `docs/DESIGN-DECISIONS.md`.
- Do not ship placeholder content you plan to "fix later".
- Do not add a library only for a banned effect.
- Do not "audit" by grep alone. Search for banned values (see the checklist), but a clean search is not proof of good design.

### 7.11 The decision log (the one required document)

Create `docs/DESIGN-DECISIONS.md` before any UI code and keep it current. Short and honest. It must contain:

1. **Who uses this and what are they doing** (in your own words, specific to TripSync).
2. **The direction, named concretely.** Not "modern and clean", which means nothing.
3. **Typeface choice and the reason**, tied to the subject.
4. **Color choice and the reason**, tied to the subject. State the dominant color and what the accent is *for*.
5. **Layout idea and the reason.** What does the page do first, and why?
6. **Any DEFAULT BAN item you chose to use, with its subject-specific reason.**
7. **What you deliberately did not do.**

Update it whenever a decision changes. Ashish reads it. It is also useful in the viva.

### 7.12 Self-check before reporting any step

1. **Search the code** for banned values: `indigo`, `violet`, `purple`, `bg-clip-text`, `text-transparent`, `backdrop-blur`, `shadow-.*/` colored shadows, `font-family: Inter`, `system-ui`, `Sparkles`, `lorem`, `TODO`, `Vite + React`, `animate-bounce`, and emoji in JSX. Fix every hit or log the reason.
2. **The believe-it test.** If someone were told "AI made this", would they believe it immediately? If yes, it is not finished.
3. **The swap test.** Replace TripSync's name and logo with another app's. If the page still works unchanged, it is generic.
4. **The silhouette test.** Shrink the page until only blocks remain. Does the structure look like every landing page?
5. **The squint test.** Shrink to 25%. If every section weighs the same, there is no hierarchy.
6. **The two-screen test.** See 7.9.
7. **Scripted verification.** One command, one short pass/fail report. Screenshot only on failure or when judging the look.
8. **Ashish has the last word on taste.** If he says it looks AI-made, treat that as a failed test and change it.

---

## 8. Traps that waste hours

| Trap | Fix |
|---|---|
| `npm` blocked in PowerShell ("running scripts is disabled") | Use Command Prompt, or type `npm.cmd` / `npx.cmd` |
| Map tiles look jumbled | Import Leaflet's CSS |
| Map pins missing | Vite breaks Leaflet's default marker image paths; import or replace the marker images |
| Pins in the wrong country | Coordinate order (4.4) |
| Refresh on a deep URL gives 404 | Single-page-app fallback to `index.html` in the Worker's static assets config |
| MongoDB driver clashes with Cloudflare's Vite plugin | Do not use the plugin; run Vite and `wrangler dev` as two processes |
| Atlas "bad auth" | Wrong password in the link, or `<` `>` left in, or special characters in the password |
| Atlas connection times out | Network Access not active, or `0.0.0.0/0` missing |
| Firebase `auth/unauthorized-domain` on the live site | Add the live address under Authorized domains |
| Token expires after one hour | Call `getIdToken()` before every request instead of storing one token |
| Weather shows nothing for far-off trips | Forecast covers about 16 days; show the explanatory message |
| TTL deletes are not instant | They run about once a minute; also check expiry in code |
| Worker is fine locally but fails live | Local does not enforce the 10 ms CPU limit; deploy early and check Workers Logs |

---

## 9. Final checklist (before Ashish calls it done)

- [ ] Every Core feature in 3.2 works end to end with two real accounts.
- [ ] Viewer cannot write; stranger cannot read another trip (tested, 403).
- [ ] Settle-up tests pass, including rounding.
- [ ] No secret in the repo or its history; `.gitignore` in place from the first commit.
- [ ] `docs/DESIGN-DECISIONS.md` is current and honest.
- [ ] Section 7.12 self-check passed on every screen.
- [ ] Live site works on the `workers.dev` address, and that address is in Firebase's Authorized domains.
- [ ] A short README explains how to run it, in plain language.
