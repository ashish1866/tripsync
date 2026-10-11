---
inclusion: always
---

# How every session works (stops drift)

1. At the start of a session, read `docs/TASKS.md` and the newest block of `docs/PROGRESS.md`. Trust those files over your memory of earlier chats.
2. Do the FIRST unticked step in `docs/TASKS.md` and only that step. Do not start the next one, and do not "improve" finished steps unless the current step needs it.
3. A step is done only when all of its "Done when" checks pass, `npm.cmd test` passes, and `npm.cmd run check` passes locally (including the slop guard).
4. Then, in this order: tick the step's box in `docs/TASKS.md`, add one short block to `docs/PROGRESS.md`, update `docs/DESIGN-DECISIONS.md` if any design choice was made, and make one local commit for the step.
5. Stop and report in this shape: what now works and how Ashish can see it; what you tested and the result; what you could not verify; design decisions made or changed.
6. If something blocks you (a permission only Ashish can grant, a paid-plan prompt, a choice that changes the brief), write it under "Blocked" in `docs/PROGRESS.md`, stop, and say exactly what you need.
7. If you notice you are unsure what was decided earlier, re-read the steering files and `docs/DESIGN-DECISIONS.md` instead of guessing.
