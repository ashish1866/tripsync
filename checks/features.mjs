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

const sections = [tripsChecks, itineraryChecks, weatherChecks];

// ====================== Step 4: weather ======================
async function weatherChecks(ctx) {
  const { call, record, hasError, db } = ctx;
  ctx.setSection('Weather API');
  const KEY = '32.26,77.17'; // Manali rounded to 2 decimals, "lat,lng"
  const cache = db.collection('weatherCache');

  const owner = await ctx.newUser('wxowner', 'Ashish Weather');
  const friend = await ctx.newUser('wxfriend', 'Dhruv Weather');
  const stranger = await ctx.newUser('wxstranger', 'Ankit Weather');
  const trip = await makeTrip(ctx, owner, { start: 3, days: 4 });

  await cache.deleteMany({ key: KEY });
  const first = await call('GET', `/trips/${trip.id}/weather`, { token: owner.token });
  const w1 = first.data?.weather;
  const allForecast = w1?.days?.length === 4 && w1.days.every((d) => d.status === 'forecast' && typeof d.label === 'string' && 'rainChance' in d);
  record('First visit asks Open-Meteo and gives a forecast for all 4 days', first.status === 200 && w1?.source === 'open-meteo' && allForecast, `HTTP ${first.status} ${first.data?.error ?? `source ${w1?.source}, ${w1?.days?.map((d) => d.status).join(',')}`}`);
  record('Temperatures are whole numbers from the forecast', w1?.days?.every((d) => Number.isInteger(d.max) && Number.isInteger(d.min) && d.max >= d.min), JSON.stringify(w1?.days?.map((d) => [d.max, d.min])));
  const doc = await cache.findOne({ key: KEY });
  record(`The forecast is stored in weatherCache under "${KEY}"`, doc && Array.isArray(doc.data?.daily?.time) && doc.createdAt instanceof Date, doc ? `${doc.data?.daily?.time?.length} days stored` : 'no document');

  const second = await call('GET', `/trips/${trip.id}/weather`, { token: owner.token });
  const docAfter = await cache.findOne({ key: KEY });
  record(
    'Second visit uses the cache: no Open-Meteo call, same check time, one cache entry',
    second.data?.weather?.source === 'cache' && second.data.weather.fetchedAt === w1?.fetchedAt && docAfter?.createdAt?.getTime() === doc?.createdAt?.getTime() && (await cache.countDocuments({ key: KEY })) === 1,
    `source ${second.data?.weather?.source}, fetchedAt ${second.data?.weather?.fetchedAt} vs ${w1?.fetchedAt}`,
  );

  const friendTrip = await makeTrip(ctx, friend, { name: 'Manali with cousins', start: 4, days: 2 });
  const shared = await call('GET', `/trips/${friendTrip.id}/weather`, { token: friend.token });
  record("Another group's trip to the same town shares the cached forecast", shared.data?.weather?.source === 'cache' && shared.data.weather.place === KEY, `source ${shared.data?.weather?.source}, place ${shared.data?.weather?.place}`);

  // An old entry (over 3 hours) is not used, even before MongoDB's TTL clean-up removes it
  await cache.updateOne({ key: KEY }, { $set: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000 - 60_000) } });
  const stale = await call('GET', `/trips/${trip.id}/weather`, { token: owner.token });
  record('An entry older than 3 hours is refreshed from Open-Meteo (age checked in code)', stale.data?.weather?.source === 'open-meteo', `source ${stale.data?.weather?.source}`);

  const far = await makeTrip(ctx, owner, { name: 'Manali in winter', start: 40, days: 3 });
  const farW = await call('GET', `/trips/${far.id}/weather`, { token: owner.token });
  record('A trip 40 days away: every day "later", and Open-Meteo is not asked', farW.status === 200 && farW.data.weather.source === 'none' && farW.data.weather.days.every((d) => d.status === 'later' && !('max' in d)), `source ${farW.data?.weather?.source}, ${farW.data?.weather?.days?.map((d) => d.status).join(',')}`);
  const edge = await makeTrip(ctx, owner, { name: 'Manali at the edge', start: 13, days: 6 });
  const edgeW = await call('GET', `/trips/${edge.id}/weather`, { token: owner.token });
  const edgeStatus = edgeW.data?.weather?.days?.map((d) => d.status).join(',');
  record('A trip at the edge of the 16 days: forecast for the first days, "later" after', edgeStatus === 'forecast,forecast,forecast,later,later,later', edgeStatus);

  const strangerW = await call('GET', `/trips/${trip.id}/weather`, { token: stranger.token });
  record('A stranger asking for the weather: 403', strangerW.status === 403 && hasError(strangerW), `HTTP ${strangerW.status}`);
  const noToken = await call('GET', `/trips/${trip.id}/weather`);
  record('Weather without logging in: 401', noToken.status === 401, `HTTP ${noToken.status}`);

  // ---------- in the browser ----------
  ctx.setSection('Weather in the browser');
  const traveller = await ctx.newUser('wxweb', 'Ashish Bisht');
  const webTrip = await makeTrip(ctx, traveller, { start: 3, days: 4 });
  for (const day of [1, 2]) {
    await call('POST', `/trips/${webTrip.id}/days/${day}/activities`, { token: traveller.token, body: { title: day === 1 ? 'Hadimba Devi Temple' : 'Solang Valley' } });
  }
  const { context, page, consoleErrors } = await ctx.openPage();
  await ctx.login(page, traveller);
  const tripUrl = `${ctx.base}/trips/${webTrip.id}`;

  await page.goto(tripUrl, { waitUntil: 'networkidle' });
  const sourceLine = await page.getByText(/Forecast from Open-Meteo, checked at/).waitFor({ timeout: 15000 }).then(() => true, () => false);
  const stoneText = (await page.getByRole('list', { name: 'Days of the trip' }).innerText()).replace(/\s+/g, ' ');
  record('The overview shows the forecast on every day stone and says where it is from', sourceLine && (stoneText.match(/°/g) || []).length >= 8 && (stoneText.match(/Rain (\d+%|chance not given)/g) || []).length === 4, stoneText.slice(0, 200));
  if (ctx.saveLook) await ctx.shot(page, 'weather-overview');

  // Rain warning: the rule is checked with a planted forecast, since real rain cannot be ordered
  const planted = (chances) => ({
    weather: {
      place: KEY,
      source: 'cache',
      fetchedAt: new Date().toISOString(),
      timezone: 'Asia/Kolkata',
      forecastDays: 16,
      rainLimit: 60,
      days: webTrip.days.map((d, i) => ({ dayNumber: d.dayNumber, date: d.date, status: 'forecast', max: 14, min: 4, rainChance: chances[i], code: 63, label: 'Rain', kind: 'rain' })),
    },
  });
  await page.route('**/api/trips/*/weather', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(planted([60, 85, 90, 10])) }));
  await page.reload({ waitUntil: 'networkidle' });
  const warnings = await page.getByRole('alert').filter({ hasText: /Rain likely on Day/ }).allInnerTexts();
  record('Rain warning only for the day with stops above 60% (Day 2, not Day 1 at 60% or Day 3 with no stops)', warnings.length === 1 && /Day 2/.test(warnings[0]), JSON.stringify(warnings));
  const stoneWarn = await page.getByRole('list', { name: 'Days of the trip' }).getByText(/rain warning/).count();
  record('The Day 2 stone carries the warning sign', stoneWarn === 1, `${stoneWarn} stones`);
  await page.goto(`${tripUrl}/plan?day=2`, { waitUntil: 'networkidle' });
  const planWarn = await page.getByRole('alert').filter({ hasText: 'Rain likely on Day 2' }).count();
  const planLine = await page.getByText(/Rain, 14° to 4°C, 85% chance of rain/).count();
  record('The day plan shows Day 2 forecast in words and its warning', planWarn === 1 && planLine === 1, `${planWarn} warning, ${planLine} line`);
  if (ctx.saveLook) await ctx.shot(page, 'weather-warning');
  await page.unroute('**/api/trips/*/weather');

  // The weather failing breaks only the weather box
  await page.route('**/api/trips/*/weather', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'The weather service is not answering right now. Try again in a minute.' }) }));
  await page.goto(tripUrl, { waitUntil: 'networkidle' });
  const boxError = await page.getByRole('alert').filter({ hasText: 'The forecast could not be loaded' }).count();
  const stillThere = (await page.locator('h1').innerText()) === 'Manali Trip' && (await page.getByRole('list', { name: 'Days of the trip' }).getByRole('listitem').count()) === 4 && (await page.locator('.ts-pin-destination').count()) === 1;
  record('Weather failing: only the weather box shows an error; name, day stones and map still work', boxError === 1 && stillThere, `${boxError} weather errors, rest ${stillThere ? 'fine' : 'broken'}`);
  await page.unroute('**/api/trips/*/weather');
  await page.getByRole('button', { name: 'Try the forecast again' }).click();
  const recovered = await page.getByText(/Forecast from Open-Meteo, checked at/).waitFor({ timeout: 15000 }).then(() => true, () => false);
  record('"Try the forecast again" brings the forecast back', recovered);

  const farTrip = await makeTrip(ctx, traveller, { name: 'Manali in winter', start: 40, days: 3 });
  await page.goto(`${ctx.base}/trips/${farTrip.id}`, { waitUntil: 'networkidle' });
  const closer = await page.getByText(/The forecast appears closer to the trip/).waitFor({ timeout: 15000 }).then(() => true, () => false);
  const laterStones = await page.getByRole('list', { name: 'Days of the trip' }).getByText('Forecast later').count();
  record('A trip 40 days away says the forecast appears closer to the trip, and shows no weather', closer && laterStones === 3, `${laterStones} stones say "Forecast later"`);
  record('No script errors on the weather screens', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await context.close();
}

// ====================== Step 3: itinerary and map ======================
async function itineraryChecks(ctx) {
  const { call, record, hasError } = ctx;
  ctx.setSection('Day plan API');

  const owner = await ctx.newUser('planowner', 'Ashish Plan');
  const editor = await ctx.newUser('planeditor', 'Dhruv Plan');
  const viewer = await ctx.newUser('planviewer', 'Rohan Plan');
  const stranger = await ctx.newUser('planstranger', 'Ankit Plan');
  const trip = await makeTrip(ctx, owner);
  await addMember(ctx, trip.id, editor, 'editor');
  await addMember(ctx, trip.id, viewer, 'viewer');
  const base = `/trips/${trip.id}`;
  const dayOf = (t, n) => t.days.find((d) => d.dayNumber === n);

  // Stop search (Geoapify, through our API only)
  const spots = await call('GET', `/geo/spots?q=${encodeURIComponent('Solang Valley')}&tripId=${trip.id}`, { token: editor.token });
  const solang = spots.data?.results?.find((r) => r.name === 'Solang Valley');
  record('Stop search "Solang Valley" near the trip finds it', spots.status === 200 && solang, `HTTP ${spots.status} ${spots.data?.error ?? spots.data?.results?.map((r) => r.name).join(', ')}`);
  record('Its map point is [longitude, latitude] near Solang', solang && Math.abs(solang.location[0] - 77.156) < 0.05 && Math.abs(solang.location[1] - 32.317) < 0.05, JSON.stringify(solang?.location));
  const spotsStranger = await call('GET', `/geo/spots?q=Solang&tripId=${trip.id}`, { token: stranger.token });
  record('Stop search for a trip you are not in: 403', spotsStranger.status === 403, `HTTP ${spotsStranger.status}`);
  const spotsNoTrip = await call('GET', '/geo/spots?q=Solang', { token: owner.token });
  record('Stop search without a trip: 404', spotsNoTrip.status === 404 && hasError(spotsNoTrip), `HTTP ${spotsNoTrip.status}`);
  const spotsShort = await call('GET', `/geo/spots?q=S&tripId=${trip.id}`, { token: owner.token });
  record('Stop search with 1 letter: 400', spotsShort.status === 400, `HTTP ${spotsShort.status}`);
  const html = JSON.stringify(spots.data ?? {});
  record('The search answer carries no Geoapify key', !/apiKey|api_key/i.test(html), 'key-like text in the answer');

  // Add
  const place = solang || { name: 'Solang Valley', address: 'Solang, Manali, India', location: [77.156, 32.3174], placeId: '' };
  const added = await call('POST', `${base}/days/2/activities`, { token: editor.token, body: { title: 'Solang Valley', time: '10:00', notes: 'Paragliding if the wind is calm', place } });
  const day2 = added.data?.trip && dayOf(added.data.trip, 2);
  record('Editor adds "Solang Valley" to Day 2: 201', added.status === 201 && day2?.activities[0]?.title === 'Solang Valley', `HTTP ${added.status} ${added.data?.error ?? ''}`);
  const solangId = added.data?.activity?.id;
  record('The stop keeps its place, time, notes and who added it', day2?.activities[0]?.place?.location?.[0] === place.location[0] && day2.activities[0].time === '10:00' && day2.activities[0].addedBy === editor.uid, JSON.stringify(day2?.activities[0] ?? null).slice(0, 200));

  const viewerAdd = await call('POST', `${base}/days/2/activities`, { token: viewer.token, body: { title: 'Viewer stop' } });
  record('A viewer adding a stop: 403', viewerAdd.status === 403 && hasError(viewerAdd), `HTTP ${viewerAdd.status}`);
  const strangerAdd = await call('POST', `${base}/days/2/activities`, { token: stranger.token, body: { title: 'Stranger stop' } });
  record('A stranger adding a stop: 403', strangerAdd.status === 403, `HTTP ${strangerAdd.status}`);
  const noTokenAdd = await call('POST', `${base}/days/2/activities`, { body: { title: 'No token' } });
  record('Adding a stop without logging in: 401', noTokenAdd.status === 401, `HTTP ${noTokenAdd.status}`);

  const badStops = [
    ['an empty name', { title: '  ' }],
    ['a time of 25:00', { title: 'Late', time: '25:00' }],
    ['notes over 500 characters', { title: 'Long', notes: 'x'.repeat(501) }],
    ['a place off the globe', { title: 'Nowhere', place: { ...place, location: [200, 95] } }],
    ['an extra field (addedBy)', { title: 'Sneaky', addedBy: stranger.uid }],
    ['a title that is not text', { title: { $gt: '' } }],
  ];
  for (const [label, body] of badStops) {
    const r = await call('POST', `${base}/days/2/activities`, { token: owner.token, body });
    record(`Adding a stop with ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }
  const noDay = await call('POST', `${base}/days/9/activities`, { token: owner.token, body: { title: 'Day 9' } });
  record('Adding to a day the trip does not have (Day 9): 404', noDay.status === 404 && hasError(noDay), `HTTP ${noDay.status}`);
  const badDay = await call('POST', `${base}/days/two/activities`, { token: owner.token, body: { title: 'Day two' } });
  record('Adding to day "two": 400', badDay.status === 400, `HTTP ${badDay.status}`);

  // Time order inside a day
  for (const [title, time] of [['Hadimba Devi Temple', '09:00'], ['Lunch on Mall Road', '13:00'], ['Breakfast at the hotel', '08:00'], ['Evening walk', '']]) {
    await call('POST', `${base}/days/1/activities`, { token: owner.token, body: { title, time } });
  }
  const afterOrder = await call('GET', base, { token: owner.token });
  const order1 = dayOf(afterOrder.data.trip, 1).activities.map((a) => a.title);
  record('A day keeps its stops in time order, untimed ones last', JSON.stringify(order1) === JSON.stringify(['Breakfast at the hotel', 'Hadimba Devi Temple', 'Lunch on Mall Road', 'Evening walk']), JSON.stringify(order1));
  const [breakfast, hadimba] = dayOf(afterOrder.data.trip, 1).activities;

  // Safe edits: two members at the same moment
  const [a, b] = await Promise.all([
    call('PATCH', `${base}/activities/${hadimba.id}`, { token: owner.token, body: { notes: 'Shoes off at the gate' } }),
    call('PATCH', `${base}/activities/${hadimba.id}`, { token: editor.token, body: { title: 'Hadimba Temple' } }),
  ]);
  const [c, d] = await Promise.all([
    call('PATCH', `${base}/activities/${breakfast.id}`, { token: owner.token, body: { time: '07:30' } }),
    call('PATCH', `${base}/activities/${solangId}`, { token: editor.token, body: { notes: 'Carry jackets' } }),
  ]);
  const both = await call('GET', base, { token: owner.token });
  const h = both.data.trip.days.flatMap((x) => x.activities).find((x) => x.id === hadimba.id);
  const bf = both.data.trip.days.flatMap((x) => x.activities).find((x) => x.id === breakfast.id);
  const so = both.data.trip.days.flatMap((x) => x.activities).find((x) => x.id === solangId);
  record('Two members edit different fields of one stop at once: both edits kept', a.status === 200 && b.status === 200 && h?.title === 'Hadimba Temple' && h.notes === 'Shoes off at the gate' && h.time === '09:00', JSON.stringify(h).slice(0, 200));
  record('Two members edit two different stops at once: both edits kept', c.status === 200 && d.status === 200 && bf?.time === '07:30' && so?.notes === 'Carry jackets' && so.title === 'Solang Valley' && so.place?.name === place.name, `${bf?.time} / ${so?.notes}`);
  record('An edit records who changed the stop', h?.updatedBy === owner.uid || h?.updatedBy === editor.uid, h?.updatedBy);

  const viewerEdit = await call('PATCH', `${base}/activities/${solangId}`, { token: viewer.token, body: { title: 'Changed by viewer' } });
  record('A viewer editing a stop: 403', viewerEdit.status === 403, `HTTP ${viewerEdit.status}`);
  const viewerDelete = await call('DELETE', `${base}/activities/${solangId}`, { token: viewer.token });
  record('A viewer removing a stop: 403', viewerDelete.status === 403, `HTTP ${viewerDelete.status}`);
  const emptyEdit = await call('PATCH', `${base}/activities/${solangId}`, { token: owner.token, body: {} });
  record('An edit with nothing to change: 400', emptyEdit.status === 400 && hasError(emptyEdit), `HTTP ${emptyEdit.status}`);
  const missingEdit = await call('PATCH', `${base}/activities/0000000000000000`, { token: owner.token, body: { title: 'Ghost' } });
  record('Editing a stop that does not exist: 404', missingEdit.status === 404 && hasError(missingEdit), `HTTP ${missingEdit.status}`);

  // Move to another day, all its fields kept
  const moved = await call('PATCH', `${base}/activities/${hadimba.id}`, { token: editor.token, body: { dayNumber: 3 } });
  const m3 = moved.data?.trip && dayOf(moved.data.trip, 3).activities;
  const m1 = moved.data?.trip && dayOf(moved.data.trip, 1).activities;
  record('Moving a stop to Day 3: gone from Day 1, on Day 3 with its notes', moved.status === 200 && m3?.some((x) => x.id === hadimba.id && x.notes === 'Shoes off at the gate') && !m1?.some((x) => x.id === hadimba.id) && m1?.length === 3, `HTTP ${moved.status} ${moved.data?.error ?? ''}`);
  const moveFar = await call('PATCH', `${base}/activities/${hadimba.id}`, { token: editor.token, body: { dayNumber: 9 } });
  record('Moving a stop to a day the trip does not have: 400', moveFar.status === 400 && hasError(moveFar), `HTTP ${moveFar.status} ${moveFar.data?.error ?? ''}`);

  // Remove
  const removed = await call('DELETE', `${base}/activities/${hadimba.id}`, { token: editor.token });
  const removedAgain = await call('DELETE', `${base}/activities/${hadimba.id}`, { token: editor.token });
  const stillThere = removed.data?.trip?.days.some((x) => x.activities.some((y) => y.id === hadimba.id));
  record('Removing a stop: 200, and removing it again: 404', removed.status === 200 && !stillThere && removedAgain.status === 404, `HTTP ${removed.status} then ${removedAgain.status}`);

  // ---------- in the browser ----------
  ctx.setSection('Day plan in the browser');
  const planner = await ctx.newUser('planweb', 'Ashish Bisht');
  const webTrip = await makeTrip(ctx, planner);
  const { context, page, consoleErrors } = await ctx.openPage();
  await ctx.login(page, planner);
  await page.goto(`${ctx.base}/trips/${webTrip.id}/plan?day=2`, { waitUntil: 'networkidle' });
  const emptyDay = await page.getByText('Nothing is planned for Day 2').isVisible().catch(() => false);
  record('An empty day says so and offers the add form', emptyDay && (await page.getByRole('form', { name: 'Add a stop to Day 2' }).count()) === 1);

  await page.getByRole('button', { name: 'Add to Day 2' }).click();
  const nameError = await page.locator('[aria-invalid="true"]').count();
  record('Adding with no name: an error under "Stop name"', nameError === 1, `${nameError} fields marked`);

  await page.getByRole('combobox', { name: 'Place' }).fill('Solang Valley');
  const option = page.getByRole('option', { name: /^Solang Valley/ });
  const offered = await option.first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  record('Typing "Solang Valley" offers it from the stop search', offered);
  if (offered) await option.first().click();
  const autoName = await page.getByLabel('Stop name').inputValue();
  record('Picking the place fills in the stop name', autoName.startsWith('Solang Valley'), `"${autoName}"`);
  await page.getByLabel('Stop name').fill('Solang Valley');
  await page.getByLabel('Time').fill('10:00');
  await page.getByRole('button', { name: 'Add to Day 2' }).click();
  const listed = await page.getByRole('list', { name: 'Stops on Day 2' }).getByText('Solang Valley').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  const stoneText = (await page.getByRole('list', { name: 'Days of the trip' }).getByRole('listitem').nth(1).innerText()).replace(/\s+/g, ' ');
  record('Day 2 shows Solang Valley, and its stone says "1 stop"', listed && /1 stop/.test(stoneText), stoneText);
  const livePins = await page.locator('.ts-pin-stop:not(.ts-pin-faded)').count();
  record('Solang Valley has a numbered stone pin on the map', livePins === 1, `${livePins} pins`);

  await page.getByRole('button', { name: 'Day 1', exact: false }).first().click();
  const fadedPins = await page.locator('.ts-pin-stop.ts-pin-faded').count();
  record('On Day 1, the Day 2 stop is a pale pin', fadedPins === 1, `${fadedPins} faded pins`);
  if (ctx.saveLook) await ctx.shot(page, 'day-plan');

  await page.getByRole('link', { name: 'Overview' }).click();
  await page.waitForURL(new RegExp(`/trips/${webTrip.id}$`));
  const overviewPins = await page.locator('.ts-pin-stop').count();
  const overviewDest = await page.locator('.ts-pin-destination').count();
  record('The overview map has the destination pin and a pin for every stop', overviewPins === 1 && overviewDest === 1, `${overviewDest} destination, ${overviewPins} stops`);
  record('No script errors on the day plan', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await context.close();

  // A viewer sees the plan but no way to change it
  const watcher = await ctx.newUser('planwatch', 'Rahul Viewer');
  await addMember(ctx, webTrip.id, watcher, 'viewer');
  const phone = await ctx.openPage(...ctx.PHONE);
  await ctx.login(phone.page, watcher);
  await phone.page.goto(`${ctx.base}/trips/${webTrip.id}/plan?day=2`, { waitUntil: 'networkidle' });
  await phone.page.getByRole('list', { name: 'Stops on Day 2' }).waitFor({ timeout: 15000 }).catch(() => {});
  const viewerForms = await phone.page.getByRole('form').count();
  const viewerButtons = await phone.page.getByRole('button', { name: /^(Edit|Remove) / }).count();
  const viewerLine = await phone.page.getByText('You can view this trip').isVisible().catch(() => false);
  await phone.page.getByText(/Checking the forecast/).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  record('A viewer sees the stops with no add form and no Edit or Remove', viewerForms === 0 && viewerButtons === 0 && viewerLine, `${viewerForms} forms, ${viewerButtons} buttons`);
  const extra = await ctx.overflowOf(phone.page);
  record(`Phone width (${ctx.PHONE[0]}px), the day plan: no sideways scrolling`, extra <= 0, `${extra}px`);
  if (ctx.saveLook) await ctx.shot(phone.page, 'day-plan-phone');
  await phone.context.close();
}

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
  // Measure once the forecast has filled the day stones (it loads after the trip).
  await phone.page.getByText(/Forecast from Open-Meteo|forecast could not be loaded|appears closer/).first().waitFor({ timeout: 15000 }).catch(() => {});
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
