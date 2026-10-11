# Later list

Work that is agreed but not scheduled yet. Newest first. Remove an item once it is done.

## After Step 10 (2026-10-12)

- **Demo database.** Waiting for Ashish's yes or no: see "Blocked" in `docs/PROGRESS.md`. The seed script, the `--db` option of the seed and of the check, and the access test are already done.
- **A forecast that survives Open-Meteo's daily limit on Render's shared address.** Today the weather box shows the honest refusal. Possible later work, each a design decision for Ashish: keep the last good forecast for about a day and show it marked as older (needs the weather cache's expiry changed from 3 to about 24 hours, with the 3-hour freshness still checked in code); or ask Open-Meteo from the browser so each visitor uses their own address; or a paid Open-Meteo key.
- **The website is one 640 kB file.** Vite warns above 500 kB. Splitting the map, the chart and the pages into separate files would make the first load lighter.
- **Two people changing the same field at the same moment: the later save wins, with no warning.** Different fields and different items are already safe.
- **Starter packing lists and renaming an item** were left out on purpose (a ready-made list would be invented content).
- **A way to restart the rate-limit counters** (they live in the API's memory, so a Render restart clears them; the check works around this by taking the account that has rested longest).
