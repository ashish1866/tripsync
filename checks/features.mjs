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

const sections = [tripsChecks, itineraryChecks, weatherChecks, membersChecks];

// Write routes that exist so far, each with a body that would be valid for an owner.
// Later steps add their own routes to the viewer check in their sections.
function writeRoutes(tripId, { actId, otherUid, code }) {
  const t = `/trips/${tripId}`;
  return [
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

  const owner = await ctx.newUser('mowner', 'Ashish Members');
  const dhruv = await ctx.newUser('mdhruv', 'Dhruv Members');
  const rohan = await ctx.newUser('mrohan', 'Rohan Members');
  const stranger = await ctx.newUser('mstranger', 'Ankit Members');
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
  record('Invite preview works without logging in: trip name, owner name, role', preview.status === 200 && p?.trip?.name === 'Manali Trip' && p.trip.ownerName === 'Ashish Members' && p.role === 'editor', `HTTP ${preview.status} ${preview.data?.error ?? ''}`);
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
  const routes = writeRoutes(trip.id, { actId: stop.data?.activity?.id, otherUid: dhruv.uid, code: r2 });
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
  const guesser = await ctx.newUser('mguesser', 'Guess Limit');
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
