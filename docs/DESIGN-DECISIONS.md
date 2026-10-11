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

The landing page does not use the hero template. It opens with a left-aligned statement of the actual problem ("For the group trip that currently lives in a WhatsApp chat") and two plain sentences on what TripSync does. Then it shows the product's own shape instead of feature cards: a road of four day stones for an example Manali trip, one carrying a rain warning, and a ledger slip with the brief's real settle-up maths (Ankit, Rohan and Rahul paying Ashish). Both are labelled "Example" on screen. On a phone, the road scrolls sideways with the next stone peeking in, which is how the trip page will behave.

## 6. Default-ban items used, with reasons

- **D10, uppercase:** Place names and day markers painted on stones use condensed uppercase, because that is how real milestones are lettered. The TRIPSYNC wordmark uses the same lettering because it is the name on the stone. Uppercase is used only on stone lettering, never for small label text above headings.
- None other. (A hard ink offset edge on buttons and boards was used in Steps 0 and 1. It was close to D4's "brutalist costume", and Ashish had it removed: see "Surfaces and buttons" below.)

## Surfaces and buttons (decided by Ashish, Step 1.5)

Nothing in TripSync has a shadow, hard or soft. Every board (the forms, the ledger slip, the status list) is whitewashed stone with a 2px ink outline, and that is all.

The only heavy line left is the 6px base under each kilometre stone. It is part of the stone's outline (where it meets the ground) and is drawn as the stone's own bottom border, not as an offset or a shadow. No other element copies it.

Buttons are flat painted plates with the same 2px outline:
- **Hover:** the outline gets heavier (2px to 4px). Nothing moves.
- **Pressed:** the fill darkens (deeper yellow, or a slightly darker plate) and the button moves down 1px.
- **Focus:** the same double ring as every other control.
- **Working:** stays solid and shows the moving road dash along its bottom.
- **Disabled:** faded, no hover change.

How these are drawn (Step 1.6), so the slop guard can hold the "no shadows" rule:
- The only `box-shadow` in the code is the shared focus ring (`var(--focus)`) and `none`.
- Hover thickness is a CSS `outline`, not a shadow: 2px drawn just inside a button's border, and 1px just outside a text field's border.
- The Show button in a password field sits inside a field that already wears the focus ring. It marks its own focus with a 3px ink outline drawn inside its edge.
- The moving road line (loading strip and working button) is one shared component, `RoadDashes`. It is a row of real dash elements that slides left by one dash plus one gap and repeats. It used to be a striped CSS fill; that counted as a gradient, which the steering bans with no exceptions. It looks the same, and it still stands still under reduced motion.

## Maps (Step 2)

- Tiles are OpenStreetMap's, shown in greyscale (a CSS filter on the tile layer only). OSM's own greens and pinks fight the yellow caps; in grey, the stones are the only colour on the map, which is how a route board reads.
- Pins are tiny kilometre stones drawn in HTML and CSS (Leaflet `divIcon`, no image files): yellow cap, white face, the number on the face, the 4px base. The destination is the "0" stone, like the zero stone at the start of a highway. Leaflet's blue teardrop is never loaded.
- Planned stops (Step 3) will carry their order number on the face; nearby places (Step 7) get an ink cap so they never look like a planned stop.
- The map sits in the same 2px ink frame as every board. Zoom buttons are repainted as stone plates with the shared hover and focus states. The attribution "© OpenStreetMap contributors" stays visible bottom right, on a stone strip.
- Scroll-wheel zoom is off, so scrolling the page on a laptop does not get stuck inside the map.

## Motion in use

Only two things move, and both mean "still working":
- The road-dash line (loading strip, working button).
- The turning dashed square on `/status` (since Step 0). Reason: that page lists several checks that finish at different times; a mark that keeps turning says "this one is still running" without a spinner or a line of text per row, and stops being a question the moment the solid square (passed) or red triangle (failed) replaces it. It turns a quarter turn on a loop, 1.6 s, linear. Under `prefers-reduced-motion` it stands still as a plain dashed square (proved by the browser check with reduced motion on).

## Slop guard exceptions (slop-ok)

`npm run check` fails on the banned values in `.kiro/steering/design.md`. A line may opt out only by ending in the comment `slop-ok: <reason>`, and only if that exact reason is written in this list.

- (none in use)

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
- **Sign up / log in:** one form on a whitewashed board, set left of centre like a roadside sign rather than a centred modal. Field errors sit under their field with the warning-sign triangle, and focus jumps to the first one. Passwords have a Show button for typing on phones. After logging in, `?next=` brings you back to the page you opened (needed for invite links in Step 5); only TripSync paths are accepted.
- **Your trips (empty state):** an unpainted stone (dashed outline) and a sentence saying where trips will appear. Not a grey icon with "No data found".
- **Loading:** a short strip of road whose dashed centre line moves, plus a sentence saying what we are waiting for ("Checking your login"). It stands still under reduced motion. A button that is working stays solid and shows the same moving dash along its bottom.
- **Service status (`/status`):** the Step 0 build check, kept as a plain page that shows whether the API and database answer. Useful before a demo once the API sleeps on Render.
- **Your trips (list, Step 2):** one route-board row per trip, nearest start date first. Each row is a small stone (destination on the cap, number of days on the face) beside the trip name, place and dates, a plain line ("Starts in 5 days. 4 people. You own this trip.") and the budget strip. The whole row is one link; hover thickens its outline like a button. On a phone the stone sits above the lines.
- **Budget strip:** spent against budget as a flat painted bar in an ink frame. Over budget turns the fill and the "over budget" words road-sign red. No budget set says so in words instead of drawing an empty bar.
- **Plan a new trip:** the form board on the left, the map on the right. Before a destination is picked, the map space is an unpainted (dashed) board with one sentence, not a grey box. The destination search is a combobox (type, arrows, Enter, Escape) whose suggestions drop down as a stone list; the picked place is confirmed under the field with a tiny yellow-capped stone mark. The day count and the rupee amount are echoed under the fields as you type ("4 days, 16 to 19 Oct 2026").
- **Trip page:** a stone-coloured route board across the top (back link, trip name in large condensed lettering, place and dates, then tabs). The tab you are on gets a yellow cap strip and joins the page below. The Overview opens on "The route": one day stone per date standing on a kerb line, scrolling sideways on a phone. Below: the map, and a side column with the budget and the group.
- **Trip settings (owner only):** the same trip form, with the destination shown as fixed text. Deleting lives in a separate board with the red band of a warning sign, and asks first in a TripSync dialog (HTML `<dialog>`, focus starts on "Keep it", Escape closes). No browser `confirm()`.

## Day plan (Step 3)

- **Where:** a "Day plan" tab (`/trips/:id/plan?day=2`). The day is in the address, so a link can open Day 2 directly. The row of day stones on top is now a row of buttons; the chosen day gets an ink cap and a yellow face, like a stone freshly painted.
- **Stops:** each stop's number is a small kilometre stone, the same shape as its map pin, so the list and the map read as one. A stop with no place has an unpainted (dashed) stone and the words "No map point". The time sits in a small ink plate before the name ("10:00 am Solang Valley"). "Added by" names the member, because the group asks who put a stop there.
- **Map on the day plan:** that day's stops carry their number in the day. Stops on other days are pale, unpainted stones with no number, so the day you are on stands out but the rest of the trip is still in view. On the overview, every stop's stone carries its day number instead.
- **Laptop vs phone:** the stops sit beside the map on a laptop (the map stays in view while you scroll the list). On a phone the map comes first, then the stops, then the add form.
- **Adding:** the add form is a board with a yellow cap band (the warning band of the delete board, in identity yellow), always open under the day's stops for owners and editors. Picking a place fills in the stop name unless someone typed their own. Viewers see one plain line saying only the owner and editors change the plan, not a disabled form.
- **Removing** asks first in the same TripSync dialog as deleting a trip.
- **Drop-downs** (the Day field when editing a stop) use a shared `SelectField` in the same frame as text fields, with a painted ink triangle instead of the browser's arrow.

Data choices:
- A new stop goes into its day in time order (before the first stop with a later time; untimed stops at the end). After that, the stored order is the plan: editing a time does not reshuffle the list, and Step 9's "best order" will reorder it on purpose.
- Edits send only the fields that changed and set only those fields on that one stop (`$set` with an array filter). Two people changing different fields, or different stops, at the same moment both keep their change. Two people changing the same field: the later save wins.
- Moving a stop to another day is one update computed inside MongoDB (take it out of every day, add it to the end of the new day), so other stops added meanwhile are kept.
- At most 30 stops per day (409 with the reason). The stop search looks within 60 km of the destination, nearest first, through our API, so the Geoapify key never reaches the browser.

## Best order and bill filters (Step 9)

- **Best order** is a board on the Day plan (owners and editors, when a day has two or more stops): "Suggest the nearest-first order". Nothing changes until "Use this order". The suggestion shows the stops in the new order as the same small stones, each with "1.1 km from the stop before", and one sentence of totals: "In a straight line, your stops now cover 21 km. In this order they cover 14 km." It always carries the caution **"These are straight lines, not road distances. Mountain roads are longer, so check the route before you commit."** If the order is already nearest-first it says so and offers only Close. If the new order would put a later time before an earlier one, a red warning board says the times would run backwards. Viewers do not see the board (the API lets any member ask for the suggestion, but only owners and editors apply one).
- **The rule:** start at the first stop that has a place, then keep going to the nearest stop not yet visited (Haversine, straight line). A stop without a place cannot be measured, so it goes to the end, and the board says so. Ties keep the order the stops are already in.
- **Bill filters:** two drop-downs above the ledger, "Category" (All categories, the six categories, Payments marked as paid) and "Involving" (Everyone, or one member: any bill they paid or have a share in). The heading counts what is shown against the whole ("Bills and payments, 8 of 47"). A filter that matches nothing says "No bills match these filters" with a way back, and "Clear the filters" appears whenever one is on. Changing a filter returns to page 1.
- **Paging:** 20 to a page, newest date first. Under the ledger: "Previous page", "Page 2 of 3. Showing 21 to 40 of 47.", "Next page". No page links to count through; the buttons lock at either end. The bills now load separately from settle up and the budget, each with its own error and retry, so a failure in one never hides the other.

Data choices:
- Applying an order is one update computed inside MongoDB from the day as it is at that moment (`PUT /trips/:id/days/:day/order`): the stops named come first in the order given, a stop added meanwhile stays at the end, a stop deleted meanwhile is skipped, and no other day or field is touched. No load-change-save.
- The bills list is filtered and counted by MongoDB (`skip` and `limit` after a filter built in `server/src/utils/paging.js`). The person in the filter is plain text, checked by zod, never an object, so a request cannot slip in a MongoDB operator.
- Haversine uses a 6,371 km earth. Answers are whole metres.

## Packing list (Step 8)

- **Packing tab** (`/trips/:id/packing`): "Packing list", the packed strip ("8 of 12 packed. 4 to go.", the same painted bar as the budget, cap yellow), then one row per item, then the add box. When everything is ticked the line says "Everything is packed." with no celebration. The Overview has a small Packing section with the same strip.
- **The tick** is a painted square in a 2px ink outline: empty when not packed, filled ink with a stone-coloured check when packed. Under the paint it is a real checkbox (keyboard, screen readers), hidden visually. Hover makes the outline heavier, like every control; focus is the shared double ring. Packed items are shown in quieter text but never struck through, so they stay readable. Each row says "Added by Ashish" and, once ticked, "Packed by Dhruv", because a group wants to know who has the first-aid kit.
- **Viewers** see the list, the ticks and who packed what, but every box is locked and there are no Add or Remove buttons (the API refuses them with 403 anyway). Stated in one plain line, not a greyed-out form.
- **States:** empty is a dashed, unticked box and one sentence; adding nothing shows the error under the box; a tick that the server refuses is put back with the reason above the list.
- Ticking and adding show at once; the screen settles to the server's copy of that one item, so two quick ticks never undo each other.

Data choices:
- The list is stored inside the trip (`checklist[]`: id, text, done, addedBy, createdAt, doneBy, doneAt). Every change is one update on one item (`$push`, `$pull`, or `$set` through an array filter), never load-change-save, so two people ticking two items at the same moment keep both.
- A tick sends the state wanted (`done: true` or `false`), not "toggle", so pressing twice or two people pressing together cannot flip it back. Unticking clears who and when.
- At most 100 items (409 with the reason, checked inside the same update). An item is at most 80 characters.
- No editing of an item's wording, no categories and no ready-made lists: remove it and add it again. Starter lists would be invented content.

## Explore (Step 7)

- **Explore tab** (`/trips/:id/explore`): "Around Manali", then four plates (Cafes, Restaurants, Places to stay, Things to see), a distance (within 2, 5 or 10 km of the centre) and, for owners and editors, "Add places to: Day 2". Changing any of them searches again.
- **Results:** a route board, one row per place, nearest first: a small stone with an **ink cap** and its number (the same number as its pin), the name, the address, and "1.2 km from the centre of Manali, in a straight line". A place already in the plan says "On Day 2" with a link to that day. One button per row, "Add to Day 2". No ratings, no stars, no photos, no opening hours: Geoapify gives none, and TripSync does not make them up. A source line says the places come from Geoapify using OpenStreetMap data.
- **Map:** the 0 stone for the centre and an ink-capped stone per place. Ink caps mean "a place you could go"; yellow caps (the day plan) mean "a stop you planned". Picking a place (its name, or its pin) marks its row with a yellow band down the edge and pales the other pins; the list jumps to it without a smooth scroll (motion stays limited to the road dash).
- **States:** loading is the road loader ("Looking for cafes near Manali"); empty is an unpainted stone and a sentence suggesting a wider distance; a failed search shows a warning board with "Try the search again" in the results only, while the map, tabs and the rest of the trip keep working.

Data choices:
- The `places` collection is the cache. A search is "category + area (rounded to about 1 km) + radius", and each place document lists the searches that found it (`searchKeys`), so different trips to Manali share one set of cafes. Lookup is a `$geoNear` query on the 2dsphere index (MongoDB computes each distance); only when it finds nothing from the last 7 days does the API ask Geoapify (`categories` + `filter=circle:lon,lat,radius`), save the places (one document per Geoapify `place_id`), and read them back the same way.
- Places without a name are dropped (OpenStreetMap lists some streets and viewpoints as "attractions" with no name).
- A search Geoapify answers with nothing is not cached, so it is asked again next time (rate-limited per account).
- Distance is straight-line from the destination's centre, and the screen says so: mountain roads are longer.
- "Add to Day N" uses the same add-a-stop route as the day plan, with the place's name, address, map point and Geoapify id, so the stop gets its pin and Explore can show "On Day 2".

## Money (Step 6)

- **Money tab** (`/trips/:id/money`), a ledger in three parts, in the order people need them: Settle up, Budget, Bills.
- **Settle up:** one slip per payment, "Dhruv Grover pays you ₹3,000". The amount still owed is road-sign red: money owed is one of the three things red is for. "Mark as paid" asks first in the TripSync dialog with a yellow band (it destroys nothing, so it does not get the red one) and says to mark it only once money has really changed hands. When nobody owes anything: one plain line, "Everyone is square. Nobody owes anybody." No celebration. Under it, a table of each person: paid, share, and "Gets back ₹3,000" / "Owes ₹3,000" (red) / "Square".
- **Budget:** the same budget strip as My Trips, then "Spent by category" as horizontal painted bars. **The category colours are the real kilometre stone code** (section 4 promised this): the cap colour of an Indian milestone tells you the kind of road. Stay is yellow (National Highway), Travel green (State Highway), Activities blue (district road), Food orange (village road), Shopping black (city road), Other an unpainted stone. These six colours are tokens (`--km-*`) and are used for nothing else. Each bar has the 2px ink outline and is labelled with its amount in Anek; there is no tooltip, legend, grid or axis line. Recharts only lays the bars out (`CategoryChart`): the bar shape, colours and lettering are ours, and a hidden table gives screen readers the same numbers.
- **Bills:** one row per bill: a small stone cap in its category colour, what it was for, category, who paid and when, how it was split, each person's share, and the amount. Payments marked as paid sit in the same list with an unpainted dashed cap and the words "Not counted as spending". Edit and Delete appear only on bills you may change (owner: all; editor: the ones they added). Empty: a dashed, unpainted bill slip and one sentence.
- **Add/edit a bill:** what, amount, category, paid by, date; then "Equally" or "Exact amounts" as the same choice plates as the invite board. Equally: a plate per person, ticked to share it, each showing their share as you type ("₹4,000"). Exact: a box per person and a running line ("₹2,500 of ₹3,000 shared. ₹500 still to share."), red until it adds up; saving with shares that do not add up is stopped under the shares with "Splits must add up to ₹3,000".
- Overview: the budget line became the budget strip (spent of budget), with a link to the money.

Data choices:
- Categories: stay, travel, food, activities, shopping, other. A settlement's category is "settlement" and can only be made by "Mark as paid".
- The whole bill is sent on edit (amount and split belong together), and only that one document changes. A payment cannot be edited into a bill; it can be deleted.
- "Mark as paid" may not pay more than both people owe and are owed (400 with the most that can be marked), so a typo cannot create a new debt the other way.
- Settle-up ties go to whoever comes first in the trip's member order (owner first, then by joining), so the list does not reshuffle between visits.
- Budget by category is one MongoDB aggregation (`$match` this trip and `type: expense`, `$group` by category); settlements never count as spending anywhere (trip list, overview, budget).

## Members and invites (Step 5)

- **Members tab:** the group as a route board, one row per person: name, a small ink plate with the role and what it allows in a plain sentence, and the join date. The owner's rows carry "Make viewer / Make editor" and "Remove" buttons; nobody else sees them. Your own row says "You". The owner's page ends with one line saying why they cannot leave; everyone else gets a "Leave this trip" board with the same red band as deleting a trip.
- **Invite board** (owner only, yellow band like the add-stop board): two painted plates to choose the role (Editor / Viewer, each with what it allows), one button to make the link, then every working link with its code painted large so it can be read out over a phone call, "Works until 18 Oct 2026", Copy link and Stop this link. New shared component `ChoicePlates`: real radio buttons under the paint, so the keyboard and screen readers work. The chosen plate fills cap yellow; hover thickens the outline like every button.
- **Invite page** (`/join/CODE`): set left of centre like the sign-up pages. "Ashish invited you to" then the trip name very large, a board with the trip's stone, place, dates, head-count and one sentence on what the role allows ("You join as Editor: you can add and change stops, bills and packing items."). Logged out: "Log in to join" and "Create an account", both bring you back. The expired, unknown and unreadable cases each have their own headline and the exact message.
- **Codes:** 8 characters from letters and digits without look-alikes (no 0/O, 1/I/L), typed in any case. An invite is not tied to one person; anyone with the link can use it for 7 days. The owner can stop a link at once.

Data choices:
- Expiry is decided in code (`now >= createdAt + 7 days`) on every preview and join. The TTL index only tidies up, about once a minute. Expired answers HTTP 410; a code MongoDB has already deleted answers 404 with a message that mentions the 7 days, because by then the two cannot be told apart.
- Joining is one update that only matches when the person is not yet a member and the trip has fewer than 20 people, so two quick taps (or two codes) cannot add someone twice. Already a member: 409 "You're already in this trip."
- The public invite preview shows the trip name, place, dates, how many people, and the owner's name. No member names, no money, no days or stops. It includes the trip id, which opens nothing: every trip route still checks membership.
- "Owes money" is computed from every bill and settlement of the trip with the same balance maths settle-up will use (`server/src/utils/money.js`): what the person paid minus their share. A member whose balance is below zero cannot be removed and cannot leave.
- Removed or departed members keep their old bills and stops, shown as "a former member" where their name is no longer known.
- Rate limits live in the Express process's memory, per Firebase user, as a sliding window. That fits the API running as one process on Render; restarting clears the counts. Limits: 10 joins per 15 minutes (stops code guessing), 60 searches and 30 weather checks per minute.

## Weather (Step 4)

- **On each day stone:** under the stop count, a small ink weather symbol with the high and low ("17° / 6°"), then "Rain 35%". That is the kilometre stone idea from section 2 made real: the day's number, date and forecast on one painted face.
- **Symbols** are drawn for TripSync as small inline SVG pictograms in 2px ink, like the symbols on a road sign: sun, sun behind a cloud, cloud, fog lines, cloud with rain strokes, cloud with snow dots, cloud with a bolt. Clouds are painted stone with an ink edge. No emoji, no icon font. A weather code we have no name for gets no symbol and the words "No description for this forecast": we never guess.
- **Rain warning:** the stone's rain line turns road-sign red with the warning triangle, and the weather box and the day plan show a red warning board ("Rain likely on Day 2: 85% chance of rain, with 1 stop planned. Carry rain gear or plan a covered stop."). Red appears only when there is something to decide. On the selected (yellow) stone, red text would fail AA contrast, so the words stay ink and only the triangle is red.
- **Weather box** (overview side column): the warnings, or one line saying there are none and what would cause one; "Forecast later" days named in words; and the source line "Forecast from Open-Meteo, checked at 9:44 pm. It is checked again after 3 hours." Its loading state is the road loader ("Checking the forecast"); its error state is a warning board with "Try the forecast again". If it fails, nothing else on the page changes.
- **Beyond the forecast:** stones say "Forecast later", and the box says when it will appear ("It reaches about 16 days ahead, so Day 1 gets its forecast from about 28 Oct"). Days already over show nothing.
- Row of day stones: every stone is now as tall as the tallest, so weather lines never make the row ragged.

Data choices:
- Cache key: the destination rounded to 2 decimals, written "lat,lng" ("32.26,77.17"), so trips to the same town share one entry. The 3-hour age is checked in code as well as by the TTL index (which only runs about once a minute).
- A trip that starts beyond the 16-day forecast, or has ended, does not call Open-Meteo at all.
- The API sends the rain limit (60%) with the forecast, so the rule lives in one tested server file (`server/src/utils/weather.js`) and the browser only applies it to the live stop counts.

## Data choices made in Step 2

- Trip dates are stored as `YYYY-MM-DD` text, not timestamps. A trip date is a day on the calendar; text cannot shift to the day before on a server in another time zone.
- A trip is at most 30 days long, and its budget at most Rs 1 crore (whole paise). Both are checked in the form and again by the API.
- The destination cannot change once the trip exists (its map, weather and nearby places hang off it). Owners change only the name, dates and budget.
- Shortening a trip that would drop a day with stops is refused with HTTP 409 and the reason ("These dates would remove Day 3 (1 stop). Delete or move those stops first"). 409 because the request is well-formed but clashes with what is in the trip; malformed dates and budgets are 400.
- Changing dates rewrites the days list inside MongoDB in one update (keep the days still inside the range, add new empty ones, renumber), never load-change-save, so stops another member adds meanwhile survive.
- A stranger gets 403 on a trip that exists and 404 on one that does not.

## When an outside service refuses (Step 10)

- The forecast, the town search and the place searches depend on services TripSync does not control. When one refuses, only the box that needs it says so, in plain words, and the rest of the trip keeps working (this was designed in Steps 4 and 7 and is how the live site behaves today).
- The words name the service and what it replied: "The weather service could not answer this time. It replied HTTP 429: Daily API request limit exceeded. Please try again tomorrow." When the service explains itself, its advice replaces ours (ours said "try again in a minute", which contradicted it). The service's own text is shown only for Open-Meteo, whose refusal reasons are public; Geoapify's text is never shown, because its errors can mention keys.
- A failing outside service answers HTTP 503, not 502. Measured on the live site: a 502 from the API came out of Cloudflare as its own grey HTML "Bad gateway" page, which the website cannot read. The 503 arrives as the API's JSON.
- One retry, after a short pause, on 429, 5xx or no answer. Nothing is retried on a plain refusal such as 401 or 404.

## Backup forecast (OpenWeather)

- Open-Meteo stays the main forecast (16 days, no key). OpenWeather's **free** key gives only 5 days (3-hourly readings); a 16-day daily forecast is a paid OpenWeather product. So OpenWeather is a backup, not a replacement: when Open-Meteo refuses (its daily limit on Render's shared address), the trip still shows days 1 to 5, and days beyond say "the forecast appears closer to the trip" as before.
- It is never silent. The weather box says "Forecast from OpenWeather, because Open-Meteo did not answer. It reaches about 5 days ahead, so later days show once Open-Meteo is back." The day stones, symbols and rain warning look exactly the same, because the readings are folded into Open-Meteo's daily shape before anything else sees them.
- How 3-hourly readings become a day: cut at the place's own midnight (OpenWeather says the shift from UTC), highest high, lowest low, highest rain chance, and the most severe condition names the day (a thunderstorm reading makes a thunderstorm day). A day with fewer than four of its eight readings (today late in the evening, or the last day) is left out, because half a day has no honest high or low. A condition with no honest equivalent (tornado, ash) shows "No description for this forecast" rather than a guess.
- The backup's copy is kept 15 minutes, not 3 hours, so TripSync goes back to the 16-day source as soon as it answers. Normal Open-Meteo copies still last 3 hours.
- Settings (server only, never the browser): `OPENWEATHER_KEY` (empty = no backup) and `WEATHER_PROVIDER` = `auto` (default), `open-meteo` or `openweather` (to test the backup on purpose).

## Change log

- 2026-10-12: backup forecast from OpenWeather when Open-Meteo refuses; the weather box's source line says which one answered and why.

- 2026-10-12, Step 10: outside-service failures now say what the service replied (503, not 502). No visual change; the existing warning board and "Try again" buttons carry the new wording.

- 2026-10-12, Step 9.5: no design change. Fixed one flash on the Money tab: clearing the bill filters no longer shows the "No bills yet" message while the full list loads.

- 2026-10-12, Step 9: Best order board on the Day plan; Category and Involving filters and 20-a-page paging on the bills; bills load separately from settle up and the budget.

- 2026-10-12, Step 8: Packing tab (painted tick boxes, packed strip, who packed what), Packing section on the Overview, `PackedBar`.

- 2026-10-12, Step 7: Explore tab (category plates, distance, add-to-day, results board with ink-capped stones, map pins that pick a place). StopNumber gained the ink-cap "place" version.

- 2026-10-11, Step 6: Money tab (settle up, budget with kilometre-stone category colours, bills), `CategoryChart`, `ExpenseForm`; six `--km-*` colour tokens; ChoicePlates can now be multi-select with errors; ConfirmDialog has a calm yellow-band version and a custom cancel label.

- 2026-10-11, Step 5: Members tab (group board, invite board, leave board), invite page `/join/:code`, "Got an invite code?" box on Your trips, shared `ChoicePlates`. The Overview now reads role names from one shared file.

- 2026-10-11, Step 4: forecast on each day stone, painted weather symbols (`WeatherMark`), red rain warning line and boards, weather box on the overview with its own loading and error states, forecast line on the day plan. Day stones in a row now share one height.

- 2026-10-11, Step 3: Day plan tab with selectable day stones, stop list with stone numbers, add/edit/remove forms, stop pins (numbered on the chosen day, pale on others, day numbers on the overview). New shared `SelectField`, `StopNumber`, `StopForm`; TextField gained a multi-line mode for notes.

- 2026-10-11, Step 2: trips list, plan a new trip, trip page with the route of day stones and the map, trip settings with delete. Added the Maps section (grey OSM tiles, stone pins), the motion list with the reason for the turning mark on `/status`, and the Step 2 data choices.

- 2026-10-11, Step 1.6: added the slop guard to `npm run check`. Fixed its six hits without exceptions: two striped fills became the shared `RoadDashes` row, and four non-focus shadows became outlines. Nothing changes visibly.
- 2026-10-11, Step 1.5: Ashish asked to drop the hard ink offset. Removed it from every button and board, along with the `--lift` token. Buttons now show hover as a heavier outline and press as a darker fill. The stone's 6px base stays; it is part of the stone's outline, not a shadow.
- 2026-10-11, Step 1: landing page, sign-up and log-in forms, shared TextField, Notice, RoadLoader, AppHeader and Wordmark components, trips empty state, `/status`. Logged the hard offset edge as a near-D4 choice for Ashish to judge.
- 2026-10-11, Step 0: first entry. Kilometre-stone direction, Anek plus Mukta, stone/ink/cap/signal palette, plain CSS with tokens. Shared `Milestone` and `Button` components. Buttons had a hard 3px ink offset (removed in Step 1.5).
