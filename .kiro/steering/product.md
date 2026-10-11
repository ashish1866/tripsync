---
inclusion: always
---

# TripSync: what it is (always true)

TripSync is a website where a group of friends plans one trip together: the day plan, the map, the weather and the shared money in one place. College project by Ashish Bisht and Dhruv Grover, examined in a viva.

## It never does
- Book flights, hotels or taxis. No payments, no live traffic, no star ratings, no invented numbers.
- Show any number that is not real data from our database or an outside API.

## Roles (UI hides it AND the API refuses it with 403)
| Action | Owner | Editor | Viewer |
|---|---|---|---|
| See everything in the trip | yes | yes | yes |
| Add/edit activities, checklist, expenses | yes | yes | no |
| Edit/delete an expense | any | only their own | no |
| Invite, change roles, remove members | yes | no | no |
| Edit trip name/dates/budget, delete trip | yes | no | no |

## Fixed product rules
- Invites: Editor or Viewer, valid 7 days, checked in code (not only by TTL).
- The owner cannot leave (they delete the trip instead). A member who still owes money cannot be removed.
- Deleting a trip deletes its expenses and invites.
- Splits must add up to the total exactly, or 400 "Splits must add up to Rs X".
- "Mark as paid" is stored as an expense of type "settlement". Settlements never count as spending.
- Weather beyond about 16 days: say the forecast appears closer to the trip. Never make weather up.
- Best order is straight-line (Haversine) distance, and the UI says so.

## Where the details live
- Full spec: `KIRO-BRIEF.md` (sections 3, 4, 7).
- What is done and what is next: `docs/TASKS.md` and `docs/PROGRESS.md`.
- Design choices already made: `docs/DESIGN-DECISIONS.md`.
- If these steering files, DESIGN-DECISIONS.md and the brief disagree, the order of authority is: Ashish > steering files > DESIGN-DECISIONS.md > KIRO-BRIEF.md.
