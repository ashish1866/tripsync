// Feature checks for Steps 2 onward, called by checks/run.mjs after the sign-up story.
// Each section uses its own throwaway accounts (made through ctx.newUser, so the
// clean-up in run.mjs deletes them and everything they own).
//
// ctx: { base, call, record, setSection, newUser, limiter, db, openPage, PHONE, shot, saveLook, overflowOf, hasError, login }
// newUser(tag, name) gives a pool account (the same person for the same name in every section; its data is wiped before and after the run).

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

const sections = [tripsChecks, itineraryChecks, weatherChecks, membersChecks, moneyChecks, exploreChecks, packingChecks, extrasChecks];

// ====================== Step 9: best order, bill filters and paging ======================
async function extrasChecks(ctx) {
  const { call, record, hasError, db } = ctx;
  ctx.setSection('Best order API');

  const owner = await ctx.newUser('yowner', 'Ashish Check');
  const editor = await ctx.newUser('yeditor', 'Dhruv Check');
  const viewer = await ctx.newUser('yviewer', 'Rohan Check');
  const stranger = await ctx.newUser('ystranger', 'Ankit Check');
  const trip = await makeTrip(ctx, owner);
  await addMember(ctx, trip.id, editor, 'editor');
  await addMember(ctx, trip.id, viewer, 'viewer');
  const t = `/trips/${trip.id}`;

  // Real places around Manali, added in a deliberately wasteful order
  const spot = (name, lng, lat) => ({ name, address: 'Manali, Himachal Pradesh', location: [lng, lat], placeId: `check-${name.replace(/\W/g, '')}` });
  const MALL = spot('Mall Road', 77.1892, 32.2432);
  const SOLANG = spot('Solang Valley', 77.1566, 32.3161);
  const HADIMBA = spot('Hadimba Temple', 77.1808, 32.2484);
  const OLD = spot('Old Manali', 77.1761, 32.2571);
  const add = async (day, title, place, time = '', token = owner.token) => (await call('POST', `${t}/days/${day}/activities`, { token, body: { title, place, time } })).data?.activity;
  const mall = await add(1, 'Mall Road', MALL);
  const solang = await add(1, 'Solang Valley', SOLANG);
  const hadimba = await add(1, 'Hadimba Temple', HADIMBA);
  const old = await add(1, 'Old Manali', OLD);
  const dayOne = async () => (await call('GET', t, { token: owner.token })).data.trip.days[0].activities;
  const titles = (list) => list.map((a) => a.title).join(' > ');
  const beforeOrder = titles(await dayOne());

  const asked = await call('GET', `${t}/days/1/best-order`, { token: viewer.token });
  const sug = asked.data;
  record('A viewer asks for the best order of Day 1: 200', asked.status === 200, `HTTP ${asked.status} ${asked.data?.error ?? ''}`);
  record('Nearest-first from Mall Road: Hadimba, then Old Manali, then Solang Valley', titles(sug?.order || []) === 'Mall Road > Hadimba Temple > Old Manali > Solang Valley', titles(sug?.order || []));
  record('It says the distances are straight lines, and the new route is shorter than the old one', sug?.straightLine === true && sug.changed === true && sug.suggestedMetres < sug.currentMetres && sug.order[0].metresFromPrevious === null, `now ${sug?.currentMetres} m, suggested ${sug?.suggestedMetres} m`);
  record('Asking changes nothing: the day is still in the order it was', titles(await dayOne()) === beforeOrder, titles(await dayOne()));
  const missing = await call('GET', `${t}/days/9/best-order`, { token: owner.token });
  const garbled = await call('GET', `${t}/days/two/best-order`, { token: owner.token });
  const outsider = await call('GET', `${t}/days/1/best-order`, { token: stranger.token });
  record('A day the trip does not have: 404; day "two": 400; a stranger: 403', missing.status === 404 && garbled.status === 400 && outsider.status === 403, `${missing.status}/${garbled.status}/${outsider.status}`);

  // Applying it
  const ids = (sug?.order || []).map((s) => s.id);
  const viewerPut = await call('PUT', `${t}/days/1/order`, { token: viewer.token, body: { order: ids } });
  const strangerPut = await call('PUT', `${t}/days/1/order`, { token: stranger.token, body: { order: ids } });
  const noTokenPut = await call('PUT', `${t}/days/1/order`, { body: { order: ids } });
  record('A viewer applying an order: 403; a stranger: 403; no login: 401', viewerPut.status === 403 && hasError(viewerPut) && strangerPut.status === 403 && noTokenPut.status === 401, `${viewerPut.status}/${strangerPut.status}/${noTokenPut.status}`);
  record('...and the day is still unchanged', titles(await dayOne()) === beforeOrder);
  const badOrders = [
    ['an empty list', { order: [] }],
    ['the same stop twice', { order: [ids[0], ids[0]] }],
    ['something that is not a list', { order: 'Hadimba' }],
    ['ids with odd characters', { order: ['../x'] }],
    ['an extra field', { order: ids, day: 2 }],
  ];
  for (const [label, body] of badOrders) {
    const r = await call('PUT', `${t}/days/1/order`, { token: editor.token, body });
    record(`Applying an order with ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }
  const applied = await call('PUT', `${t}/days/1/order`, { token: editor.token, body: { order: ids } });
  const afterList = applied.data?.trip?.days?.[0]?.activities || [];
  const intact = afterList.every((a) => a.place && a.addedBy === owner.uid && a.id);
  record('An editor applies it: 200, the day is now nearest-first, every stop keeps its place and author', applied.status === 200 && titles(afterList) === 'Mall Road > Hadimba Temple > Old Manali > Solang Valley' && intact, `HTTP ${applied.status} ${titles(afterList)}`);
  const again = await call('GET', `${t}/days/1/best-order`, { token: owner.token });
  record('Asking again says it is already the nearest-first order (changed: false)', again.data?.changed === false, JSON.stringify(again.data?.changed));
  const otherDay = (await call('GET', t, { token: owner.token })).data.trip.days.slice(1).every((d) => d.activities.length === 0);
  record('No other day was touched', otherDay);

  // Safe edits: the day changed between asking and applying
  const late = await add(1, 'Late addition', MALL);
  const putStale = await call('PUT', `${t}/days/1/order`, { token: owner.token, body: { order: [...ids].reverse().concat(['0000000000000000']) } });
  const staleList = putStale.data?.trip?.days?.[0]?.activities || [];
  record('A stop added after asking stays, at the end; an id that is not in the day is ignored', putStale.status === 200 && titles(staleList) === 'Solang Valley > Old Manali > Hadimba Temple > Mall Road > Late addition', `HTTP ${putStale.status} ${titles(staleList)}`);
  await call('DELETE', `${t}/activities/${late.id}`, { token: owner.token });
  const droppedId = old.id;
  await call('DELETE', `${t}/activities/${droppedId}`, { token: owner.token });
  const putWithGone = await call('PUT', `${t}/days/1/order`, { token: owner.token, body: { order: ids } });
  record('A stop deleted after asking is skipped, the rest follow the order', putWithGone.status === 200 && titles(putWithGone.data.trip.days[0].activities) === 'Mall Road > Hadimba Temple > Solang Valley', titles(putWithGone.data?.trip?.days?.[0]?.activities || []));

  // Stops with no place, and times that would run backwards
  const noPlace = await add(2, 'Lunch somewhere', null);
  // Stops are stored in time order: Start 09:00, Far 10:00, Near 11:00. Nearest-first from Start
  // goes to Near before Far, so the times would read 09:00, 11:00, 10:00 (backwards).
  await add(2, 'Start', MALL, '09:00');
  await add(2, 'Far stop', SOLANG, '10:00');
  await add(2, 'Near stop', HADIMBA, '11:00');
  const day2 = await call('GET', `${t}/days/2/best-order`, { token: owner.token });
  record('A stop with no map point goes last, and the answer counts placed and unplaced stops', day2.data?.order?.at(-1)?.id === noPlace?.id && day2.data.placedCount === 3 && day2.data.unplacedCount === 1 && day2.data.order.at(-1).metresFromPrevious === null, titles(day2.data?.order || []));
  record('If the new order puts a later time before an earlier one, it says so (timeClash)', day2.data?.timeClash === true && day2.data.changed === true, `timeClash ${day2.data?.timeClash}`);
  const day3 = await call('GET', `${t}/days/3/best-order`, { token: owner.token });
  await add(3, 'Only one', MALL);
  const day3b = await call('GET', `${t}/days/3/best-order`, { token: owner.token });
  record('A day with fewer than two placed stops has nothing to order', day3.data?.placedCount === 0 && day3b.data?.placedCount === 1 && day3b.data.changed === false, `${day3.data?.placedCount}/${day3b.data?.placedCount}`);

  // ---------- bill filters and paging ----------
  ctx.setSection('Bill filters and paging');
  const ra = await ctx.newUser('yra', 'Ashish Check');
  const rb = await ctx.newUser('yrb', 'Rahul Check');
  const rc = await ctx.newUser('yrc', 'Ankit Check');
  const bigTrip = await makeTrip(ctx, ra, { name: 'Manali with everyone', days: 5 });
  await addMember(ctx, bigTrip.id, rb, 'editor');
  await addMember(ctx, bigTrip.id, rc, 'viewer');
  const bt = `/trips/${bigTrip.id}`;
  const cats = ['stay', 'travel', 'food', 'activities', 'shopping', 'other'];
  const people = [ra, rb, rc];
  const base = Date.now();
  const rows = [];
  for (let i = 0; i < 45; i++) {
    const among = i % 2 === 0 ? [ra, rb] : [rb, rc];
    rows.push({
      tripId: new ObjectId(bigTrip.id), title: `Bill ${String(i + 1).padStart(2, '0')}`, amount: 100000 + i * 100, category: cats[i % 6], paidBy: people[i % 3].uid,
      date: dayFromToday(-i), type: 'expense', splitType: 'equal', splits: among.map((p) => ({ uid: p.uid, share: (100000 + i * 100) / 2 })),
      createdBy: ra.uid, createdAt: new Date(base + i * 1000), updatedAt: new Date(base + i * 1000),
    });
  }
  for (let i = 0; i < 2; i++) {
    rows.push({
      tripId: new ObjectId(bigTrip.id), title: `Payment ${i + 1}`, amount: 50000, category: 'settlement', paidBy: rc.uid, date: dayFromToday(5), type: 'settlement', splitType: 'exact',
      splits: [{ uid: ra.uid, share: 50000 }], createdBy: rc.uid, createdAt: new Date(base + 100000 + i * 1000), updatedAt: new Date(base + 100000 + i * 1000),
    });
  }
  await db.collection('expenses').insertMany(rows);
  // What the server should answer, worked out here without its code: newest date first, then newest created.
  const newestFirst = (a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);
  const expectIds = (rule) => rows.filter(rule).sort(newestFirst).map((r) => r.title);
  const ask = async (query, user = ra) => (await call('GET', `${bt}/expenses${query}`, { token: user.token }));
  const got = (r) => (r.data?.expenses || []).map((e) => e.title);

  const p1 = await ask('');
  const p2 = await ask('?page=2');
  const p3 = await ask('?page=3');
  const p4 = await ask('?page=4');
  record('47 bills and payments: page 1 has 20, page 2 has 20, page 3 has 7', got(p1).length === 20 && got(p2).length === 20 && got(p3).length === 7, `${got(p1).length}/${got(p2).length}/${got(p3).length}`);
  record('The answer says page, pages (3), page size (20), total (47)', p1.data.page === 1 && p1.data.pages === 3 && p1.data.pageSize === 20 && p1.data.total === 47 && p1.data.allTotal === 47, JSON.stringify({ page: p1.data?.page, pages: p1.data?.pages, total: p1.data?.total }));
  record('The three pages together are every row once, newest first', JSON.stringify([...got(p1), ...got(p2), ...got(p3)]) === JSON.stringify(expectIds(() => true)), 'order or rows differ');
  record('A page past the end: 200 with no rows, and it still says there are 3 pages', p4.status === 200 && got(p4).length === 0 && p4.data.pages === 3, `HTTP ${p4.status} ${got(p4).length} rows`);

  const food = await ask('?category=food');
  record('Category food: exactly the food bills, with the matching total', JSON.stringify(got(food)) === JSON.stringify(expectIds((r) => r.category === 'food')) && food.data.total === rows.filter((r) => r.category === 'food').length && food.data.allTotal === 47, `${got(food).length} rows, total ${food.data?.total}`);
  const pays = await ask('?category=settlement');
  record('Category settlement: only the 2 payments marked as paid', JSON.stringify(got(pays)) === JSON.stringify(expectIds((r) => r.category === 'settlement')) && pays.data.total === 2, got(pays).join(', '));
  const mine = (uid) => (r) => r.paidBy === uid || r.splits.some((s) => s.uid === uid);
  const rahulAll = await ask(`?person=${rb.uid}`);
  const rahulP2 = await ask(`?person=${rb.uid}&page=2`);
  record('Person Rahul: every bill he paid or has a share in (all but none of the others), paged', rahulAll.data.total === rows.filter(mine(rb.uid)).length && JSON.stringify([...got(rahulAll), ...got(rahulP2)].slice(0, rahulAll.data.total)) === JSON.stringify(expectIds(mine(rb.uid))), `${rahulAll.data?.total} of 47`);
  const ankitAll = await ask(`?person=${rc.uid}`);
  record('Person Ankit: only bills he paid or shares, so fewer rows than Rahul', ankitAll.data.total === rows.filter(mine(rc.uid)).length && ankitAll.data.total < rahulAll.data.total, `${ankitAll.data?.total}`);
  const both = await ask(`?category=travel&person=${rb.uid}`);
  record('Category and person together: the rows that are both', JSON.stringify(got(both)) === JSON.stringify(expectIds((r) => r.category === 'travel' && mine(rb.uid)(r))), `${got(both).length} rows`);
  const none = await ask(`?category=settlement&person=${rb.uid}`);
  record('A filter nothing matches: 200, no rows, total 0, pages 1', none.status === 200 && got(none).length === 0 && none.data.total === 0 && none.data.pages === 1 && none.data.allTotal === 47, `HTTP ${none.status} total ${none.data?.total}`);

  for (const [label, query] of [['an unknown category', '?category=petrol'], ['page 0', '?page=0'], ['page "abc"', '?page=abc'], ['a 5-digit page', '?page=12345'], ['a person with spaces', '?person=a%20b']]) {
    const r = await ask(query);
    record(`Bills with ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }
  const injected = await ask('?person[$ne]=x');
  record('A MongoDB-looking query value is ignored, never run (returns all 47)', injected.status === 200 && injected.data.total === 47, `HTTP ${injected.status} total ${injected.data?.total}`);
  const viewerSees = await ask('', rc);
  const outsiderAsks = await ask('', await ctx.newUser('ystranger2', 'Kabir Check')); // not in this trip (Ankit is, as a viewer)
  record('A viewer reads the bills (200); a stranger cannot (403)', viewerSees.status === 200 && outsiderAsks.status === 403, `${viewerSees.status}/${outsiderAsks.status}`);

  // ---------- in the browser ----------
  ctx.setSection('Extras in the browser');
  const { context, page, consoleErrors } = await ctx.openPage();
  await ctx.login(page, ra);
  await page.goto(`${ctx.base}/trips/${bigTrip.id}/money`, { waitUntil: 'networkidle' });
  const ledger = page.getByRole('list', { name: 'All bills and payments' });
  await ledger.waitFor({ timeout: 20000 }).catch(() => {});
  const firstPage = await ledger.getByRole('listitem').count();
  const pager = (await page.getByRole('navigation', { name: 'Pages of bills' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  record('The money screen shows 20 bills, "Page 1 of 3. Showing 1 to 20 of 47."', firstPage === 20 && /Page 1 of 3\. Showing 1 to 20 of 47\./.test(pager) && (await page.getByRole('heading', { name: 'Bills and payments, 47' }).count()) === 1, `${firstPage} rows, "${pager}"`);
  record('"Previous page" is locked on page 1', await page.getByRole('button', { name: 'Previous page' }).isDisabled());
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByText(/Page 2 of 3/).waitFor({ timeout: 15000 }).catch(() => {});
  const second = (await page.getByRole('navigation', { name: 'Pages of bills' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  record('Next page: "Page 2 of 3. Showing 21 to 40 of 47."', /Page 2 of 3\. Showing 21 to 40 of 47\./.test(second), second);
  await page.getByRole('group', { name: 'Filter the bills' }).getByLabel('Category').selectOption('food');
  await page.getByRole('heading', { name: new RegExp(`Bills and payments, ${rows.filter((r) => r.category === 'food').length} of 47`) }).waitFor({ timeout: 15000 }).catch(() => {});
  const foodRows = await ledger.getByRole('listitem').count();
  const foodHead = (await page.locator('#bills-title').innerText()).replace(/\s+/g, ' ');
  record('Choosing Food goes back to page 1 and shows only food bills ("8 of 47"), with no pager', foodRows === rows.filter((r) => r.category === 'food').length && /of 47/.test(foodHead) && (await page.getByRole('navigation', { name: 'Pages of bills' }).count()) === 0, `${foodRows} rows, "${foodHead}"`);
  await page.getByRole('group', { name: 'Filter the bills' }).getByLabel('Involving').selectOption(rc.uid);
  await page.waitForTimeout(800);
  const involving = await ledger.getByRole('listitem').count();
  record('Food and Ankit together narrows it further', involving === rows.filter((r) => r.category === 'food' && mine(rc.uid)(r)).length, `${involving} rows`);
  await page.getByRole('group', { name: 'Filter the bills' }).getByLabel('Category').selectOption('settlement');
  await page.getByRole('group', { name: 'Filter the bills' }).getByLabel('Involving').selectOption(rb.uid);
  const empty = await page.getByText('No bills match these filters.').waitFor({ timeout: 15000 }).then(() => true, () => false);
  record('A filter nothing matches says so and offers a way back', empty && (await page.getByRole('button', { name: 'Show every bill again' }).count()) === 1);
  await page.getByRole('button', { name: 'Clear the filters' }).click();
  await page.getByRole('heading', { name: 'Bills and payments, 47' }).waitFor({ timeout: 15000 }).catch(() => {});
  record('Clearing the filters brings back all 47', (await ledger.getByRole('listitem').count()) === 20);
  if (ctx.saveLook) await ctx.shot(page, 'money-filters');

  // Best order in the browser (its own page: the one above is logged in as someone else)
  record('No script errors on the money screen', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await context.close();
  const walker = await ctx.newUser('ywalk', 'Dhruv Check');
  const walkTrip = await makeTrip(ctx, walker);
  const wt = `/trips/${walkTrip.id}`;
  for (const [title, place] of [['Mall Road', MALL], ['Solang Valley', SOLANG], ['Hadimba Temple', HADIMBA]]) await call('POST', `${wt}/days/1/activities`, { token: walker.token, body: { title, place } });
  const walk = await ctx.openPage();
  const wp = walk.page;
  await ctx.login(wp, walker);
  await wp.goto(`${ctx.base}/trips/${walkTrip.id}/plan?day=1`, { waitUntil: 'networkidle' });
  await wp.getByRole('button', { name: 'Suggest the nearest-first order' }).click();
  const orderList = wp.getByRole('list', { name: 'Nearest-first order' });
  const shown = await orderList.waitFor({ timeout: 15000 }).then(() => orderList.innerText(), () => '');
  record('The Day plan suggests Mall Road, Hadimba Temple, Solang Valley, with the straight-line warning', /Mall Road[\s\S]*Hadimba Temple[\s\S]*Solang Valley/.test(shown) && (await wp.getByText(/straight lines, not road distances/).count()) === 1, shown.replace(/\s+/g, ' ').slice(0, 200));
  if (ctx.saveLook) await ctx.shot(wp, 'best-order');
  await wp.getByRole('button', { name: 'Keep my order' }).click();
  const unchanged = (await wp.getByRole('list', { name: 'Stops on Day 1' }).innerText()).replace(/\s+/g, ' ');
  record('"Keep my order" changes nothing', /Mall Road[\s\S]*Solang Valley[\s\S]*Hadimba Temple/.test(unchanged), unchanged.slice(0, 160));
  await wp.getByRole('button', { name: 'Suggest the nearest-first order' }).click();
  await wp.getByRole('button', { name: 'Use this order' }).click();
  await wp.getByRole('button', { name: 'Suggest the nearest-first order' }).waitFor({ timeout: 15000 }).catch(() => {});
  const reordered = (await wp.getByRole('list', { name: 'Stops on Day 1' }).innerText()).replace(/\s+/g, ' ');
  record('"Use this order" puts the stops in that order on the Day plan', /Mall Road[\s\S]*Hadimba Temple[\s\S]*Solang Valley/.test(reordered), reordered.slice(0, 160));
  record('No script errors on the day plan', walk.consoleErrors.length === 0, walk.consoleErrors.slice(0, 3).join(' | '));
  await walk.context.close();

  const watcher = await ctx.openPage(...ctx.PHONE);
  await ctx.login(watcher.page, viewer);
  await watcher.page.goto(`${ctx.base}/trips/${trip.id}/plan?day=1`, { waitUntil: 'networkidle' });
  await watcher.page.getByRole('list', { name: 'Stops on Day 1' }).waitFor({ timeout: 15000 }).catch(() => {});
  record('A viewer sees no "Best order" board on the Day plan', (await watcher.page.getByRole('button', { name: 'Suggest the nearest-first order' }).count()) === 0);
  await watcher.context.close();

  const phone = await ctx.openPage(...ctx.PHONE);
  await ctx.login(phone.page, ra);
  await phone.page.goto(`${ctx.base}/trips/${bigTrip.id}/money`, { waitUntil: 'networkidle' });
  await phone.page.getByRole('navigation', { name: 'Pages of bills' }).waitFor({ timeout: 15000 }).catch(() => {});
  const extra = await ctx.overflowOf(phone.page);
  record(`Phone width (${ctx.PHONE[0]}px), money with filters and pages: no sideways scrolling`, extra <= 0, `${extra}px`);
  await phone.context.close();
}

// ====================== Step 8: packing checklist ======================
async function packingChecks(ctx) {
  const { call, record, hasError } = ctx;
  ctx.setSection('Packing API');

  const owner = await ctx.newUser('kowner', 'Ashish Check');
  const editor = await ctx.newUser('keditor', 'Dhruv Check');
  const viewer = await ctx.newUser('kviewer', 'Rohan Check');
  const stranger = await ctx.newUser('kstranger', 'Ankit Check');
  const trip = await makeTrip(ctx, owner);
  await addMember(ctx, trip.id, editor, 'editor');
  await addMember(ctx, trip.id, viewer, 'viewer');
  const t = `/trips/${trip.id}`;
  const listOf = async (user) => (await call('GET', t, { token: user.token })).data?.trip?.checklist || [];

  const first = await call('POST', `${t}/checklist`, { token: owner.token, body: { text: '  Warm jacket  ' } });
  record('Owner adds "Warm jacket": 201, trimmed, not packed, with who added it', first.status === 201 && first.data.item.text === 'Warm jacket' && first.data.item.done === false && first.data.item.addedBy === owner.uid, `HTTP ${first.status} ${first.data?.error ?? ''}`);
  const second = await call('POST', `${t}/checklist`, { token: editor.token, body: { text: 'Power bank' } });
  const third = await call('POST', `${t}/checklist`, { token: editor.token, body: { text: 'Rain cover' } });
  record('An editor adds items too: 201', second.status === 201 && third.status === 201 && third.data.checklist.length === 3, `HTTP ${second.status}/${third.status}`);
  const [jacket, bank, cover] = [first, second, third].map((r) => r.data?.item);

  // Viewer, stranger, no login
  const vAdd = await call('POST', `${t}/checklist`, { token: viewer.token, body: { text: 'Viewer item' } });
  const vTick = await call('PATCH', `${t}/checklist/${jacket.id}`, { token: viewer.token, body: { done: true } });
  const vDelete = await call('DELETE', `${t}/checklist/${jacket.id}`, { token: viewer.token });
  record('A viewer adding, ticking or removing an item: 403 each', [vAdd, vTick, vDelete].every((r) => r.status === 403 && hasError(r)), [vAdd, vTick, vDelete].map((r) => r.status).join(','));
  const sTick = await call('PATCH', `${t}/checklist/${jacket.id}`, { token: stranger.token, body: { done: true } });
  const sRead = await call('GET', t, { token: stranger.token });
  record('A stranger ticking or reading the list: 403', sTick.status === 403 && sRead.status === 403, `${sTick.status}/${sRead.status}`);
  const noToken = await call('PATCH', `${t}/checklist/${jacket.id}`, { body: { done: true } });
  record('Ticking without logging in: 401', noToken.status === 401, `HTTP ${noToken.status}`);
  const afterViewer = await listOf(owner);
  record('...and the viewer changed nothing', afterViewer.length === 3 && afterViewer.every((i) => !i.done), JSON.stringify(afterViewer.map((i) => i.done)));

  // Bad input
  const bad = [
    ['an empty item', { text: '   ' }],
    ['an item over 80 characters', { text: 'x'.repeat(81) }],
    ['an item that is not text', { text: { $gt: '' } }],
    ['an extra field (done)', { text: 'Torch', done: true }],
  ];
  for (const [label, body] of bad) {
    const r = await call('POST', `${t}/checklist`, { token: owner.token, body });
    record(`Adding ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }
  const badTicks = [['nothing', {}], ['"true" as text', { done: 'true' }], ['a text change', { done: true, text: 'Changed' }]];
  for (const [label, body] of badTicks) {
    const r = await call('PATCH', `${t}/checklist/${jacket.id}`, { token: owner.token, body });
    record(`Ticking with ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }
  const ghost = await call('PATCH', `${t}/checklist/0000000000000000`, { token: owner.token, body: { done: true } });
  record('Ticking an item that is not on the list: 404', ghost.status === 404 && hasError(ghost), `HTTP ${ghost.status}`);

  // Ticking: who and when, and both accounts see it
  const ticked = await call('PATCH', `${t}/checklist/${jacket.id}`, { token: editor.token, body: { done: true } });
  const tickedItem = ticked.data?.checklist?.find((i) => i.id === jacket.id);
  record('An editor ticks "Warm jacket": 200, packed, with who and when', ticked.status === 200 && tickedItem?.done === true && tickedItem.doneBy === editor.uid && Boolean(tickedItem.doneAt), `HTTP ${ticked.status} ${JSON.stringify(tickedItem)}`);
  const ownerSees = (await listOf(owner)).find((i) => i.id === jacket.id);
  const viewerSees = (await listOf(viewer)).find((i) => i.id === jacket.id);
  record('The owner and a viewer both see the editor\'s tick after loading the trip again', ownerSees?.done === true && ownerSees.doneBy === editor.uid && viewerSees?.done === true, `${ownerSees?.done}/${viewerSees?.done}`);
  const tickedTwice = await call('PATCH', `${t}/checklist/${jacket.id}`, { token: owner.token, body: { done: true } });
  record('Ticking an already packed item keeps it packed (no flip)', tickedTwice.status === 200 && tickedTwice.data.checklist.find((i) => i.id === jacket.id).done === true, `HTTP ${tickedTwice.status}`);
  const unticked = await call('PATCH', `${t}/checklist/${jacket.id}`, { token: owner.token, body: { done: false } });
  const untickedItem = unticked.data?.checklist?.find((i) => i.id === jacket.id);
  record('Unticking clears it, including who packed it', unticked.status === 200 && untickedItem?.done === false && untickedItem.doneBy === null && untickedItem.doneAt === null, JSON.stringify(untickedItem));

  // Safe edits: two people tick two items at the same moment
  const [a, b] = await Promise.all([
    call('PATCH', `${t}/checklist/${bank.id}`, { token: owner.token, body: { done: true } }),
    call('PATCH', `${t}/checklist/${cover.id}`, { token: editor.token, body: { done: true } }),
  ]);
  const both = await listOf(owner);
  record('Two people tick two different items at the same moment: both ticks kept', a.status === 200 && b.status === 200 && both.find((i) => i.id === bank.id).done && both.find((i) => i.id === cover.id).done, both.map((i) => `${i.text}:${i.done}`).join(', '));

  // Removing
  const removed = await call('DELETE', `${t}/checklist/${cover.id}`, { token: editor.token });
  const removedAgain = await call('DELETE', `${t}/checklist/${cover.id}`, { token: editor.token });
  record('Removing an item: 200 and gone; removing it again: 404', removed.status === 200 && !removed.data.checklist.some((i) => i.id === cover.id) && removedAgain.status === 404, `HTTP ${removed.status} then ${removedAgain.status}`);

  // The list holds at most 100
  const full = await ctx.newUser('kfull', 'Kabir Check');
  const fullTrip = await makeTrip(ctx, full);
  await ctx.db.collection('trips').updateOne(
    { _id: new ObjectId(fullTrip.id) },
    { $set: { checklist: Array.from({ length: 100 }, (_, i) => ({ id: `filler${i}`, text: `Item ${i}`, done: false, addedBy: full.uid, createdAt: new Date(), doneBy: null, doneAt: null })) } },
  );
  const over = await call('POST', `/trips/${fullTrip.id}/checklist`, { token: full.token, body: { text: 'One too many' } });
  record('A list with 100 items refuses the 101st: 409 with the reason', over.status === 409 && /100 items/.test(over.data?.error), `HTTP ${over.status} ${over.data?.error ?? ''}`);

  // ---------- in the browser ----------
  ctx.setSection('Packing in the browser');
  const host = await ctx.newUser('kweb', 'Ashish Bisht');
  const friend = await ctx.newUser('kwebfriend', 'Dhruv Grover');
  const watcher = await ctx.newUser('kwebwatch', 'Rahul Viewer');
  const webTrip = await makeTrip(ctx, host);
  await addMember(ctx, webTrip.id, friend, 'editor');
  await addMember(ctx, webTrip.id, watcher, 'viewer');
  const mine = await ctx.openPage();
  await ctx.login(mine.page, host);
  await mine.page.goto(`${ctx.base}/trips/${webTrip.id}/packing`, { waitUntil: 'networkidle' });
  const emptyShown = await mine.page.getByText('The list is empty.').waitFor({ timeout: 15000 }).then(() => true, () => false);
  record('An empty list says so and offers the add box', emptyShown && (await mine.page.getByLabel('Add an item').count()) === 1);
  await mine.page.getByRole('button', { name: 'Add to the list' }).click();
  const emptyError = await mine.page.locator('[aria-invalid="true"]').count();
  record('Adding nothing: an error under the box', emptyError === 1, `${emptyError} fields marked`);
  for (const item of ['Warm jacket', 'Power bank', 'Rain cover']) {
    await mine.page.getByLabel('Add an item').fill(item);
    await mine.page.getByRole('button', { name: 'Add to the list' }).click();
    // The item's checkbox appears once it is on the list. (Its name is also in the Remove button's
    // screen-reader text, so matching the text alone finds two elements.)
    await mine.page.getByRole('checkbox', { name: new RegExp(`^${item}`) }).waitFor({ timeout: 15000 });
  }
  await mine.page.getByRole('checkbox', { name: /Warm jacket/ }).check();
  const barText = await mine.page.getByText('1 of 3 packed').waitFor({ timeout: 15000 }).then(() => true, () => false);
  record('Ticking "Warm jacket" shows "1 of 3 packed"', barText);

  const theirs = await ctx.openPage();
  await ctx.login(theirs.page, friend);
  await theirs.page.goto(`${ctx.base}/trips/${webTrip.id}/packing`, { waitUntil: 'networkidle' });
  const seesTick = await theirs.page.getByRole('checkbox', { name: /Warm jacket/ }).isChecked().catch(() => false);
  const packedBy = await theirs.page.getByText(/Packed by Ashish Bisht/).count();
  record("A second account sees the first one's tick after loading the page, and who packed it", seesTick && packedBy === 1, `checked ${seesTick}, ${packedBy} "Packed by"`);
  await theirs.page.getByRole('checkbox', { name: /Power bank/ }).check();
  await theirs.page.getByText('2 of 3 packed').waitFor({ timeout: 15000 }).catch(() => {});
  await mine.page.reload({ waitUntil: 'networkidle' });
  const bothTicks = (await mine.page.getByRole('checkbox', { checked: true }).count()) === 2;
  record("...and the first account sees the second's tick after a refresh", bothTicks && (await mine.page.getByText('2 of 3 packed').count()) === 1);
  await theirs.page.getByRole('button', { name: 'Remove Rain cover' }).click();
  await theirs.page.getByText('2 of 2 packed').waitFor({ timeout: 15000 }).catch(() => {});
  record('Removing the last unpacked item: "2 of 2 packed. Everything is packed."', (await theirs.page.getByText(/Everything is packed/).count()) === 1);
  if (ctx.saveLook) await ctx.shot(theirs.page, 'packing');
  record('No script errors for the two editors', mine.consoleErrors.length + theirs.consoleErrors.length === 0, [...mine.consoleErrors, ...theirs.consoleErrors].slice(0, 3).join(' | '));
  await mine.context.close();
  await theirs.context.close();

  const phone = await ctx.openPage(...ctx.PHONE);
  await ctx.login(phone.page, watcher);
  await phone.page.goto(`${ctx.base}/trips/${webTrip.id}/packing`, { waitUntil: 'networkidle' });
  await phone.page.getByRole('list', { name: 'Things to pack' }).waitFor({ timeout: 15000 }).catch(() => {});
  const boxes = await phone.page.getByRole('checkbox').count();
  const enabled = await phone.page.locator('input[type="checkbox"]:not(:disabled)').count();
  const controls = await phone.page.getByRole('button', { name: /^(Remove|Add to the list)/ }).count();
  record('A viewer sees the list and the ticks, but every box is locked and there are no add or remove buttons', boxes === 2 && enabled === 0 && controls === 0 && (await phone.page.getByText('You can view this trip').count()) === 1, `${boxes} boxes, ${enabled} unlocked, ${controls} buttons`);
  const extra = await ctx.overflowOf(phone.page);
  record(`Phone width (${ctx.PHONE[0]}px), the packing list: no sideways scrolling`, extra <= 0, `${extra}px`);
  await phone.context.close();
}

// ====================== Step 7: explore nearby places ======================
async function exploreChecks(ctx) {
  const { call, record, hasError, db } = ctx;
  ctx.setSection('Explore API');
  const places = db.collection('places');
  const KEY = 'cafe|32.26,77.17|5000';

  const owner = await ctx.newUser('xowner', 'Ashish Check');
  const viewer = await ctx.newUser('xviewer', 'Rohan Check');
  const stranger = await ctx.newUser('xstranger', 'Ankit Check');
  const trip = await makeTrip(ctx, owner);
  await addMember(ctx, trip.id, viewer, 'viewer');
  const t = `/trips/${trip.id}`;

  // Forget only this one search, so the first call below must go to Geoapify.
  await places.updateMany({ searchKeys: KEY }, { $pull: { searchKeys: KEY } });
  const first = await call('GET', `${t}/places?category=cafe&radius=5000`, { token: viewer.token });
  const list = first.data?.places || [];
  record('Cafes near Manali appear (asked Geoapify), each with a name, address and distance', first.status === 200 && first.data.source === 'geoapify' && list.length >= 5 && list.every((p) => p.name && typeof p.distance === 'number' && p.distance <= 5000 && p.category === 'cafe'), `HTTP ${first.status} ${first.data?.error ?? `source ${first.data?.source}, ${list.length} places: ${list.slice(0, 3).map((p) => p.name).join(', ')}`}`);
  record('Nearest first, distance in whole metres, location [longitude, latitude]', list.every((p, i) => i === 0 || p.distance >= list[i - 1].distance) && list.every((p) => Number.isInteger(p.distance) && Math.abs(p.location[0] - 77.17) < 0.1 && Math.abs(p.location[1] - 32.26) < 0.1), JSON.stringify(list.slice(0, 2)));
  record('No ratings in the answer', list.every((p) => !('rating' in p) && !('stars' in p)), Object.keys(list[0] || {}).join(','));
  const stored = await places.countDocuments({ searchKeys: KEY });
  const dupes = await places.aggregate([{ $match: { searchKeys: KEY } }, { $group: { _id: '$placeId', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
  record('The places are saved in the places collection, one document per place', stored >= list.length && dupes.length === 0, `${stored} stored for ${list.length} shown, ${dupes.length} duplicates`);

  const second = await call('GET', `${t}/places?category=cafe&radius=5000`, { token: owner.token });
  const sameList = JSON.stringify(second.data?.places?.map((p) => p.placeId)) === JSON.stringify(list.map((p) => p.placeId));
  record('A second search for the same area uses the cache (no Geoapify call), same places', second.data?.source === 'cache' && sameList, `source ${second.data?.source}, same list ${sameList}`);
  const other = await makeTrip(ctx, viewer, { name: 'Manali, second group' });
  const shared = await call('GET', `/trips/${other.id}/places?category=cafe&radius=5000`, { token: viewer.token });
  record("Another group's trip to Manali shares the same cached cafes", shared.data?.source === 'cache', `source ${shared.data?.source}`);

  const hotels = await call('GET', `${t}/places?category=hotel&radius=2000`, { token: owner.token });
  record('Places to stay within 2 km: their own search, every one within 2 km', hotels.status === 200 && hotels.data.places.every((p) => p.category === 'hotel' && p.distance <= 2000), `HTTP ${hotels.status} ${hotels.data?.places?.length} places`);
  const badCat = await call('GET', `${t}/places?category=petrol&radius=5000`, { token: owner.token });
  const badRadius = await call('GET', `${t}/places?category=cafe&radius=3000`, { token: owner.token });
  record('An unknown category or distance: 400', badCat.status === 400 && badRadius.status === 400 && hasError(badCat), `${badCat.status}/${badRadius.status}`);
  const strangerAsk = await call('GET', `${t}/places?category=cafe&radius=5000`, { token: stranger.token });
  record('A stranger asking for the trip\'s places: 403', strangerAsk.status === 403, `HTTP ${strangerAsk.status}`);

  // ---------- in the browser ----------
  ctx.setSection('Explore in the browser');
  const traveller = await ctx.newUser('xweb', 'Ashish Bisht');
  const webTrip = await makeTrip(ctx, traveller);
  const { context, page, consoleErrors } = await ctx.openPage();
  await ctx.login(page, traveller);
  await page.goto(`${ctx.base}/trips/${webTrip.id}/explore`, { waitUntil: 'networkidle' });
  const results = page.getByRole('list', { name: 'Cafes near Manali' });
  const shown = await results.waitFor({ timeout: 20000 }).then(() => results.getByRole('listitem').count(), () => 0);
  const placePins = await page.locator('.ts-pin-place').count();
  record('Explore opens on cafes near Manali, with a numbered ink-capped pin for each', shown >= 5 && placePins === shown, `${shown} cafes, ${placePins} pins`);
  const firstRow = (await results.getByRole('listitem').first().innerText()).replace(/\s+/g, ' ');
  record('Each place says how far it is, in a straight line, and shows no rating', /(m|km) from the centre of Manali, in a straight line/.test(firstRow) && !/★|rating|stars/i.test(firstRow), firstRow.slice(0, 160));

  await page.getByLabel('Add places to').selectOption('2');
  const firstName = (await results.getByRole('listitem').first().getByRole('heading').innerText()).trim();
  await results.getByRole('listitem').first().getByRole('button', { name: /^Add to Day 2/ }).click();
  const addedLine = await results.getByRole('listitem').first().getByText('Added to').waitFor({ timeout: 15000 }).then(() => true, () => false);
  const tripNow = await call('GET', `/trips/${webTrip.id}`, { token: traveller.token });
  const day2 = tripNow.data?.trip?.days?.[1]?.activities || [];
  record(`"Add to Day 2" puts "${firstName}" on Day 2, with its map point`, addedLine && day2.length === 1 && day2[0].title === firstName.slice(0, 80) && Array.isArray(day2[0].place?.location), JSON.stringify(day2.map((a) => a.title)));
  await page.getByRole('link', { name: 'Day 2' }).first().click();
  await page.waitForURL(/\/plan\?day=2$/, { timeout: 10000 }).catch(() => {});
  const onPlan = await page.getByRole('list', { name: 'Stops on Day 2' }).getByText(firstName).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
  const planText = onPlan ? '' : (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  record('...and the day plan shows it on Day 2', onPlan, `${page.url()} ${planText}`);

  await page.goto(`${ctx.base}/trips/${webTrip.id}/explore`, { waitUntil: 'networkidle' });
  await page.getByText('Things to see', { exact: true }).click();
  const sights = await page.getByRole('list', { name: 'Things to see near Manali' }).waitFor({ timeout: 20000 }).then(() => true, () => false);
  record('Switching to "Things to see" searches again', sights);
  if (ctx.saveLook) await ctx.shot(page, 'explore');

  await page.route('**/api/trips/*/places*', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'The nearby places search is not answering right now. Try again in a minute.' }) }));
  await page.getByText('Restaurants', { exact: true }).click();
  const boxError = await page.getByRole('alert').filter({ hasText: 'Nearby places could not be loaded' }).waitFor({ timeout: 15000 }).then(() => true, () => false);
  const rest = (await page.locator('h1').innerText()) === 'Manali Trip' && (await page.locator('.ts-pin-destination').count()) === 1 && (await page.getByRole('navigation', { name: 'Trip sections' }).getByRole('link').count()) >= 5;
  record('The places search failing shows an error only in the results; the map and tabs still work', boxError && rest, `error ${boxError}, rest ${rest}`);
  await page.unroute('**/api/trips/*/places*');
  record('No script errors on Explore', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await context.close();

  const watcher = await ctx.newUser('xwatch', 'Rahul Viewer');
  await addMember(ctx, webTrip.id, watcher, 'viewer');
  const phone = await ctx.openPage(...ctx.PHONE);
  await ctx.login(phone.page, watcher);
  await phone.page.goto(`${ctx.base}/trips/${webTrip.id}/explore`, { waitUntil: 'networkidle' });
  await phone.page.getByRole('list', { name: 'Cafes near Manali' }).waitFor({ timeout: 20000 }).catch(() => {});
  const addButtons = await phone.page.getByRole('button', { name: /^Add to Day/ }).count();
  const onDay = await phone.page.getByText(/^On\s*Day 2$/).count();
  record('A viewer sees the places (and which day one is on) but no "Add to Day" buttons', addButtons === 0 && onDay >= 1, `${addButtons} buttons, ${onDay} "On Day 2"`);
  const extra = await ctx.overflowOf(phone.page);
  record(`Phone width (${ctx.PHONE[0]}px), Explore: no sideways scrolling`, extra <= 0, `${extra}px`);
  await phone.context.close();
}

// ====================== Step 6: expenses, budget, settle up ======================
async function moneyChecks(ctx) {
  const { call, record, hasError, db } = ctx;
  ctx.setSection('Money API');

  const ashish = await ctx.newUser('cashashish', 'Ashish Check');
  const rahul = await ctx.newUser('cashrahul', 'Rahul Check');
  const ankit = await ctx.newUser('cashankit', 'Ankit Check');
  const rohan = await ctx.newUser('cashrohan', 'Rohan Check');
  const viewer = await ctx.newUser('cashviewer', 'Kabir Check');
  const stranger = await ctx.newUser('cashstranger', 'Dhruv Check');
  const trip = await makeTrip(ctx, ashish, { budget: 1_200_000 });
  for (const u of [rahul, ankit, rohan]) await addMember(ctx, trip.id, u, 'editor');
  await addMember(ctx, trip.id, viewer, 'viewer');
  const t = `/trips/${trip.id}`;
  const four = [ashish.uid, rahul.uid, ankit.uid, rohan.uid];
  const name = new Map([ashish, rahul, ankit, rohan, viewer].map((u) => [u.uid, u.name.split(' ')[0]]));
  const said = (transfers) => (transfers || []).map((x) => `${name.get(x.from)} -> ${name.get(x.to)} ${x.amount / 100}`).join(', ');
  const bill = (title, amount, paidBy, split, category = 'stay') => ({ title, amount, category, paidBy, date: dayFromToday(5), split });

  // The brief's example
  const hotel = await call('POST', `${t}/expenses`, { token: ashish.token, body: bill('Hotel, 2 nights', 800000, ashish.uid, { type: 'equal', among: four }) });
  const cabs = await call('POST', `${t}/expenses`, { token: rahul.token, body: bill('Cabs to Solang', 200000, rahul.uid, { type: 'equal', among: four }, 'travel') });
  record('Ashish adds Rs 8,000 hotel and Rahul Rs 2,000 cabs, each split 4 ways: 201', hotel.status === 201 && cabs.status === 201 && hotel.data.expense.splits.every((s) => s.share === 200000), `HTTP ${hotel.status}/${cabs.status} ${hotel.data?.error ?? cabs.data?.error ?? ''}`);
  const s1 = await call('GET', `${t}/settlements`, { token: viewer.token });
  record("Settle up gives the brief's answer: Ankit -> Ashish 2,500, Rohan -> Ashish 2,500, Rahul -> Ashish 500", s1.status === 200 && said(s1.data.transfers) === 'Ankit -> Ashish 2500, Rohan -> Ashish 2500, Rahul -> Ashish 500', said(s1.data?.transfers) || `HTTP ${s1.status}`);
  const bal = Object.fromEntries((s1.data?.people || []).map((p) => [name.get(p.uid), p.balance / 100]));
  record('Balances: Ashish +5,500, Rahul -500, Ankit -2,500, Rohan -2,500, and they add up to zero', bal.Ashish === 5500 && bal.Rahul === -500 && bal.Ankit === -2500 && bal.Rohan === -2500 && Object.values(bal).reduce((a, b) => a + b, 0) === 0, JSON.stringify(bal));

  // Rounding and exact splits
  const third = await call('POST', `${t}/expenses`, { token: ankit.token, body: bill('Dinner at Johnson Cafe', 100000, ankit.uid, { type: 'equal', among: [ankit.uid, rahul.uid, rohan.uid] }, 'food') });
  const shares = third.data?.expense?.splits?.map((s) => s.share);
  record('Rs 1,000 split 3 ways: 333.34 + 333.33 + 333.33, the leftover paisa to the first person', JSON.stringify(shares) === '[33334,33333,33333]', JSON.stringify(shares));
  const exactOk = await call('POST', `${t}/expenses`, { token: rohan.token, body: bill('Paragliding', 450000, rohan.uid, { type: 'exact', shares: [{ uid: rohan.uid, share: 300000 }, { uid: ashish.uid, share: 150000 }] }, 'activities') });
  record('An exact split that adds up: 201', exactOk.status === 201, `HTTP ${exactOk.status} ${exactOk.data?.error ?? ''}`);
  const exactBad = await call('POST', `${t}/expenses`, { token: rohan.token, body: bill('Paragliding', 450000, rohan.uid, { type: 'exact', shares: [{ uid: rohan.uid, share: 300000 }, { uid: ashish.uid, share: 100000 }] }, 'activities') });
  record('Splits that do not add up: 400 "Splits must add up to Rs 4,500"', exactBad.status === 400 && /^Splits must add up to Rs 4,500\./.test(exactBad.data?.error), `HTTP ${exactBad.status} ${exactBad.data?.error}`);

  const badBills = [
    ['an amount of zero', bill('Zero', 0, ashish.uid, { type: 'equal', among: four })],
    ['a fraction of a paisa', bill('Half', 100.5, ashish.uid, { type: 'equal', among: four })],
    ['the amount as text', bill('Text', '8000', ashish.uid, { type: 'equal', among: four })],
    ['a payer who is not in the trip', bill('Stranger paid', 1000, stranger.uid, { type: 'equal', among: four })],
    ['a stranger in the split', bill('Stranger shares', 1000, ashish.uid, { type: 'equal', among: [ashish.uid, stranger.uid] })],
    ['the same person twice', bill('Twice', 1000, ashish.uid, { type: 'equal', among: [ashish.uid, ashish.uid] })],
    ['nobody to share it', bill('Nobody', 1000, ashish.uid, { type: 'equal', among: [] })],
    ['an unknown category', { ...bill('Odd', 1000, ashish.uid, { type: 'equal', among: four }), category: 'settlement' }],
    ['an impossible date', { ...bill('Date', 1000, ashish.uid, { type: 'equal', among: four }), date: '2026-02-30' }],
    ['an extra field (type: settlement)', { ...bill('Sneaky', 1000, ashish.uid, { type: 'equal', among: four }), type: 'settlement' }],
  ];
  for (const [label, body] of badBills) {
    const r = await call('POST', `${t}/expenses`, { token: ashish.token, body });
    record(`A bill with ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }

  // Who may change which bill
  const hotelId = hotel.data?.expense?.id;
  const cabsId = cabs.data?.expense?.id;
  const editOther = await call('PATCH', `${t}/expenses/${hotelId}`, { token: rahul.token, body: bill('Hotel, 3 nights', 900000, ashish.uid, { type: 'equal', among: four }) });
  record("An editor editing someone else's bill: 403", editOther.status === 403 && hasError(editOther), `HTTP ${editOther.status} ${editOther.data?.error ?? ''}`);
  const deleteOther = await call('DELETE', `${t}/expenses/${hotelId}`, { token: rahul.token });
  record("An editor deleting someone else's bill: 403", deleteOther.status === 403, `HTTP ${deleteOther.status}`);
  const editOwn = await call('PATCH', `${t}/expenses/${cabsId}`, { token: rahul.token, body: bill('Cabs to Solang and back', 240000, rahul.uid, { type: 'equal', among: four }, 'travel') });
  record('An editor editing their own bill: 200, shares worked out again', editOwn.status === 200 && editOwn.data.expense.amount === 240000 && editOwn.data.expense.splits.every((s) => s.share === 60000), `HTTP ${editOwn.status} ${editOwn.data?.error ?? ''}`);
  const ownerEdits = await call('PATCH', `${t}/expenses/${cabsId}`, { token: ashish.token, body: bill('Cabs to Solang', 200000, rahul.uid, { type: 'equal', among: four }, 'travel') });
  record("The owner editing anyone's bill: 200", ownerEdits.status === 200, `HTTP ${ownerEdits.status}`);
  const viewerAdd = await call('POST', `${t}/expenses`, { token: viewer.token, body: bill('Viewer bill', 1000, viewer.uid, { type: 'equal', among: [viewer.uid] }) });
  const viewerEdit = await call('PATCH', `${t}/expenses/${hotelId}`, { token: viewer.token, body: bill('Viewer edit', 1000, ashish.uid, { type: 'equal', among: four }) });
  const viewerDelete = await call('DELETE', `${t}/expenses/${hotelId}`, { token: viewer.token });
  const viewerPaid = await call('POST', `${t}/settlements`, { token: viewer.token, body: { from: ankit.uid, to: ashish.uid, amount: 250000 } });
  record('A viewer adding, editing, deleting a bill or marking a payment: 403 each', [viewerAdd, viewerEdit, viewerDelete, viewerPaid].every((r) => r.status === 403), [viewerAdd, viewerEdit, viewerDelete, viewerPaid].map((r) => r.status).join(','));
  const strangerRead = await call('GET', `${t}/expenses`, { token: stranger.token });
  const strangerSettle = await call('GET', `${t}/settlements`, { token: stranger.token });
  record("A stranger reading the bills or settle up: 403", strangerRead.status === 403 && strangerSettle.status === 403, `${strangerRead.status}/${strangerSettle.status}`);
  const otherTrip = await makeTrip(ctx, stranger);
  const crossTrip = await call('DELETE', `/trips/${otherTrip.id}/expenses/${hotelId}`, { token: stranger.token });
  record("Deleting this trip's bill through another trip's address: 404", crossTrip.status === 404, `HTTP ${crossTrip.status}`);

  // Budget: one aggregation by category, settlements left out
  const before = await call('GET', `${t}/budget`, { token: viewer.token });
  const cat = Object.fromEntries((before.data?.byCategory || []).map((r) => [r.category, r.spent / 100]));
  record('Budget by category: stay 8,000, activities 4,500, travel 2,000, food 1,000; spent 15,500 of 12,000', before.status === 200 && cat.stay === 8000 && cat.activities === 4500 && cat.travel === 2000 && cat.food === 1000 && before.data.spent === 1_550_000 && before.data.budget === 1_200_000, JSON.stringify(before.data));

  // Mark as paid
  const settle = (await call('GET', `${t}/settlements`, { token: ashish.token })).data.transfers;
  const tooMuch = await call('POST', `${t}/settlements`, { token: ashish.token, body: { from: settle[0].from, to: settle[0].to, amount: settle[0].amount + 100 } });
  record('Marking more as paid than is owed: 400 with the most that can be marked', tooMuch.status === 400 && /mark at most Rs/.test(tooMuch.data?.error), `HTTP ${tooMuch.status} ${tooMuch.data?.error}`);
  const self = await call('POST', `${t}/settlements`, { token: ashish.token, body: { from: ashish.uid, to: ashish.uid, amount: 100 } });
  record('Paying yourself: 400', self.status === 400, `HTTP ${self.status}`);
  const marks = [];
  for (const x of settle) marks.push((await call('POST', `${t}/settlements`, { token: rahul.token, body: x })).status);
  const after = await call('GET', `${t}/settlements`, { token: ashish.token });
  const stored = await db.collection('expenses').countDocuments({ tripId: new ObjectId(trip.id), type: 'settlement' });
  record('Marking every suggested payment as paid: 201 each, stored as settlements, then nobody owes anything', marks.every((s) => s === 201) && stored === settle.length && after.data.transfers.length === 0 && after.data.people.every((p) => p.balance === 0), `${marks.join(',')}; ${stored} settlements; left: ${said(after.data?.transfers)}`);
  const budgetAfter = await call('GET', `${t}/budget`, { token: ashish.token });
  record('Payments are not spending: the budget total is unchanged', budgetAfter.data?.spent === before.data?.spent && !budgetAfter.data.byCategory.some((r) => r.category === 'settlement'), `${budgetAfter.data?.spent} vs ${before.data?.spent}`);
  const tripRow = (await call('GET', '/trips', { token: ashish.token })).data.trips.find((x) => x.id === trip.id);
  record('My trips shows the same spent total (settlements left out)', tripRow?.spent === 1_550_000, `spent ${tripRow?.spent}`);
  const settlementId = (await call('GET', `${t}/expenses`, { token: ashish.token })).data.expenses.find((e) => e.type === 'settlement')?.id;
  const editSettlement = await call('PATCH', `${t}/expenses/${settlementId}`, { token: ashish.token, body: bill('Change', 1000, ashish.uid, { type: 'equal', among: four }) });
  record('A payment cannot be edited into a bill (400); it can only be deleted', editSettlement.status === 400 && hasError(editSettlement), `HTTP ${editSettlement.status}`);

  // ---------- in the browser ----------
  ctx.setSection('Money in the browser');
  const host = await ctx.newUser('cashweb', 'Ashish Bisht');
  const friend = await ctx.newUser('cashwebfriend', 'Dhruv Grover');
  const webTrip = await makeTrip(ctx, host, { budget: 4_000_000 });
  await addMember(ctx, webTrip.id, friend, 'editor');
  const { context, page, consoleErrors } = await ctx.openPage();
  await ctx.login(page, host);
  await page.goto(`${ctx.base}/trips/${webTrip.id}/money`, { waitUntil: 'networkidle' });
  const emptyLine = await page.getByText('Nothing to settle yet').waitFor({ timeout: 15000 }).then(() => true, () => false);
  record('A trip with no bills says there is nothing to settle and no bills yet', emptyLine && (await page.getByText('No bills yet.').count()) === 1);

  await page.getByRole('button', { name: 'Add a bill' }).click();
  const form = page.getByRole('form', { name: 'Add a bill' });
  await form.getByRole('button', { name: 'Add the bill' }).click();
  const formErrors = await form.locator('[aria-invalid="true"]').count();
  record('Adding an empty bill: errors under "What it was for" and "Amount"', formErrors === 2, `${formErrors} fields marked`);
  await form.getByLabel('What it was for').fill('Hotel, 2 nights');
  await form.getByLabel('Amount (₹)').fill('8000');
  const hint = await form.getByRole('group', { name: 'Shared by' }).innerText();
  record('Equal split shows each share before saving (Rs 4,000 each for 2 people)', (hint.match(/₹4,000/g) || []).length === 2, hint.replace(/\s+/g, ' '));
  await form.getByRole('button', { name: 'Add the bill' }).click();
  const transfer = page.getByRole('list', { name: 'Who pays whom' });
  const owes = await transfer.waitFor({ timeout: 15000 }).then(() => transfer.innerText(), () => '');
  record('After the Rs 8,000 hotel: settle up says Dhruv pays you Rs 4,000', /Dhruv Grover\s*pays\s*you\s*₹4,000/.test(owes), owes.replace(/\s+/g, ' '));

  await page.getByRole('button', { name: 'Add a bill' }).click();
  const form2 = page.getByRole('form', { name: 'Add a bill' });
  await form2.getByLabel('What it was for').fill('Volvo tickets');
  await form2.getByLabel('Amount (₹)').fill('3000');
  await form2.getByLabel('Category').selectOption('travel');
  await form2.getByLabel('Paid by').selectOption(friend.uid);
  await form2.getByText('Exact amounts').click();
  await form2.getByLabel('Ashish Bisht').fill('1000');
  await form2.getByLabel('Dhruv Grover').fill('1500');
  await form2.getByRole('button', { name: 'Add the bill' }).click();
  const splitError = await form2.getByText('Splits must add up to ₹3,000. They add up to ₹2,500.').count();
  record('Exact shares that do not add up: refused under the shares, before sending', splitError === 1, `${splitError} messages`);
  await form2.getByLabel('Dhruv Grover').fill('2000');
  await form2.getByRole('button', { name: 'Add the bill' }).click();
  await page.getByRole('list', { name: 'All bills and payments' }).getByText('Volvo tickets').waitFor({ timeout: 15000 }).catch(() => {});
  const owes2 = (await transfer.innerText().catch(() => '')).replace(/\s+/g, ' ');
  record('With Dhruv paying Rs 3,000 (you 1,000, him 2,000), settle up becomes Rs 3,000', /Dhruv Grover pays you ₹3,000/.test(owes2), owes2);

  const chartBars = await page.locator('.recharts-surface rect[class*="bar"]').count();
  const defaults = await page.locator('.recharts-tooltip-wrapper, .recharts-legend-wrapper, .recharts-cartesian-grid').count();
  const fills = await page.locator('.recharts-surface rect[class*="bar"]').evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
  record('The budget chart: one painted bar per category, in the stone colours, with no Recharts tooltip, legend or grid', chartBars === 2 && defaults === 0 && fills.includes('rgb(243, 193, 14)') && fills.includes('rgb(29, 122, 62)'), `${chartBars} bars, ${defaults} default parts, fills ${fills.join(' / ')}`);
  const meter = await page.getByRole('meter', { name: 'Spent of the budget' }).getAttribute('aria-valuenow');
  record('The budget strip shows Rs 11,000 spent of Rs 40,000', meter === '1100000' && (await page.getByText('₹29,000 left.').count()) >= 1, `meter ${meter}`);
  if (ctx.saveLook) await ctx.shot(page, 'money');

  await page.getByRole('button', { name: /^Mark as paid/ }).click();
  const dialog = page.getByRole('dialog');
  const question = await dialog.getByRole('heading').innerText().catch(() => '');
  await dialog.getByRole('button', { name: 'Yes, mark as paid' }).click();
  const square = await page.getByText('Everyone is square. Nobody owes anybody.').waitFor({ timeout: 15000 }).then(() => true, () => false);
  const paidRow = await page.getByRole('list', { name: 'All bills and payments' }).getByText('Dhruv Grover paid you').count();
  record('"Mark as paid" asks first, then everyone is square and the payment is in the bills', /Dhruv Grover paid you ₹3,000\?/.test(question) && square && paidRow === 1, `"${question}", square ${square}, ${paidRow} rows`);
  const meterAfter = await page.getByRole('meter', { name: 'Spent of the budget' }).getAttribute('aria-valuenow');
  record('...and the budget still shows Rs 11,000 spent (a payment is not spending)', meterAfter === '1100000', `meter ${meterAfter}`);
  record('No script errors on the money screen', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await context.close();

  // The friend (an editor) can change only the bill he added
  await call('POST', `/trips/${webTrip.id}/expenses`, { token: friend.token, body: { title: 'Momos on Mall Road', amount: 36000, category: 'food', paidBy: friend.uid, date: dayFromToday(5), split: { type: 'equal', among: [host.uid, friend.uid] } } });
  const phone = await ctx.openPage(...ctx.PHONE);
  await ctx.login(phone.page, friend);
  await phone.page.goto(`${ctx.base}/trips/${webTrip.id}/money`, { waitUntil: 'networkidle' });
  const ledger = phone.page.getByRole('list', { name: 'All bills and payments' });
  await ledger.waitFor({ timeout: 15000 }).catch(() => {});
  const editHotel = await phone.page.getByRole('button', { name: 'Edit Hotel, 2 nights' }).count();
  const editVolvo = await phone.page.getByRole('button', { name: 'Edit Volvo tickets' }).count();
  const editMomos = await phone.page.getByRole('button', { name: 'Edit Momos on Mall Road' }).count();
  record('An editor sees Edit only on the bill he added (not on bills Ashish added, even one Dhruv paid)', editHotel === 0 && editVolvo === 0 && editMomos === 1, `hotel ${editHotel}, volvo ${editVolvo}, momos ${editMomos}`);
  const extra = await ctx.overflowOf(phone.page);
  record(`Phone width (${ctx.PHONE[0]}px), the money screen: no sideways scrolling`, extra <= 0, `${extra}px`);
  if (ctx.saveLook) await ctx.shot(phone.page, 'money-phone');
  await phone.context.close();
}

// Write routes that exist so far, each with a body that would be valid for an owner.
// Later steps add their own routes to the viewer check in their sections.
// The bodies of the money and checklist routes are deliberately thin or wrong:
// a viewer must get 403 BEFORE the body is looked at (token -> member -> role -> body).
function writeRoutes(tripId, { actId, otherUid, code, itemId }) {
  const t = `/trips/${tripId}`;
  const anyId = '0123456789abcdef01234567';
  return [
    ['POST', `${t}/checklist`, { text: 'Viewer item' }],
    ['PATCH', `${t}/checklist/${itemId}`, { done: true }],
    ['DELETE', `${t}/checklist/${itemId}`],
    ['POST', `${t}/expenses`, {}],
    ['PATCH', `${t}/expenses/${anyId}`, {}],
    ['DELETE', `${t}/expenses/${anyId}`],
    ['POST', `${t}/settlements`, {}],
    ['PATCH', t, { name: 'Renamed' }],
    ['DELETE', t],
    ['POST', `${t}/days/1/activities`, { title: 'Viewer stop' }],
    ['PATCH', `${t}/activities/${actId}`, { title: 'Viewer edit' }],
    ['DELETE', `${t}/activities/${actId}`],
    ['POST', `${t}/invites`, { role: 'editor' }],
    ['GET', `${t}/invites`],
    ['DELETE', `${t}/invites/${code}`],
    ['PATCH', `${t}/members/${otherUid}`, { role: 'viewer' }],
    ['DELETE', `${t}/members/${otherUid}`],
  ];
}

// ====================== Step 5: members and roles ======================
async function membersChecks(ctx) {
  const { call, record, hasError, db } = ctx;
  ctx.setSection('Members API');

  const owner = await ctx.newUser('mowner', 'Ashish Check');
  const dhruv = await ctx.newUser('mdhruv', 'Dhruv Check');
  const rohan = await ctx.newUser('mrohan', 'Rohan Check');
  const stranger = await ctx.newUser('mstranger', 'Ankit Check');
  const trip = await makeTrip(ctx, owner);
  const t = `/trips/${trip.id}`;
  const tripObjectId = new ObjectId(trip.id);

  // Making invites
  const made = await call('POST', `${t}/invites`, { token: owner.token, body: { role: 'editor' } });
  const inv = made.data?.invite;
  const days7 = inv && Math.round((Date.parse(inv.expiresAt) - Date.parse(inv.createdAt)) / 86_400_000);
  record('Owner makes an Editor invite: 201, an 8-character code, valid 7 days', made.status === 201 && /^[A-Z2-9]{8}$/.test(inv?.code) && inv.role === 'editor' && days7 === 7, `HTTP ${made.status} ${JSON.stringify(inv)}`);
  const badRole = await call('POST', `${t}/invites`, { token: owner.token, body: { role: 'owner' } });
  record('An invite for the role "owner": 400', badRole.status === 400 && hasError(badRole), `HTTP ${badRole.status}`);
  const strangerInvite = await call('POST', `${t}/invites`, { token: stranger.token, body: { role: 'editor' } });
  record('A stranger making an invite: 403', strangerInvite.status === 403, `HTTP ${strangerInvite.status}`);

  // Preview (the one public route)
  const preview = await call('GET', `/invites/${inv?.code}`);
  const p = preview.data?.invite;
  record('Invite preview works without logging in: trip name, owner name, role', preview.status === 200 && p?.trip?.name === 'Manali Trip' && p.trip.ownerName === 'Ashish Check' && p.role === 'editor', `HTTP ${preview.status} ${preview.data?.error ?? ''}`);
  record('The preview shows no member names and no money', p && !('members' in p.trip) && !('budget' in p.trip) && typeof p.trip.memberCount === 'number', JSON.stringify(p?.trip));
  const lower = await call('GET', `/invites/${inv?.code.toLowerCase()}`);
  record('A code typed in small letters still works', lower.status === 200, `HTTP ${lower.status}`);
  const garbled = await call('GET', '/invites/not-a-code!');
  record('A badly shaped code: 400', garbled.status === 400 && hasError(garbled), `HTTP ${garbled.status}`);
  const unknown = await call('GET', '/invites/ZZZZ2222');
  record('A code that does not exist: 404', unknown.status === 404 && hasError(unknown), `HTTP ${unknown.status}`);

  // Joining
  const noToken = await call('POST', `/invites/${inv?.code}/join`);
  record('Joining without logging in: 401', noToken.status === 401, `HTTP ${noToken.status}`);
  const joined = await call('POST', `/invites/${inv?.code}/join`, { token: dhruv.token });
  const dhruvTrip = await call('GET', t, { token: dhruv.token });
  record('A second account joins with the code: 201, and is an editor', joined.status === 201 && joined.data.tripId === trip.id && dhruvTrip.data?.trip?.myRole === 'editor', `HTTP ${joined.status} ${joined.data?.error ?? ''}`);
  const twice = await call('POST', `/invites/${inv?.code}/join`, { token: dhruv.token });
  record(`Joining twice: 409 "You're already in this trip."`, twice.status === 409 && twice.data?.error === "You're already in this trip.", `HTTP ${twice.status} ${twice.data?.error}`);
  const ownerJoin = await call('POST', `/invites/${inv?.code}/join`, { token: owner.token });
  record('The owner opening their own invite: already in the trip (409)', ownerJoin.status === 409, `HTTP ${ownerJoin.status}`);
  const [r1, r2] = await Promise.all([1, 2].map(async () => {
    const v = await call('POST', `${t}/invites`, { token: owner.token, body: { role: 'viewer' } });
    return v.data.invite.code;
  }));
  const [ja, jb] = await Promise.all([call('POST', `/invites/${r1}/join`, { token: rohan.token }), call('POST', `/invites/${r2}/join`, { token: rohan.token })]);
  const rohanCount = (await db.collection('trips').findOne({ _id: tripObjectId })).members.filter((m) => m.uid === rohan.uid).length;
  record('Joining with two codes at the same moment adds the person once, as a viewer', rohanCount === 1 && [ja.status, jb.status].sort().join(',') === '201,409', `${rohanCount} entries, HTTP ${ja.status}/${jb.status}`);

  // Expiry checked in code (the TTL clean-up runs only once a minute)
  const old = 'EXP' + String(Date.now()).slice(-5).replace(/[01]/g, '7');
  await db.collection('invites').insertOne({ code: old, tripId: tripObjectId, role: 'viewer', createdBy: owner.uid, createdAt: new Date(Date.now() - 7 * 86_400_000 - 5_000) });
  const expiredPreview = await call('GET', `/invites/${old}`);
  const expiredJoin = await call('POST', `/invites/${old}/join`, { token: stranger.token });
  record('An invite older than 7 days: "This invite has expired, ask the owner for a new one." (410)', expiredPreview.status === 410 && expiredPreview.data?.error === 'This invite has expired, ask the owner for a new one.' && expiredJoin.status === 410, `HTTP ${expiredPreview.status}/${expiredJoin.status} ${expiredPreview.data?.error}`);
  const strangerStill = await call('GET', t, { token: stranger.token });
  record('...and nobody joined with it', strangerStill.status === 403, `HTTP ${strangerStill.status}`);

  const list = await call('GET', `${t}/invites`, { token: owner.token });
  record('The owner sees the working invites, not the expired one', list.status === 200 && list.data.invites.length === 3 && !list.data.invites.some((i) => i.code === old), `${list.data?.invites?.length} invites`);
  const revoked = await call('DELETE', `${t}/invites/${r1}`, { token: owner.token });
  const afterRevoke = await call('GET', `/invites/${r1}`);
  record('The owner stops a link: it no longer opens (404)', revoked.status === 200 && afterRevoke.status === 404, `HTTP ${revoked.status} then ${afterRevoke.status}`);

  // A viewer is refused on every write route
  const stop = await call('POST', `${t}/days/1/activities`, { token: owner.token, body: { title: 'Hadimba Devi Temple' } });
  const packItem = await call('POST', `${t}/checklist`, { token: owner.token, body: { text: 'Warm jacket' } });
  const routes = writeRoutes(trip.id, { actId: stop.data?.activity?.id, otherUid: dhruv.uid, code: r2, itemId: packItem.data?.item?.id });
  const viewerResults = [];
  for (const [method, route, body] of routes) {
    const r = await call(method, route, { token: rohan.token, body });
    viewerResults.push(`${method} ${route.replace(t, '')}: ${r.status}`);
    record(`Viewer ${method} ${route.replace(t, '') || '/trips/:id'}: 403`, r.status === 403 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
  }
  const intact = await call('GET', t, { token: owner.token });
  record('...and the trip is unchanged afterwards', intact.data?.trip?.name === 'Manali Trip' && intact.data.trip.days[0].activities.length === 1 && intact.data.trip.members.length === 3, JSON.stringify(intact.data?.trip?.members?.map((m) => m.role)));
  const editorOwnerOnly = await call('POST', `${t}/invites`, { token: dhruv.token, body: { role: 'viewer' } });
  record('An editor making an invite (owner only): 403', editorOwnerOnly.status === 403, `HTTP ${editorOwnerOnly.status}`);

  // Roles
  const demote = await call('PATCH', `${t}/members/${dhruv.uid}`, { token: owner.token, body: { role: 'viewer' } });
  const demotedAdd = await call('POST', `${t}/days/1/activities`, { token: dhruv.token, body: { title: 'After demotion' } });
  record('Owner makes the editor a viewer; their next stop is refused (403)', demote.status === 200 && demotedAdd.status === 403, `HTTP ${demote.status} then ${demotedAdd.status}`);
  const promote = await call('PATCH', `${t}/members/${dhruv.uid}`, { token: owner.token, body: { role: 'editor' } });
  record('...and back to editor: 200', promote.status === 200 && promote.data.trip.members.find((m) => m.uid === dhruv.uid).role === 'editor', `HTTP ${promote.status}`);
  const ownRole = await call('PATCH', `${t}/members/${owner.uid}`, { token: owner.token, body: { role: 'viewer' } });
  record("Changing the owner's role: 400", ownRole.status === 400 && hasError(ownRole), `HTTP ${ownRole.status}`);
  const ownerLeaves = await call('DELETE', `${t}/members/${owner.uid}`, { token: owner.token });
  record('The owner cannot leave (403, with the reason)', ownerLeaves.status === 403 && /delete the trip/i.test(ownerLeaves.data?.error), `HTTP ${ownerLeaves.status} ${ownerLeaves.data?.error}`);
  const editorRemoves = await call('DELETE', `${t}/members/${rohan.uid}`, { token: dhruv.token });
  record('An editor removing someone else: 403', editorRemoves.status === 403, `HTTP ${editorRemoves.status}`);

  // Someone who owes money cannot be removed or leave
  await db.collection('expenses').insertOne({ tripId: tripObjectId, title: 'Cab to Solang', amount: 300000, category: 'transport', paidBy: owner.uid, date: dayFromToday(5), createdBy: owner.uid, type: 'expense', splits: [{ uid: owner.uid, share: 150000 }, { uid: rohan.uid, share: 150000 }], createdAt: new Date() });
  const blocked = await call('DELETE', `${t}/members/${rohan.uid}`, { token: owner.token });
  record('Removing a member who still owes Rs 1,500: 409 with the amount', blocked.status === 409 && /still owes Rs 1,500/.test(blocked.data?.error), `HTTP ${blocked.status} ${blocked.data?.error}`);
  const blockedLeave = await call('DELETE', `${t}/members/${rohan.uid}`, { token: rohan.token });
  record('...and they cannot leave either until they settle', blockedLeave.status === 409 && /You still owe Rs 1,500/.test(blockedLeave.data?.error), `HTTP ${blockedLeave.status} ${blockedLeave.data?.error}`);
  await db.collection('expenses').insertOne({ tripId: tripObjectId, title: 'Settle up', amount: 150000, category: 'other', paidBy: rohan.uid, date: dayFromToday(5), createdBy: rohan.uid, type: 'settlement', splits: [{ uid: owner.uid, share: 150000 }], createdAt: new Date() });
  const removed = await call('DELETE', `${t}/members/${rohan.uid}`, { token: owner.token });
  const rohanAfter = await call('GET', t, { token: rohan.token });
  record('Once settled, the owner removes them: 200, and they get 403 on the trip', removed.status === 200 && rohanAfter.status === 403, `HTTP ${removed.status} then ${rohanAfter.status}`);
  const left = await call('DELETE', `${t}/members/${dhruv.uid}`, { token: dhruv.token });
  const dhruvAfter = await call('GET', t, { token: dhruv.token });
  record('A member leaves on their own: 200, then 403', left.status === 200 && left.data?.left === true && dhruvAfter.status === 403, `HTTP ${left.status} then ${dhruvAfter.status}`);

  // Rate limits, counted per account
  const guesser = await ctx.limiter(); // a pool account whose rate-limit counters have rested
  const statuses = [];
  for (let i = 0; i < 11; i++) statuses.push((await call('POST', `/invites/ZZZZ${String(2222 + i).replace(/[01]/g, '9')}/join`, { token: guesser.token })).status);
  const limited = await call('POST', '/invites/ZZZZ9999/join', { token: guesser.token });
  record('Join: 10 wrong codes are answered (404), then the account is slowed down (429 with Retry-After)', statuses.slice(0, 10).every((s) => s === 404) && statuses[10] === 429 && limited.status === 429 && Number(limited.headers.get('retry-after')) > 0 && hasError(limited), `${statuses.join(',')} then ${limited.status}, retry-after ${limited.headers.get('retry-after')}`);
  const otherAccount = await call('POST', '/invites/ZZZZ9999/join', { token: stranger.token });
  record('...while another account is not affected (404)', otherAccount.status === 404, `HTTP ${otherAccount.status}`);
  const wxTrip = await makeTrip(ctx, guesser, { start: 3, days: 2 });
  const wx = [];
  for (let i = 0; i < 31; i++) wx.push((await call('GET', `/trips/${wxTrip.id}/weather`, { token: guesser.token })).status);
  record('Weather (an outside service): 30 a minute per account, then 429', wx.slice(0, 30).every((s) => s === 200) && wx[30] === 429, wx.join(','));

  // ---------- in the browser ----------
  ctx.setSection('Members in the browser');
  const host = await ctx.newUser('mhost', 'Ashish Bisht');
  const friend = await ctx.newUser('mfriend', 'Dhruv Grover');
  const webTrip = await makeTrip(ctx, host);
  const ownerPage = await ctx.openPage();
  await ctx.login(ownerPage.page, host);
  await ownerPage.page.goto(`${ctx.base}/trips/${webTrip.id}/members`, { waitUntil: 'networkidle' });
  await ownerPage.page.getByText('No working links').waitFor({ timeout: 15000 }).catch(() => {});
  await ownerPage.page.getByRole('button', { name: 'Make an Editor link' }).click();
  const codeEl = ownerPage.page.getByRole('list', { name: 'Invite links that still work' }).locator('p').first();
  await codeEl.waitFor({ timeout: 15000 });
  const code = (await codeEl.innerText()).replace(/^Code\s*/i, '').trim();
  record('Owner makes an Editor link on the Members tab and sees its code', /^[A-Z2-9]{8}$/.test(code), `"${code}"`);
  if (ctx.saveLook) await ctx.shot(ownerPage.page, 'members-owner');

  // A logged-out visitor opens the link, logs in, comes back, joins
  const visitor = await ctx.openPage();
  await visitor.page.goto(`${ctx.base}/join/${code}`, { waitUntil: 'networkidle' });
  const invitedText = (await visitor.page.locator('main').innerText()).replace(/\s+/g, ' ');
  record('Logged out, the invite page says who invited you, to what, and as what', /Ashish Bisht invited you to/.test(invitedText) && /Manali Trip/.test(invitedText) && /You join as Editor/.test(invitedText), invitedText.slice(0, 160));
  await visitor.page.getByRole('link', { name: 'Log in to join' }).click();
  await visitor.page.getByLabel('Email').fill(friend.email);
  await visitor.page.getByLabel('Password', { exact: true }).fill(friend.password);
  await visitor.page.getByRole('button', { name: 'Log in' }).click();
  const backOnInvite = await visitor.page.waitForURL(`${ctx.base}/join/${code}`, { timeout: 20000 }).then(() => true, () => false);
  record('After logging in, they are back on the same invite page', backOnInvite, visitor.page.url());
  await visitor.page.getByRole('button', { name: /^Join / }).click();
  const inTrip = await visitor.page.waitForURL(`${ctx.base}/trips/${webTrip.id}`, { timeout: 20000 }).then(() => true, () => false);
  const tabs = inTrip ? await visitor.page.getByRole('navigation', { name: 'Trip sections' }).innerText() : '';
  record('Joining opens the trip, without the owner-only Trip settings tab', inTrip && !/Trip settings/.test(tabs), `${visitor.page.url()} tabs: ${tabs.replace(/\s+/g, ' ')}`);
  await visitor.page.goto(`${ctx.base}/join/${code}`, { waitUntil: 'networkidle' });
  await visitor.page.getByRole('button', { name: /^Join / }).click();
  const already = await visitor.page.getByText("You're already in this trip.").waitFor({ timeout: 15000 }).then(() => true, () => false);
  record(`Opening the invite again and joining: "You're already in this trip."`, already);

  await visitor.page.goto(`${ctx.base}/trips/${webTrip.id}/members`, { waitUntil: 'networkidle' });
  const memberControls = await visitor.page.getByRole('button', { name: /^(Make (viewer|editor)|Remove)/ }).count();
  const inviteBoard = await visitor.page.getByRole('heading', { name: 'Invite people' }).count();
  const leaveButton = await visitor.page.getByRole('button', { name: 'Leave the trip' }).count();
  record('An editor sees the group with no invite board and no role or remove buttons, but can leave', memberControls === 0 && inviteBoard === 0 && leaveButton === 1, `${memberControls} controls, ${inviteBoard} invite boards, ${leaveButton} leave`);

  // A fresh expired invite: the first one may already be gone (MongoDB's TTL clean-up runs every minute).
  const old2 = old.slice(0, 7) + (old.endsWith('9') ? '8' : '9');
  await db.collection('invites').insertOne({ code: old2, tripId: new ObjectId(webTrip.id), role: 'viewer', createdBy: host.uid, createdAt: new Date(Date.now() - 7 * 86_400_000 - 5_000) });
  await visitor.page.goto(`${ctx.base}/join/${old2}`, { waitUntil: 'networkidle' });
  const expiredShown = await visitor.page.getByText('This invite has expired, ask the owner for a new one.').waitFor({ timeout: 15000 }).then(() => true, () => false);
  record('An expired invite link shows the expired message', expiredShown);
  if (ctx.saveLook) await ctx.shot(visitor.page, 'invite-expired');

  await visitor.page.goto(`${ctx.base}/trips`, { waitUntil: 'networkidle' });
  await visitor.page.getByLabel('Invite code', { exact: true }).fill('nope');
  await visitor.page.getByRole('button', { name: 'Open the invite' }).click();
  const codeError = await visitor.page.locator('[aria-invalid="true"]').count();
  await visitor.page.getByLabel('Invite code', { exact: true }).fill(code.toLowerCase());
  await visitor.page.getByRole('button', { name: 'Open the invite' }).click();
  const viaCode = await visitor.page.waitForURL(`${ctx.base}/join/${code}`, { timeout: 10000 }).then(() => true, () => false);
  record('Your trips: a wrong code is refused under the field, a real one opens its invite', codeError === 1 && viaCode, `${codeError} errors, ${visitor.page.url()}`);
  record('No script errors for the visitor', visitor.consoleErrors.length === 0, visitor.consoleErrors.slice(0, 3).join(' | '));
  await visitor.context.close();

  await ownerPage.page.reload({ waitUntil: 'networkidle' });
  const row = ownerPage.page.getByRole('list', { name: 'People in this trip' }).getByRole('listitem').filter({ hasText: 'Dhruv Grover' });
  const rowBefore = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
  await ownerPage.page.getByRole('button', { name: 'Make viewer (Dhruv Grover)' }).click();
  await row.getByText('Viewer', { exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
  const rowAfter = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
  record('The owner sees Dhruv as Editor and makes him a viewer', /Editor/.test(rowBefore) && /Viewer/.test(rowAfter), `${rowBefore} -> ${rowAfter}`);
  record('No script errors for the owner', ownerPage.consoleErrors.length === 0, ownerPage.consoleErrors.slice(0, 3).join(' | '));
  await ownerPage.context.close();

  const phone = await ctx.openPage(...ctx.PHONE);
  for (const route of [`/join/${code}`, `/trips/${webTrip.id}/members`]) {
    if (route.includes('members')) await ctx.login(phone.page, host);
    await phone.page.goto(ctx.base + route, { waitUntil: 'networkidle' });
    const extra = await ctx.overflowOf(phone.page);
    record(`Phone width (${ctx.PHONE[0]}px), ${route.replace(webTrip.id, ':id')}: no sideways scrolling`, extra <= 0, `${extra}px`);
  }
  await phone.context.close();
}

// ====================== Step 4: weather ======================
async function weatherChecks(ctx) {
  const { call, record, hasError, db } = ctx;
  ctx.setSection('Weather API');
  const KEY = '32.26,77.17'; // Manali rounded to 2 decimals, "lat,lng"
  const cache = db.collection('weatherCache');

  const owner = await ctx.newUser('wxowner', 'Ashish Check');
  const friend = await ctx.newUser('wxfriend', 'Dhruv Check');
  const stranger = await ctx.newUser('wxstranger', 'Ankit Check');
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
  // A trip that runs past the forecast's last day. Which day that is depends on
  // Open-Meteo (near midnight its 16 days can still start yesterday), so the
  // expected answer is read from the forecast actually stored.
  const lastForecast = (await cache.findOne({ key: KEY }))?.data?.daily?.time?.at(-1);
  const edge = await makeTrip(ctx, owner, { name: 'Manali at the edge', start: 13, days: 6 });
  const edgeW = await call('GET', `/trips/${edge.id}/weather`, { token: owner.token });
  const edgeStatus = edgeW.data?.weather?.days?.map((d) => d.status).join(',');
  const expected = edge.days.map((d) => (d.date <= lastForecast ? 'forecast' : 'later')).join(',');
  record(`A trip running past the forecast's last day (${lastForecast}): forecast up to it, "later" after`, edgeStatus === expected && expected.includes('forecast') && expected.includes('later'), `${edgeStatus} (expected ${expected})`);

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

  const owner = await ctx.newUser('planowner', 'Ashish Check');
  const editor = await ctx.newUser('planeditor', 'Dhruv Check');
  const viewer = await ctx.newUser('planviewer', 'Rohan Check');
  const stranger = await ctx.newUser('planstranger', 'Ankit Check');
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
