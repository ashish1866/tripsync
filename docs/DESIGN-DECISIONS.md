# TripSync design decisions

Kept by Kiro. Ashish has the last word on taste; anything he picks overrides this file.
Newest changes go in the log at the bottom.

## 1. Who uses this and what are they doing

Four to eight friends, mostly college students, taking a road trip to a hill town such as Manali or Kasol. The plan currently lives in a WhatsApp group: someone forwards a hotel link, someone else asks "which day is Solang?", and by day three nobody remembers who paid for the Volvo tickets. One person usually ends up as the unofficial treasurer and does the maths on the bus home.

They plan on laptops in the weeks before. During the trip they use phones, often on bad mobile data at a dhaba or a viewpoint, to check today's stops, see if it will rain, and add a bill in under a minute. At the end, they want one honest list of who pays whom, so the group can square up and stop talking about money.

## 2. Direction: the kilometre stone

TripSync looks like Indian highway kilometre stones and route boards: whitewashed stone, a chrome-yellow cap, black stencil-style lettering, and red-bordered warning signs.

Why this fits: every one of these trips is a road. A kilometre stone already does TripSync's core job in one object: it names a place, gives a number, and is painted to be read from a moving bus. So the interface is built like painted roadside information: short, large, numbers first, readable at a glance on a phone in sunlight.

How it shows up:
- The trip is a row of stones, one per day. Each stone carries the day number, date and that day's forecast.
- Rain warnings borrow the red triangle of a road warning sign.
- Map pins are small stones, not the default teardrop.
- Copy is plain Indian English: direct and short, like a sign, not a brochure.

## 3. Typefaces

- **Anek Latin** (with **Anek Devanagari** as its Hindi fallback), by Ek Type, a Mumbai type foundry. Used for display text: place names, day markers and amounts. Its width axis goes down to 75%, which gives the condensed, heavy lettering painted on milestones without a fake squeeze.
- **Mukta**, also by Ek Type, for body and interface text at reading sizes.

Reason: the destinations and the users are Indian, and real milestones are bilingual. Both families cover Devanagari, so a member who types "मॉल रोड" as an activity sees it in the same design instead of a random system fallback. Pairing two families from one foundry's Latin plus Devanagari system keeps them in tune.

Neither family appears in Ashish's other projects (checked D:\projects and D:\gift-sites).

Fonts are self-hosted through Fontsource and bundled by Vite: no outside font host, and they work on the same domain as the app. The browser check confirms they actually load (H7).

## 4. Colour

| Token | Role | What it is for |
|---|---|---|
| `--stone` | Dominant ground | Whitewashed stone: the page and surfaces |
| `--ink` | Dominant text | Stencil-paint black: all text, rules and icons |
| `--cap` | Identity colour | The National Highway milestone cap. Used as large flat fields: the day stone caps, the selected day, the primary action. Never as text on a light ground (it fails contrast), and never as a thin highlight. |
| `--signal` | Accent | Road-sign red, only for things that need attention: rain warnings, money someone still owes, destructive actions. If red appears, something needs a decision. |

Ink on cap and ink on stone both pass WCAG AA by a wide margin. Exact values live in `client/src/styles/tokens.css`, the only place colours are defined.

Later, for budget categories, the chart takes its colours from the real kilometre stone code: yellow for national highways, green for state highways, and so on, instead of a charting library's rainbow.

## 5. Layout idea

The trip page opens on the route: the row of day stones across the top. That answers the first question anyone in the group asks ("what are we doing on which day, and will it rain?") before anything else. Picking a stone opens that day's stops beside the map on a laptop, or below it on a phone. Money lives in its own ledger view, because settling up is a separate moment from planning.

The landing page does not use the hero template. It is built on one large stone carrying the product name, and explains TripSync in plain sentences. Details will be logged when it is built in Step 1.

## 6. Default-ban items used, with reasons

- **D10, uppercase:** Place names and day markers painted on stones use condensed uppercase, because that is how real milestones are lettered. Uppercase is used only on stone lettering, never for small label text above headings.

## 7. What I deliberately did not do

- No photos of destinations (we have none that are ours) and no stock travel imagery.
- No globe, plane, suitcase or compass icons. No emoji as icons.
- No gradients, glass blur or glowing shadows. Surfaces are flat, like painted stone.
- No dark mode or theme toggle; nobody asked for it, and the stone look is a daylight look.
- No star ratings (Geoapify has none) and no invented numbers. Every number shown comes from the database.
- No celebration effects on money screens: settling up is a chore, not a win.
- No component library. Styling is plain CSS with custom properties (tokens) plus CSS Modules per component, so two students can explain every rule. Tailwind was in the plan but was dropped: its default palette is exactly the H4 trap, and class soup is harder to explain in a viva.

## Screens so far

- **Build check (`/`, Step 0 only):** one large stone, "TripSync / 0 km from the start", next to a plain board of four checks (website, typefaces, API, database). Status marks follow the sign language: solid ink square means passed, red triangle means failed, dashed square means still checking. The Step 1 landing page replaces it.
- **Not found (`*`):** a small "No road / 404" stone and one sentence saying what happened, plus a button back home.

## Change log

- 2026-10-11, Step 0: first entry. Kilometre-stone direction, Anek plus Mukta, stone/ink/cap/signal palette, plain CSS with tokens. Shared `Milestone` and `Button` components. Buttons have a hard 3px ink offset instead of a soft shadow; pressing one sinks it onto that edge.
