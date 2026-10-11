// Feature checks for Steps 2 onward, called by checks/run.mjs after the sign-up story.
// Each section uses its own throwaway accounts (made through ctx.newUser, so the
// clean-up in run.mjs deletes them and everything they own).
//
// ctx: { base, call, record, setSection, newUser, db, openPage, PHONE, shot, saveLook, overflowOf, hasError, login }

import { ObjectId } from 'mongodb';

// "YYYY-MM-DD", n days from today (this PC's calendar).
export function dayFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MANALI = { name: 'Manali', state: 'Himachal Pradesh', country: 'India', location: [77.17481, 32.2574] };

// A trip made straight through the API, for sections that need one.
export async function makeTrip(ctx, owner, { name = 'Manali Trip', start = 5, days = 4, budget = 4_000_000 } = {}) {
  const r = await ctx.call('POST', '/trips', {
    token: owner.token,
    body: { name, destination: MANALI, startDate: dayFromToday(start), endDate: dayFromToday(start + days - 1), budget },
  });
  if (r.status !== 201) throw new Error(`could not create a test trip: HTTP ${r.status} ${r.data?.error}`);
  return r.data.trip;
}

// Adds a member straight in the database (invites arrive in Step 5).
export async function addMember(ctx, tripId, user, role) {
  await ctx.db.collection('trips').updateOne({ _id: new ObjectId(tripId) }, { $push: { members: { uid: user.uid, role, joinedAt: new Date() } } });
}

const sections = [tripsChecks];

export async function runFeatureChecks(ctx) {
  for (const section of sections) {
    try {
      await section(ctx);
    } catch (err) {
      ctx.record(`${section.name} ran to the end`, false, err.stack?.split('\n').slice(0, 2).join(' ') ?? String(err));
    }
  }
}

// ====================== Step 2: trips ======================
async function tripsChecks(ctx) {
  const { call, record, hasError, db } = ctx;
  ctx.setSection('Trips API');

  const owner = await ctx.newUser('owner', 'Ashish Check');
  const other = await ctx.newUser('other', 'Dhruv Check');
  const stranger = await ctx.newUser('stranger', 'Rahul Check');

  // Destination search
  const search = await call('GET', '/geo/destinations?q=Mana', { token: owner.token });
  const manali = search.data?.results?.find((r) => r.name === 'Manali' && r.state === 'Himachal Pradesh');
  record('Searching "Mana" offers "Manali, Himachal Pradesh"', search.status === 200 && manali, `HTTP ${search.status}, ${search.data?.results?.map((r) => `${r.name}/${r.state}`).join(', ')}`);
  record('Its map point is stored as [longitude, latitude]', manali && Math.abs(manali.location[0] - 77.17) < 0.1 && Math.abs(manali.location[1] - 32.26) < 0.1, JSON.stringify(manali?.location));
  const short = await call('GET', '/geo/destinations?q=M', { token: owner.token });
  record('Search with 1 letter: 400', short.status === 400 && hasError(short), `HTTP ${short.status}`);
  const noLogin = await call('GET', '/geo/destinations?q=Mana');
  record('Search without logging in: 401', noLogin.status === 401, `HTTP ${noLogin.status}`);

  // Create
  const start = dayFromToday(5);
  const end = dayFromToday(8);
  const good = { name: 'Manali Trip', destination: manali || MANALI, startDate: start, endDate: end, budget: 4_000_000 };
  const created = await call('POST', '/trips', { token: owner.token, body: good });
  const trip = created.data?.trip;
  record('Owner creates "Manali Trip": 201', created.status === 201 && trip?.name === 'Manali Trip' && trip.myRole === 'owner', `HTTP ${created.status} ${created.data?.error ?? ''}`);
  const daysOk = trip?.days?.length === 4 && trip.days.every((d, i) => d.dayNumber === i + 1 && d.activities.length === 0) && trip.days[0].date === start && trip.days[3].date === end;
  record('One empty day per date, numbered 1 to 4', daysOk, JSON.stringify(trip?.days?.map((d) => `${d.dayNumber}:${d.date}`)));
  record('Budget kept as whole paise (Rs 40,000 = 4000000)', trip?.budget === 4_000_000, `budget ${trip?.budget}`);

  const bad = [
    ['end date before start date', { ...good, startDate: end, endDate: start }],
    ['a 31-day trip', { ...good, endDate: dayFromToday(35) }],
    ['an impossible date (30 Feb)', { ...good, startDate: '2027-02-30', endDate: '2027-03-02' }],
    ['a date in the wrong shape', { ...good, startDate: '13-10-2026' }],
    ['a negative budget', { ...good, budget: -100 }],
    ['a budget with a fraction of a paisa', { ...good, budget: 12.5 }],
    ['a budget written as text', { ...good, budget: '40000' }],
    ['no destination', { ...good, destination: undefined }],
    ['a map point off the globe', { ...good, destination: { ...MANALI, location: [200, 95] } }],
    ['an empty name', { ...good, name: '   ' }],
    ['an extra field (owner)', { ...good, owner: stranger.uid }],
  ];
  for (const [label, body] of bad) {
    const r = await call('POST', '/trips', { token: owner.token, body });
    record(`Create with ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }
  if (!trip) return;
  const tripUrl = `/trips/${trip.id}`;

  // Reading: members only
  const strangerRead = await call('GET', tripUrl, { token: stranger.token });
  record('Stranger reads the trip: 403', strangerRead.status === 403 && hasError(strangerRead), `HTTP ${strangerRead.status}`);
  const strangerList = await call('GET', '/trips', { token: stranger.token });
  record("Stranger's trip list does not include it", strangerList.status === 200 && !strangerList.data.trips.some((t) => t.id === trip.id), `${strangerList.data?.trips?.length} trips`);
  const missing = await call('GET', `/trips/${new ObjectId().toString()}`, { token: owner.token });
  record('A trip id that does not exist: 404', missing.status === 404, `HTTP ${missing.status}`);
  const garbled = await call('GET', '/trips/not-an-id', { token: owner.token });
  record('A garbled trip id: 404', garbled.status === 404, `HTTP ${garbled.status}`);
  const noToken = await call('GET', tripUrl);
  record('Reading without logging in: 401', noToken.status === 401, `HTTP ${noToken.status}`);

  // Editing: owner only
  await addMember(ctx, trip.id, other, 'editor');
  const editorRead = await call('GET', tripUrl, { token: other.token });
  record('An editor member reads the trip: 200, role editor', editorRead.status === 200 && editorRead.data.trip.myRole === 'editor', `HTTP ${editorRead.status}`);
  const editorPatch = await call('PATCH', tripUrl, { token: other.token, body: { name: 'Hijacked' } });
  record('A non-owner member edits the trip: 403', editorPatch.status === 403 && hasError(editorPatch), `HTTP ${editorPatch.status}`);
  const editorDelete = await call('DELETE', tripUrl, { token: other.token });
  record('A non-owner member deletes the trip: 403', editorDelete.status === 403, `HTTP ${editorDelete.status}`);
  const strangerPatch = await call('PATCH', tripUrl, { token: stranger.token, body: { name: 'Hijacked' } });
  record('A stranger edits the trip: 403', strangerPatch.status === 403, `HTTP ${strangerPatch.status}`);

  const badPatches = [
    ['nothing to change', {}],
    ['an empty name', { name: '' }],
    ['a negative budget', { budget: -1 }],
    ['an end date before the start', { endDate: dayFromToday(1) }],
    ['a new destination (not allowed)', { destination: MANALI }],
  ];
  for (const [label, body] of badPatches) {
    const r = await call('PATCH', tripUrl, { token: owner.token, body });
    record(`Owner edits with ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }

  const renamed = await call('PATCH', tripUrl, { token: owner.token, body: { name: 'Manali Trip', budget: 4_500_000 } });
  record('Owner changes the budget: 200', renamed.status === 200 && renamed.data.trip.budget === 4_500_000, `HTTP ${renamed.status}`);

  // Dates: longer at both ends, renumbered, existing stops kept
  await db.collection('trips').updateOne(
    { _id: new ObjectId(trip.id), 'days.dayNumber': 2 },
    { $push: { 'days.$.activities': { id: 'check-stop', title: 'Solang Valley', time: '', notes: '', place: null } } },
  );
  const longer = await call('PATCH', tripUrl, { token: owner.token, body: { startDate: dayFromToday(4), endDate: dayFromToday(9) } });
  const ld = longer.data?.trip?.days || [];
  const renumbered = ld.length === 6 && ld.every((d, i) => d.dayNumber === i + 1) && ld[0].date === dayFromToday(4) && ld[2].activities[0]?.title === 'Solang Valley';
  record('Owner adds a day at each end: 6 days, renumbered, stops kept on their date', longer.status === 200 && renumbered, `HTTP ${longer.status} ${JSON.stringify(ld.map((d) => `${d.dayNumber}:${d.date.slice(5)}:${d.activities.length}`))}`);

  const cut = await call('PATCH', tripUrl, { token: owner.token, body: { startDate: dayFromToday(7) } });
  record('Shortening past a day that has stops: refused (409) with the reason', cut.status === 409 && /Day 3 \(1 stop\)/.test(cut.data?.error), `HTTP ${cut.status} ${cut.data?.error ?? ''}`);
  const fine = await call('PATCH', tripUrl, { token: owner.token, body: { startDate: dayFromToday(5), endDate: dayFromToday(8) } });
  record('Shortening that keeps every stop: 200, back to 4 days', fine.status === 200 && fine.data.trip.days.length === 4 && fine.data.trip.days[1].activities.length === 1, `HTTP ${fine.status} ${fine.data?.error ?? ''}`);

  const list = await call('GET', '/trips', { token: owner.token });
  const row = list.data?.trips?.find((t) => t.id === trip.id);
  record('My trips lists it with destination, member count and spent', row && row.destination.name === 'Manali' && row.memberCount === 2 && row.spent === 0, JSON.stringify(row));

  // Delete: the trip, its expenses and its invites
  const tripObjectId = new ObjectId(trip.id);
  await db.collection('expenses').insertOne({ tripId: tripObjectId, title: 'check', amount: 100, type: 'expense', splits: [] });
  await db.collection('invites').insertOne({ code: `check${Date.now()}`, tripId: tripObjectId, role: 'viewer', createdAt: new Date() });
  const deleted = await call('DELETE', tripUrl, { token: owner.token });
  const leftovers = (await db.collection('expenses').countDocuments({ tripId: tripObjectId })) + (await db.collection('invites').countDocuments({ tripId: tripObjectId }));
  const gone = await call('GET', tripUrl, { token: owner.token });
  record('Owner deletes the trip: its expenses and invites go too', deleted.status === 200 && leftovers === 0 && gone.status === 404, `HTTP ${deleted.status}, ${leftovers} left, then GET ${gone.status}`);

  // ---------- in the browser ----------
  ctx.setSection('Trips in the browser');
  const traveller = await ctx.newUser('tripsweb', 'Ashish Bisht');
  const { context, page, consoleErrors } = await ctx.openPage();
  await ctx.login(page, traveller);
  const emptyShown = await page.getByRole('heading', { name: 'No trips yet' }).waitFor({ timeout: 15000 }).then(() => true, () => false);
  const mainText = emptyShown ? '' : (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
  record('A new account sees the empty "No trips yet" state', emptyShown, `${page.url()} says: ${mainText}`);

  await page.getByRole('link', { name: 'Plan a new trip' }).first().click();
  await page.waitForURL(`${ctx.base}/trips/new`);
  await page.getByRole('button', { name: 'Create the trip' }).click();
  const formErrors = await page.locator('[aria-invalid="true"]').count();
  record('Empty "Plan a new trip" form: errors under the name, destination and dates', formErrors === 4, `${formErrors} fields marked`);

  await page.getByLabel('Trip name').fill('Manali Trip');
  await page.getByRole('combobox', { name: 'Destination' }).fill('Mana');
  const option = page.getByRole('option', { name: /Manali.*Himachal Pradesh/ });
  const offered = await option.first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  record('Typing "Mana" offers "Manali, Himachal Pradesh"', offered);
  if (offered) await option.first().click();
  await page.getByLabel('First day').fill(start);
  await page.getByLabel('Last day').fill(end);
  await page.getByLabel(/Budget for the whole group/).fill('40000');
  const pinBeforeSave = await page.locator('.ts-pin-destination').count();
  record('The picked destination appears as a stone pin on the map', pinBeforeSave === 1, `${pinBeforeSave} pins`);
  if (ctx.saveLook) await ctx.shot(page, 'new-trip');
  await page.getByRole('button', { name: 'Create the trip' }).click();
  const onTrip = await page.waitForURL(/\/trips\/[a-f0-9]{24}$/, { timeout: 20000 }).then(() => true, () => false);
  const h1 = onTrip ? await page.locator('h1').innerText() : '';
  const stones = await page.getByRole('list', { name: 'Days of the trip' }).getByRole('listitem').count();
  record('Creating it opens the trip: "Manali Trip" with 4 day stones', onTrip && h1 === 'Manali Trip' && stones === 4, `${page.url()} h1 "${h1}" ${stones} stones`);
  const pin = await page.locator('.ts-pin-destination').count();
  // Tiles come from tile.openstreetmap.org, so give them time to arrive.
  await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 15000 }).catch(() => {});
  const tiles = await page.locator('.leaflet-tile-loaded').count();
  const attribution = await page.locator('.leaflet-control-attribution').innerText().catch(() => '');
  record('The trip map shows the destination pin, tiles and "© OpenStreetMap contributors"', pin === 1 && tiles > 0 && /© OpenStreetMap contributors/.test(attribution), `${pin} pin, ${tiles} tiles, "${attribution}"`);
  const defaultPins = await page.locator('img.leaflet-marker-icon').count();
  record("No Leaflet default blue pins", defaultPins === 0, `${defaultPins} default pins`);
  if (ctx.saveLook) await ctx.shot(page, 'trip-overview');

  await page.goto(`${ctx.base}/trips`, { waitUntil: 'networkidle' });
  const tripRow = page.getByRole('link', { name: /Manali Trip/ });
  const rowText = (await tripRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
  record('"Manali Trip" shows on My Trips with its location', /Manali Trip/.test(rowText) && /Manali, Himachal Pradesh/.test(rowText), rowText);
  if (ctx.saveLook) await ctx.shot(page, 'trips-list');

  await tripRow.click();
  await page.getByRole('link', { name: 'Trip settings' }).click();
  await page.getByLabel('Trip name').fill('Manali Trip with the college group, four days in the mountains before exams begin');
  await page.getByRole('button', { name: 'Save the changes' }).click();
  const longNameError = await page.locator('[aria-invalid="true"]').count();
  record('Settings: an over-long name is refused under the field', longNameError === 1, `${longNameError} fields marked`);
  await page.getByLabel('Trip name').fill('Manali Trip');
  await page.getByRole('button', { name: 'Delete the trip' }).click();
  const dialogOpen = await page.getByRole('dialog').isVisible().catch(() => false);
  record('Delete asks first in a TripSync dialog (no browser confirm box)', dialogOpen);
  if (ctx.saveLook) await ctx.shot(page, 'delete-dialog');
  await page.getByRole('button', { name: 'Keep it' }).click();
  record('No script errors in the trip screens', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await context.close();

  const phone = await ctx.openPage(...ctx.PHONE);
  await ctx.login(phone.page, traveller);
  for (const route of ['/trips', '/trips/new']) {
    await phone.page.goto(ctx.base + route, { waitUntil: 'networkidle' });
    const extra = await ctx.overflowOf(phone.page);
    record(`Phone width, ${route}: no sideways scrolling`, extra <= 0, `${extra}px`);
  }
  await phone.page.goto(`${ctx.base}/trips`, { waitUntil: 'networkidle' });
  await phone.page.getByRole('link', { name: /Manali Trip/ }).click();
  await phone.page.waitForURL(/\/trips\/[a-f0-9]{24}$/);
  await phone.page.waitForLoadState('networkidle');
  const extra = await ctx.overflowOf(phone.page);
  record('Phone width, the trip page: no sideways scrolling', extra <= 0, `${extra}px`);
  if (ctx.saveLook) await ctx.shot(phone.page, 'trip-phone');
  await phone.context.close();

  // /status: the turning "still checking" mark stands still with reduced motion
  const calm = await ctx.openPage(undefined, undefined, { reducedMotion: 'reduce' });
  await calm.page.route('**/api/health/ping', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await calm.page.goto(`${ctx.base}/status`);
  const mark = calm.page.locator('li', { hasText: 'API' }).first().locator('span[aria-hidden="true"]');
  await mark.waitFor({ timeout: 5000 });
  const anim = await mark.evaluate((el) => getComputedStyle(el).animationName);
  record('/status: the "still checking" mark stands still with reduced motion', anim === 'none', `animation "${anim}"`);
  await calm.context.close();
}
