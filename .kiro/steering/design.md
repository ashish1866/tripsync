---
inclusion: always
---

# TripSync: design rules (always true)

## The direction already chosen (keep it on every new screen)
Indian highway kilometre stones and route boards: whitewashed `--stone`, `--ink` lettering, the yellow `--cap` for identity and the primary action, road-sign red `--signal` only for warnings, money owed and destructive actions. Anek (display) + Mukta (body). Flat painted surfaces, 2px ink outlines, no shadows of any kind. Details and reasons: `docs/DESIGN-DECISIONS.md`.

New screens reuse the shared components and tokens. Never re-pick a font, colour, radius or spacing on one page. Two screens side by side must clearly be one product.

## Never (hard bans, no exceptions)
- Purple, indigo or violet anywhere; gradients of any kind; gradient text; glow or coloured shadows; neon on dark.
- Inter, Roboto, Arial, Open Sans or the system font as the face.
- The centred hero template (pill badge + centred headline + two buttons); rows of identical icon cards; cards inside cards.
- Emoji as icons; sparkle icons; stock photos; glossy 3D blobs; faceless illustrated people; grey placeholder boxes.
- Invented proof: fake user counts, ratings, testimonials, logos, count-up numbers.
- Brochure copy: "seamless", "effortless", "elevate", "unlock", "embark", "adventure awaits", "your journey begins", three-word slogans, arrows glued to button text, "Submit", "Click here", "Learn more", "Get started", "Oops! Something went wrong".
- Template leftovers: Vite/React logo or favicon, "Vite + React", lorem ipsum, TODO text.
- Default looks of libraries: Leaflet's blue teardrop pin and plain map frame, Recharts' default colours/tooltip/legend, native `alert()`/`confirm()`, browser-default form controls, a toast library's default skin.

## Only with a written reason in DESIGN-DECISIONS.md (tied to TripSync's subject)
Uppercase lettering (already allowed on stone lettering only), bento grids, numbered 01/02/03 markers, stat strips, frosted glass, dark mode, any animation beyond the existing road-dash loader. "It looks modern" is not a reason.

## Every screen and control
- Loading, empty, error and filled states, each designed (no grey icon + "No data found", no lone spinner).
- Hover, focus (visible double ring), pressed, disabled and working states on every control. Field errors under the field.
- Works at laptop width and phone width; long trip names and big amounts never overflow.
- WCAG AA contrast. Motion respects `prefers-reduced-motion`. Map shows "© OpenStreetMap contributors".
- Money in rupees with Indian grouping (`Intl.NumberFormat('en-IN')`).

## Before calling any screen done
Log new design choices in `docs/DESIGN-DECISIONS.md`. Run the slop guard in `npm.cmd run check`. Ask yourself: if someone said "AI made this", would they believe it at once? If yes, it is not done.
