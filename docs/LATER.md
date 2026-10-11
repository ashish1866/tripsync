# Later list

Work that is agreed but not scheduled yet. Newest first. Remove an item once it is done.

## Added by Ashish, 2026-10-11

- **Demo database, before the demo.** Create a separate database named `tripsync` and load the demo data into it (Dhruv's Manali trip and its bills). Development keeps using `tripsync_dev`.
  - Set `MONGODB_DB` to `tripsync` on Render (both `render.yaml` and the service's Environment page). Run the index setup against it.
  - Check first in Atlas that the `tripsync_app` user may read and write the `tripsync` database, not only `tripsync_dev`.
  - The check script reads `MONGODB_DB` from `server/.dev.vars` to look at profiles, so it needs a way to name the demo database when it checks the live site.
- **Rate limits in Express, at Step 5.** Limit invite joins and the routes that call outside APIs (destination and place search, weather, nearby places).
  - They go in Express, not the Worker, because the Render address is public and can be called directly.
  - These routes all need a login, so count requests per Firebase user id instead of per IP address. Behind the Worker and Render's proxy, the IP Express sees is not the visitor's.
  - TripSync runs one Render instance, so a small in-memory counter is enough; no extra service.

## From the brief (section 6)

- Explore: nearby cafes, attractions, hotels and restaurants from Geoapify, with "add to day N"
- Packing checklist
- Best order (nearest-first) for a day's stops
- Filters and pages for expenses (category, person, 20 per page)
- Polish and deploy hardening
