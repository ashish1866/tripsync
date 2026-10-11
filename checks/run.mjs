// TripSync check: one command, one short pass/fail report.
//
//   npm run check                       (local: http://localhost:5173, needs `npm run dev` running)
//   npm run check -- --live             (the deployed site)
//   npm run check -- --url=http://...   (any other address, e.g. the Worker under `npm run preview:worker`)
//   npm run check -- --look             (also save screenshots to judge the design)
//   npm run check -- --db=tripsync      (the database the API under test uses, if not the one in server/.dev.vars)
//   npm run check -- --delete-pool      (remove the fixed test accounts from Firebase and MongoDB, see below)
//
// What it does:
//   0. Slop guard: banned design values in client/src and client/index.html (see slopGuard.mjs).
//   1. Public pages: title, favicon, fonts really loaded, focus ring, no console errors.
//   2. API guard: every "must fail" request (no token, forged token, edited token, bad body).
//   3. Profile API with a real Firebase account: 404 -> create 201 -> repeat 200, one Mongo document.
//   4. Timing: 10 requests each to three API routes, min / median / max.
//   5. The sign-up / log-in / log-out story in a real browser, plus phone width.
//
// Test accounts (Firebase limits sign-ups, so there is a fixed pool):
//   - The pool: tripsync.check.pool.*@example.com. Each is created ONCE and reused by
//     every run; its email and random password live in the git-ignored
//     checks/.test-accounts.json (written before the account exists). Their MongoDB
//     data is wiped at the start and again at the end of each run, and checked to be gone.
//   - One fresh account per run, for the sign-up story only. It is written to
//     checks/.artifacts/test-accounts.json BEFORE it is created, and at the end it is
//     deleted from Firebase (accounts:delete with its own ID token) and MongoDB, and the
//     deletion is proved by trying to log in again. If a run crashed, the next run
//     deletes the leftover the same way.
//   - To remove the pool for good (Step 10, before shipping): npm run check -- --delete-pool
//
// Uses the Chrome already installed on this PC (playwright-core, no browser download).
// Screenshots go to checks/.artifacts only when a check fails, or with --look.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, SignJWT } from 'jose';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright-core';
import { runSlopGuard, describeHits } from './slopGuard.mjs';
import { runFeatureChecks } from './features.mjs';

const LIVE_URL = 'https://tripsync.ashishbisht.workers.dev';
const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='));
const base = (urlArg ? urlArg.slice('--url='.length) : args.includes('--live') ? LIVE_URL : 'http://localhost:5173').replace(/\/+$/, '');
const saveLook = args.includes('--look');
// The MongoDB database the check inspects directly (profiles, wipes). It MUST be the database the API under test uses:
// by default the one in server/.dev.vars; name another with --db=tripsync (for example when Render's MONGODB_DB is not tripsync_dev).
const dbArg = args.find((a) => a.startsWith('--db='));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'checks', '.artifacts');
mkdirSync(artifacts, { recursive: true });

// Settings from the local, git-ignored files (never printed).
function readEnvFile(file) {
  const out = {};
  for (const line of readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const clientEnv = readEnvFile('client/.env');
const serverEnv = readEnvFile('server/.dev.vars');
const FIREBASE_KEY = clientEnv.VITE_FIREBASE_API_KEY;
const PROJECT_ID = clientEnv.VITE_FIREBASE_PROJECT_ID;

// ---------- report ----------
const results = [];
let section = '';
function record(name, ok, detail = '') {
  results.push({ section, name, ok: Boolean(ok), detail });
}

// ---------- Firebase REST (the same service the website uses) ----------
const identity = (method) => `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${FIREBASE_KEY}`;
async function firebase(method, body) {
  const res = await fetch(identity(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firebase ${method}: ${data?.error?.message}`);
  return data;
}

// ---------- throwaway accounts, tracked in a git-ignored ledger ----------
const LEDGER = path.join(artifacts, 'test-accounts.json');
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : [];
const leftoversAtStart = ledger.length; // accounts an earlier run did not get to delete
const saveLedger = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));

const stamp = Date.now();
function newAccount(tag) {
  const account = { email: `tripsync.check.${stamp}.${tag}@example.com`, password: `Check-${crypto.randomUUID()}`, run: stamp };
  ledger.push(account); // recorded before it exists, so even a crash cannot lose track of it
  saveLedger();
  return account;
}

async function signIn(account) {
  const res = await fetch(identity('signInWithPassword'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }),
  });
  return { ok: res.ok, data: await res.json() };
}

// Deletes one throwaway account from MongoDB and Firebase, then proves it is gone.
// Returns 'deleted', or 'absent' if there was nothing to delete (sign-up never happened).
async function removeAccount(account) {
  const before = await signIn(account);
  if (!before.ok) {
    const code = before.data?.error?.message || 'unknown error';
    // We know the password, so a refused login means there is no such account.
    if (/^(INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND)/.test(code)) return 'absent';
    throw new Error(`could not log in to delete it (${code})`);
  }
  await removeUserData(before.data.localId);
  await firebase('delete', { idToken: before.data.idToken });
  const after = await signIn(account);
  if (after.ok) throw new Error('it still logs in after accounts:delete');
  return 'deleted';
}

// ---------- timing ----------
const timings = [];
async function timeRequests(label, send, times = 10) {
  const ms = [];
  const statuses = [];
  for (let i = 0; i < times; i++) {
    const started = performance.now();
    const r = await send();
    ms.push(Math.round(performance.now() - started));
    statuses.push(r.status);
  }
  const sorted = [...ms].sort((a, b) => a - b);
  timings.push({ label, times, min: sorted[0], median: sorted[Math.floor(times / 2)], max: sorted[times - 1] });
  return statuses;
}

// ---------- API helper ----------
async function call(method, route, { token, body, rawBody, headers = {} } = {}) {
  const res = await fetch(base + '/api' + route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}
const hasError = (r) => typeof r.data?.error === 'string' && r.data.error.length > 0;

const mongo = new MongoClient(serverEnv.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
// The database the check looks at directly. It MUST be the one the API under test uses,
// so at the start of the run the API is asked (GET /api/health says its database) and
// that answer is used. --db=NAME is only a fallback for when the API cannot be asked.
const LOCAL_DB = serverEnv.MONGODB_DB || 'tripsync_dev';
let DB_NAME = dbArg ? dbArg.slice('--db='.length) : LOCAL_DB;
const mongoDb = () => mongo.db(DB_NAME);
const users = () => mongoDb().collection('users');

// Everything a throwaway account left in MongoDB: its profile, the trips it
// owns (with their expenses and invites), and its place in other trips.
async function removeUserData(uid, db = mongoDb()) {
  const owned = await db.collection('trips').find({ owner: uid }, { projection: { _id: 1 } }).toArray();
  const ids = owned.map((t) => t._id);
  if (ids.length) {
    await db.collection('expenses').deleteMany({ tripId: { $in: ids } });
    await db.collection('invites').deleteMany({ tripId: { $in: ids } });
    await db.collection('trips').deleteMany({ _id: { $in: ids } });
  }
  await db.collection('trips').updateMany({ 'members.uid': uid }, { $pull: { members: { uid } } });
  await db.collection('expenses').deleteMany({ createdBy: uid });
  await db.collection('users').deleteMany({ firebaseUid: uid });
}

// ---------- the fixed pool of test accounts ----------
// Signing up real Firebase accounts is rate-limited (TOO_MANY_ATTEMPTS_TRY_LATER),
// so the check does not make a new account for every person in every section.
// It keeps a small fixed pool: each account is created once (first run), its
// email and random password are kept in the git-ignored checks/.test-accounts.json,
// and every later run just logs in to the same accounts. What makes each run
// start clean is MongoDB: all the pool's data (profiles, trips, bills, invites,
// memberships) is wiped at the start and again at the end.
// Only the sign-up story in the browser makes one fresh account per run, and
// deletes it. To remove the pool for good (before shipping): npm run check -- --delete-pool
const POOL_FILE = path.join(root, 'checks', '.test-accounts.json');
const pool = existsSync(POOL_FILE) ? JSON.parse(readFileSync(POOL_FILE, 'utf8')) : {};
const savePool = () => writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));
const POOL_EMAIL = /^tripsync\.check\.pool\./;
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const firebaseCode = (err) => String(err.message).split(': ').pop();

function poolRecord(key) {
  if (!pool[key]) {
    pool[key] = { email: `tripsync.check.pool.${key}@example.com`, password: `Check-${crypto.randomUUID()}` };
    savePool(); // written BEFORE the account exists, so a crash can never lose its password
  }
  return pool[key];
}

const refused = (code) =>
  /TOO_MANY_ATTEMPTS/.test(code)
    ? `Firebase refused with ${code}. This is a blocker: write it under "Blocked" in docs/PROGRESS.md and stop, do not wait in a loop.`
    : `Firebase answered ${code} while opening a test account.`;

// Logs the pool account in (creating it the very first time). { email, password, uid, token }
async function openSession(key) {
  const rec = poolRecord(key);
  let signed = await signIn(rec);
  if (!signed.ok) {
    const code = signed.data?.error?.message || 'unknown error';
    if (!/^(INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND)/.test(code)) throw new Error(refused(code));
    // Not logged in: the account does not exist yet (first run), or the stored password is wrong.
    try {
      signed = { ok: true, data: await firebase('signUp', { email: rec.email, password: rec.password, returnSecureToken: true }) };
    } catch (err) {
      if (/^EMAIL_EXISTS/.test(firebaseCode(err))) {
        throw new Error(`${rec.email} exists in Firebase, but the password in checks/.test-accounts.json is not its password. Delete that account in the Firebase console (Authentication > Users) and run the check again.`);
      }
      throw new Error(refused(firebaseCode(err)));
    }
  }
  return { ...rec, uid: signed.data.localId, token: signed.data.idToken };
}

const sessions = new Map(); // key -> Promise of the logged-in account
function poolSession(key) {
  if (!sessions.has(key)) {
    sessions.set(
      key,
      openSession(key).catch((err) => {
        sessions.delete(key);
        throw err;
      }),
    );
  }
  return sessions.get(key);
}

// A pool account with a TripSync profile: { uid, token, email, password, name }.
// "Ashish Check" is the same account in every section (each section makes its own trips).
async function newUser(_tag, name) {
  const session = await poolSession(slug(name));
  if (!session.profiled) {
    const profile = await call('POST', '/users/me', { token: session.token, body: { name } });
    if (profile.status !== 201 && profile.status !== 200) throw new Error(`profile for ${name}: HTTP ${profile.status} ${profile.data?.error ?? ''}`);
    session.profiled = true;
  }
  return { ...session, name };
}

// An account for the rate-limit test. Its counters live in the API's memory for
// 15 minutes, so each run takes the one that has rested longest.
const LIMITERS = ['Limit Check A', 'Limit Check B', 'Limit Check C', 'Limit Check D'];
async function limiter() {
  const idle = (name) => Date.now() - (pool[slug(name)]?.rateTestAt ?? 0);
  const rested = LIMITERS.find((name) => idle(name) > 16 * 60 * 1000) ?? LIMITERS.reduce((a, b) => (idle(a) >= idle(b) ? a : b));
  const user = await newUser('limiter', rested);
  pool[slug(rested)].rateTestAt = Date.now();
  savePool();
  return user;
}

// Wipes everything the pool left in MongoDB. Finds the accounts by their email in
// the profiles, so it needs no Firebase call. Returns how many profiles it found.
async function wipePool(db = mongoDb()) {
  const rows = await db.collection('users').find({ email: POOL_EMAIL }, { projection: { firebaseUid: 1 } }).toArray();
  for (const row of rows) await removeUserData(row.firebaseUid, db);
  return rows.length;
}

// The database an API says it uses (GET /api/health), or null if it cannot be asked.
async function databaseOf(siteBase) {
  try {
    const res = await fetch(`${siteBase}/api/health`, { signal: AbortSignal.timeout(90_000) });
    const data = await res.json();
    return typeof data?.database === 'string' && data.database ? data.database : null;
  } catch {
    return null;
  }
}

// npm run check -- --delete-pool : removes every pool account from Firebase and MongoDB, proves it, and forgets the file.
// The pool's data is wiped from every database it could be in: this PC's, the live site's, and --db.
async function deletePool() {
  await mongo.connect();
  const names = [...new Set([LOCAL_DB, DB_NAME, await databaseOf(LIVE_URL)].filter(Boolean))];
  let wiped = 0;
  for (const name of names) wiped += await wipePool(mongo.db(name));
  const outcome = [];
  for (const [key, rec] of Object.entries(pool)) {
    try {
      outcome.push(`${key}: ${await removeAccount(rec)}`);
      delete pool[key];
    } catch (err) {
      outcome.push(`${key}: NOT DELETED (${err.message})`);
    }
  }
  savePool();
  let stray = 0;
  for (const name of names) stray += await mongo.db(name).collection('users').countDocuments({ email: /^tripsync\.check\./ });
  console.log(`Pool removal (databases ${names.join(', ')}): ${wiped} profiles wiped; ${outcome.join('; ') || 'no accounts in the pool file'}`);
  console.log(`Accounts still in the pool file: ${Object.keys(pool).length}. Test profiles still in MongoDB: ${stray}.`);
  await mongo.close();
  process.exit(Object.keys(pool).length === 0 && stray === 0 ? 0 : 1);
}
if (args.includes('--delete-pool')) await deletePool();

// Logs a test account in through the real log-in form, then waits for /trips.
async function login(page, account) {
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(`${base}/trips`, { timeout: 25000 });
  await page.waitForLoadState('networkidle');
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));

// Screenshot rule (.kiro/steering/tech.md): viewports at most 1280 x 1600,
// phone checks at 390 px wide, and never a full-page capture.
const LAPTOP = [1280, 800];
const PHONE = [390, 844];

async function openPage(width = LAPTOP[0], height = LAPTOP[1], options = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...options });
  const page = await context.newPage();
  const consoleErrors = [];
  // HTTP errors we cause on purpose (401, 404, wrong password) also log "Failed to load resource";
  // only real script errors count.
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  return { context, page, consoleErrors };
}

async function shot(page, name) {
  // Only what is in the viewport (never fullPage), so a long page cannot make a huge image.
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: false });
}

async function overflowOf(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// ====================== 0. Slop guard (reads the source files, needs no server) ======================
section = 'Slop guard';
try {
  const slop = runSlopGuard();
  record(`Scanned ${slop.fileCount} files in client/src and client/index.html`, slop.fileCount > 0 && slop.unreadable.length === 0, slop.unreadable.map((u) => `${u.file}: ${u.message}`).join('; ') || 'no files found');
  for (const group of slop.groups) record(group.name, group.hits.length === 0, describeHits(group.hits));
  const unlogged = slop.exceptions.filter((e) => !e.logged);
  record(
    `Every slop-ok exception has its reason in DESIGN-DECISIONS.md (${slop.exceptions.length} in use)`,
    unlogged.length === 0,
    unlogged.map((e) => `${e.file}:${e.line} "${e.reason || 'no reason'}"`).join('; '),
  );
} catch (err) {
  record('The slop guard ran', false, err.message);
}

let apiToken = null; // the "api" test account's token, reused for timing

try {
  await mongo.connect();

  // The very first API request of the run. On Render's free plan this is the one
  // that wakes the server if it was asleep, so it is timed on its own.
  {
    const started = performance.now();
    const first = await call('GET', '/health/ping');
    const ms = Math.round(performance.now() - started);
    timings.push({ label: 'First request of the run, GET /api/health/ping', times: 1, min: ms, median: ms, max: ms, status: first.status });
  }

  section = 'Test accounts';
  // Look at the database the API under test really uses (it says so), never a guess.
  {
    const reported = await databaseOf(base);
    const asked = dbArg ? dbArg.slice('--db='.length) : null;
    if (reported) DB_NAME = reported;
    record(
      `The check looks at the database the API uses: ${DB_NAME}`,
      Boolean(reported) && (!asked || asked === reported),
      reported ? `--db=${asked} was given, but the API uses ${reported}` : `the API did not say which database it uses; using ${DB_NAME}`,
    );
  }
  // The fixed test accounts start every run with no data at all.
  {
    const wiped = await wipePool();
    const left = await users().countDocuments({ email: POOL_EMAIL });
    record(`The fixed test accounts start clean: their data wiped (${wiped} profiles found)`, left === 0, `${left} profiles left`);
  }

  // ====================== 1. Public pages ======================
  section = 'Public pages';
  {
    const { context, page, consoleErrors } = await openPage();
    await page.goto(base + '/', { waitUntil: 'networkidle' });

    const title = await page.title();
    record('Page title is "TripSync"', title === 'TripSync', `got "${title}"`);

    const favicon = await page.getAttribute('link[rel="icon"]', 'href');
    const faviconRes = favicon ? await page.request.get(new URL(favicon, base).href) : null;
    record('Own favicon is served', faviconRes?.ok() && favicon.endsWith('.svg'), favicon || 'no <link rel=icon>');

    const h1 = await page.locator('h1').innerText();
    record('Landing page shows its headline', /WhatsApp chat/.test(h1), `h1 "${h1}"`);

    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
      return {
        loaded: [...new Set(loaded)],
        h1: getComputedStyle(document.querySelector('h1')).fontFamily,
        body: getComputedStyle(document.body).fontFamily,
      };
    });
    record('Anek Latin and Mukta are loaded', fonts.loaded.includes('Anek Latin Variable') && fonts.loaded.includes('Mukta'), `loaded: ${fonts.loaded.join(', ') || 'none'}`);
    record('Headings use Anek, body uses Mukta', fonts.h1.startsWith('"Anek Latin Variable"') && fonts.body.startsWith('Mukta'), `h1: ${fonts.h1} | body: ${fonts.body}`);

    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      return el && el !== document.body ? { tag: el.tagName, shadow: getComputedStyle(el).boxShadow } : null;
    });
    record('Keyboard focus is visible', focus && focus.shadow && focus.shadow !== 'none', focus ? `${focus.tag}: ${focus.shadow}` : 'nothing focused');

    record('No script errors on the landing page', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    if (saveLook) await shot(page, 'landing-laptop');

    await page.goto(base + '/status', { waitUntil: 'networkidle' });
    await page.getByText(/answered in \d+ ms/i).nth(1).waitFor({ timeout: 30000 }).catch(() => {});
    const statusText = (await page.locator('ul').innerText()).replace(/\s+/g, ' ');
    record('/status shows the API and the database answering', /Passed: Answered in \d+ ms/.test(statusText) && statusText.includes(`Passed: ${DB_NAME} on MongoDB Atlas`), statusText);

    const res = await page.goto(base + '/no/such/road', { waitUntil: 'networkidle' });
    const nf = await page.locator('h1').innerText().catch(() => '');
    record('Unknown address shows the TripSync not-found page', res.status() === 200 && /does not go anywhere/.test(nf), `HTTP ${res.status()}, h1 "${nf}"`);
    if (saveLook) await shot(page, 'not-found');
    await context.close();
  }

  // ====================== 2. API guard (must fail) ======================
  section = 'API guard';
  {
    const ping = await call('GET', '/health/ping');
    record('GET /health/ping answers without the database', ping.status === 200 && ping.data?.status === 'ok' && !('mongo' in ping.data), `HTTP ${ping.status}`);
    const health = await call('GET', '/health');
    record('GET /health reaches MongoDB', health.status === 200 && health.data?.mongo === 'connected', `HTTP ${health.status}`);
    const noRoute = await call('GET', '/no-such-route');
    record('Unknown API route gives 404 with { error }', noRoute.status === 404 && hasError(noRoute), `HTTP ${noRoute.status}`);
    const cache = health.headers.get('cache-control');
    record('API answers say "Cache-Control: no-store"', cache === 'no-store', `got "${cache}"`);

    const none = await call('GET', '/users/me');
    record('No token: 401', none.status === 401 && hasError(none), `HTTP ${none.status}`);
    const garbage = await call('GET', '/users/me', { token: 'abc.def.ghi' });
    record('Garbage token: 401', garbage.status === 401 && hasError(garbage), `HTTP ${garbage.status}`);
    const wrongScheme = await call('GET', '/users/me', { headers: { Authorization: 'Basic dXNlcjpwYXNz' } });
    record('Wrong auth scheme (Basic): 401', wrongScheme.status === 401, `HTTP ${wrongScheme.status}`);

    // alg "none": an unsigned token claiming to be any user
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const nowS = Math.floor(Date.now() / 1000);
    const claims = { iss: `https://securetoken.google.com/${PROJECT_ID}`, aud: PROJECT_ID, sub: 'forged-user', iat: nowS, exp: nowS + 3600, auth_time: nowS };
    const unsigned = await call('GET', '/users/me', { token: `${enc({ alg: 'none', typ: 'JWT' })}.${enc(claims)}.x` });
    record('Unsigned token (alg "none"): 401', unsigned.status === 401, `HTTP ${unsigned.status}`);

    // Forged: correct project, issuer and a real Google key id, but signed with OUR key
    const jwks = await (await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')).json();
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: jwks.keys[0].kid }).sign(privateKey);
    const forgedRes = await call('GET', '/users/me', { token: forged });
    record('Forged token (right claims, wrong signature): 401', forgedRes.status === 401, `HTTP ${forgedRes.status}`);
  }

  // ====================== 3. Profile API with a real account ======================
  section = 'Profile API';
  {
    // A pool account that was wiped at the start of the run, so it has a Firebase
    // login but no TripSync profile yet (the "first login" case).
    const account = await poolSession('profile-check');
    const token = account.token;
    const uid = account.uid;

    // Edited token: a real token with the user id changed after Google signed it
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    const edited = Buffer.from(JSON.stringify({ ...payload, sub: 'someone-else' })).toString('base64url');
    const editedRes = await call('GET', '/users/me', { token: `${h}.${edited}.${s}` });
    record('Real token edited after signing: 401', editedRes.status === 401, `HTTP ${editedRes.status}`);

    const before = await call('GET', '/users/me', { token });
    record('New Firebase user, no profile yet: GET /users/me gives 404', before.status === 404 && hasError(before), `HTTP ${before.status}`);

    const bad = [
      ['empty body', {}],
      ['empty name', { name: '   ' }],
      ['name over 60 characters', { name: 'x'.repeat(61) }],
      ['name is not text', { name: { $gt: '' } }],
      ['extra field (email)', { name: 'Check', email: 'boss@example.com' }],
    ];
    for (const [label, body] of bad) {
      const r = await call('POST', '/users/me', { token, body });
      record(`POST /users/me with ${label}: 400`, r.status === 400 && hasError(r), `HTTP ${r.status} ${r.data?.error ?? ''}`);
    }
    const notJson = await call('POST', '/users/me', { token, rawBody: '{"name":' });
    record('POST /users/me with broken JSON: 400', notJson.status === 400 && hasError(notJson), `HTTP ${notJson.status}`);
    const arr = await call('POST', '/users/me', { token, body: ['Dhruv'] });
    record('POST /users/me with a list instead of an object: 400', arr.status === 400, `HTTP ${arr.status}`);

    const created = await call('POST', '/users/me', { token, body: { name: '  Dhruv Grover  ' } });
    record('POST /users/me creates the profile: 201', created.status === 201 && created.data?.user?.uid === uid && created.data.user.name === 'Dhruv Grover', `HTTP ${created.status} ${JSON.stringify(created.data?.user ?? created.data)}`);
    record('Email comes from the token, not the request', created.data?.user?.email === account.email, `email ${created.data?.user?.email}`);

    const again = await call('POST', '/users/me', { token, body: { name: 'Someone Else' } });
    record('POST again returns the same profile unchanged: 200', again.status === 200 && again.data?.user?.name === 'Dhruv Grover' && again.data.user.createdAt === created.data?.user?.createdAt, `HTTP ${again.status} name ${again.data?.user?.name}`);

    const after = await call('GET', '/users/me', { token });
    record('GET /users/me now gives the profile: 200', after.status === 200 && after.data?.user?.uid === uid, `HTTP ${after.status}`);
    record('Response hides MongoDB internals (no _id)', after.data?.user && !('_id' in after.data.user), JSON.stringify(after.data?.user));

    const docs = await users().find({ firebaseUid: uid }).toArray();
    record('MongoDB holds exactly one profile for this user', docs.length === 1 && docs[0].email === account.email && docs[0].createdAt instanceof Date, `${docs.length} document(s)`);
    apiToken = token;
  }

  // ====================== 4. Timing ======================
  section = 'Timing';
  {
    const routes = [
      ['GET /api/health/ping (no database)', () => call('GET', '/health/ping')],
      ['GET /api/health (MongoDB ping)', () => call('GET', '/health')],
      ['GET /api/users/me (token check + MongoDB read)', () => call('GET', '/users/me', { token: apiToken })],
    ];
    for (const [label, send] of routes) {
      const statuses = await timeRequests(label, send);
      const allOk = statuses.every((s) => s === 200);
      record(`${label}: 10 of 10 answered 200`, allOk, `statuses ${statuses.join(',')}`);
    }
  }

  // ====================== 5. Sign-up / log-in story in the browser ======================
  section = 'Browser story';
  {
    const account = newAccount('web');
    const name = 'Ashish Bisht';
    const { context, page, consoleErrors } = await openPage();

    await page.goto(base + '/trips', { waitUntil: 'networkidle' });
    record('Logged out, /trips sends you to log in (and remembers /trips)', page.url() === `${base}/login?next=%2Ftrips`, page.url());

    await page.goto(base + '/register', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Create my account' }).click();
    const invalid = await page.locator('[aria-invalid="true"]').count();
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-invalid') === 'true', null, { timeout: 2000 }).catch(() => {});
    const focusedLabel = await page.evaluate(() => document.activeElement?.labels?.[0]?.innerText ?? '');
    record('Empty sign-up form: an error on each of the 3 fields', invalid === 3, `${invalid} fields marked`);
    record('...and focus jumps to the first field with an error', focusedLabel === 'Your name', `focused "${focusedLabel}"`);
    if (saveLook) await shot(page, 'register-errors');

    await page.getByLabel('Your name').fill(name);
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create my account' }).click();
    const pwError = await page.locator('[aria-invalid="true"]').count();
    record('Password under 8 characters is refused before sending', pwError === 1, `${pwError} fields marked`);

    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Create my account' }).click();
    const reachedTrips = await page.waitForURL(`${base}/trips`, { timeout: 25000 }).then(() => true, () => false);
    const headerText = reachedTrips ? await page.locator('header').innerText() : '';
    record('Sign-up lands on /trips with your name in the header', reachedTrips && headerText.includes(name), reachedTrips ? headerText.replace(/\s+/g, ' ') : page.url());

    const doc = await users().findOne({ email: account.email });
    record('Sign-up created the MongoDB profile with the typed name', doc?.name === name && typeof doc.firebaseUid === 'string', doc ? `name "${doc.name}"` : 'no document');

    // The list loads after the login check, so wait for it instead of reading at once.
    const empty = reachedTrips
      ? await page.getByRole('heading', { name: 'No trips yet' }).waitFor({ timeout: 15000 }).then(() => 1, () => 0)
      : 0;
    const mainText = empty ? '' : (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    record('/trips shows the designed empty state', empty === 1, `no "No trips yet" heading; page says: ${mainText}`);
    if (saveLook) await shot(page, 'trips-laptop');

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('header').getByText(name).waitFor({ timeout: 15000 }).catch(() => {});
    record('Refresh keeps you logged in', page.url() === `${base}/trips` && (await page.locator('header').getByText(name).count()) === 1, page.url());

    await page.goto(base + '/login?next=//evil.example', { waitUntil: 'networkidle' });
    await page.waitForURL(`${base}/trips`, { timeout: 10000 }).catch(() => {});
    record('Login link pointing to another site stays inside TripSync', page.url() === `${base}/trips`, page.url());

    await page.getByRole('button', { name: 'Log out' }).click();
    const loggedOut = await page.waitForURL(`${base}/`, { timeout: 10000 }).then(() => true, () => false);
    await page.goto(base + '/trips', { waitUntil: 'networkidle' });
    record('Log out works, and /trips is closed again', loggedOut && page.url().startsWith(`${base}/login`), page.url());

    // Now on /login?next=%2Ftrips
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    const formError = await page.getByRole('alert').innerText({ timeout: 15000 }).catch(() => '');
    record('Wrong password: a clear message on the form', /email or password is wrong/.test(formError), `"${formError}"`);
    if (saveLook) await shot(page, 'login-wrong-password');

    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    const back = await page.waitForURL(`${base}/trips`, { timeout: 20000 }).then(() => true, () => false);
    record('Log in returns you to the page you wanted (/trips)', back, page.url());

    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForURL(`${base}/`, { timeout: 10000 }).catch(() => {});
    await page.goto(base + '/register', { waitUntil: 'networkidle' });
    await page.getByLabel('Your name').fill('Second Copy');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Create my account' }).click();
    const dup = await page.locator('[aria-invalid="true"]').first().waitFor({ timeout: 15000 }).then(
      () => page.locator('p', { hasText: 'already exists' }).count(),
      () => 0,
    );
    record('Signing up twice with one email: "already exists" on the email field', dup === 1, `${dup} message(s)`);

    record('No script errors during the whole story', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    if (results.some((r) => r.section === section && !r.ok)) await shot(page, 'FAILED-browser-story');

    // Phone width, logged in and out
    await context.close();
    const phone = await openPage(...PHONE);
    for (const route of ['/', '/login', '/register', '/status', '/no/such/road']) {
      await phone.page.goto(base + route, { waitUntil: 'networkidle' });
      const extra = await overflowOf(phone.page);
      record(`Phone width (${PHONE[0]}px), ${route}: no sideways scrolling`, extra <= 0, `${extra}px too wide`);
      if (extra > 0) await shot(phone.page, `FAILED-phone${route.replace(/\//g, '_')}`);
      if (saveLook && route === '/') await shot(phone.page, 'landing-phone');
    }
    await phone.page.goto(base + '/login', { waitUntil: 'networkidle' });
    await phone.page.getByLabel('Email').fill(account.email);
    await phone.page.getByLabel('Password', { exact: true }).fill(account.password);
    await phone.page.getByRole('button', { name: 'Log in' }).click();
    await phone.page.waitForURL(`${base}/trips`, { timeout: 20000 }).catch(() => {});
    const extra = await overflowOf(phone.page);
    record(`Phone width (${PHONE[0]}px), /trips logged in: no sideways scrolling`, phone.page.url() === `${base}/trips` && extra <= 0, `${phone.page.url()} ${extra}px`);
    if (saveLook) await shot(phone.page, 'trips-phone');
    await phone.context.close();
  }

  // ====================== 6. Features (Steps 2 onward, see features.mjs) ======================
  await runFeatureChecks({
    base,
    call,
    record,
    setSection: (name) => {
      section = name;
    },
    newUser,
    limiter,
    login,
    db: mongoDb(),
    openPage,
    PHONE,
    shot,
    saveLook,
    overflowOf,
    hasError,
  });
} catch (err) {
  record('The check itself ran to the end', false, err.stack?.split('\n').slice(0, 2).join(' ') ?? String(err));
} finally {
  section = 'Clean-up';
  // 1. The fixed pool keeps its Firebase logins but not one byte of data.
  try {
    const poolUids = [];
    for (const opened of sessions.values()) poolUids.push(...(await opened.then((s) => [s.uid], () => [])));
    await wipePool();
    for (const uid of poolUids) await removeUserData(uid);
    const trips = mongoDb().collection('trips');
    const left = {
      profiles: await users().countDocuments({ email: POOL_EMAIL }),
      ownedTrips: await trips.countDocuments({ owner: { $in: poolUids } }),
      memberships: await trips.countDocuments({ 'members.uid': { $in: poolUids } }),
      bills: await mongoDb().collection('expenses').countDocuments({ createdBy: { $in: poolUids } }),
    };
    record(`The fixed test accounts (${poolUids.length}) are wiped after the run: no profiles, trips, memberships or bills left`, Object.values(left).every((n) => n === 0), JSON.stringify(left));
  } catch (err) {
    record('The fixed test accounts were wiped after the run', false, err.message);
  }

  // 2. The one fresh account this run made (the sign-up story): deleted from Firebase and MongoDB, and proved gone.
  const thisRun = ledger.filter((a) => a.run === stamp).length;
  const outcome = { deleted: 0, absent: 0 };
  for (const account of [...ledger]) {
    try {
      outcome[await removeAccount(account)]++;
      ledger.splice(ledger.indexOf(account), 1);
    } catch (err) {
      record(`Delete test account ${account.email}`, false, err.message);
    }
  }
  saveLedger();
  if (leftoversAtStart) {
    record(`Accounts left by earlier runs: ${leftoversAtStart}, now cleaned up`, !ledger.some((a) => a.run !== stamp), `${ledger.length} still tracked`);
  }
  record(
    `This run's ${thisRun} test accounts deleted from Firebase and MongoDB, each proved gone`,
    ledger.length === 0,
    `deleted ${outcome.deleted}, never created ${outcome.absent}, still tracked ${ledger.length}`,
  );
  const strayProfiles = await users().countDocuments({ email: /^tripsync\.check\./ }).catch(() => -1);
  record('No test profiles left in MongoDB', strayProfiles === 0, `${strayProfiles} left`);
  await browser.close();
  await mongo.close();
}

// ---------- print the report ----------
const failed = results.filter((r) => !r.ok);
console.log(`\nTripSync check: ${base} (database ${DB_NAME})`);
let last = '';
for (const r of results) {
  if (r.section !== last) {
    console.log(`\n  ${r.section}`);
    last = r.section;
  }
  console.log(`    ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.detail})`}`);
}
if (timings.length) {
  console.log('\n  Time per request (measured from this PC, including the network)');
  for (const t of timings) {
    const numbers = t.times === 1 ? `${t.min} ms` : `min ${t.min} ms, median ${t.median} ms, max ${t.max} ms`;
    console.log(`    ${t.label}: ${numbers}${t.status && t.status !== 200 ? ` (HTTP ${t.status})` : ''}`);
  }
}
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? '. Screenshots of failures are in checks/.artifacts' : ''}${saveLook ? '. Look screenshots are in checks/.artifacts' : ''}\n`);
process.exit(failed.length ? 1 : 0);
