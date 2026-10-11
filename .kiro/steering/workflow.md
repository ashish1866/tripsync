---
inclusion: always
---

# How every session works (stops drift)

1. At the start of a session, read `docs/TASKS.md` and the newest block of `docs/PROGRESS.md`. Trust those files over your memory of earlier chats.
2. Do the FIRST unticked step in `docs/TASKS.md` and only that step. Do not start the next one, and do not "improve" finished steps unless the current step needs it.
3. Testing rule (Ashish's choice, 12-Oct-2026): during Steps 7 to 9, do NOT run `npm.cmd run check`, because it signs up real Firebase accounts and hits Firebase's sign-up limit. A step is done when `npm.cmd test` passes, the slop guard passes (`node checks/slopGuard.mjs`), the client build passes, and the step's new must-fail cases are WRITTEN into the check (not yet run). Mark them "written, not run" in that step's `docs/PROGRESS.md` block. The full check runs once, in Step 9.5.
4. Then, in this order: tick the step's box in `docs/TASKS.md`, add one short block to `docs/PROGRESS.md`, update `docs/DESIGN-DECISIONS.md` if any design choice was made, and make one local commit for the step.
5. Stop and report in this shape: what now works and how Ashish can see it; what you tested and the result; what you could not verify; design decisions made or changed.
6. If something blocks you (a permission only Ashish can grant, a paid-plan prompt, a choice that changes the brief), write it under "Blocked" in `docs/PROGRESS.md`, stop, and say exactly what you need.
7. If you notice you are unsure what was decided earlier, re-read the steering files and `docs/DESIGN-DECISIONS.md` instead of guessing.
