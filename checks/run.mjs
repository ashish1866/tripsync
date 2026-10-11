// TripSync browser check: one command, one short pass/fail report.
//
//   npm run check                       (checks http://localhost:5173, needs `npm run dev`)
//   npm run check -- --live             (checks the deployed workers.dev site)
//   npm run check -- --look             (also saves screenshots to judge the design)
//
// Uses the Chrome already installed on this PC (playwright-core, no browser download).
// Screenshots are saved to checks/.artifacts only when a check fails, or with --look.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const LIVE_URL = 'https://tripsync.ashishbisht.workers.dev';
const args = process.argv.slice(2);
const base = args.includes('--live') ? LIVE_URL : 'http://localhost:5173';
const saveLook = args.includes('--look');
const artifacts = path.join(path.dirname(fileURLToPath(import.meta.url)), '.artifacts');
mkdirSync(artifacts, { recursive: true });

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));

async function openPage(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  return { context, page, consoleErrors };
}

async function shot(page, name) {
  const file = path.join(artifacts, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

// Laptop width: the home page and its build check
{
  const { context, page, consoleErrors } = await openPage(1366, 800);
  await page.goto(base + '/', { waitUntil: 'networkidle' });

  const title = await page.title();
  record('Page title is "TripSync"', title === 'TripSync', `got "${title}"`);

  const favicon = await page.getAttribute('link[rel="icon"]', 'href');
  const faviconRes = favicon ? await page.request.get(new URL(favicon, base).href) : null;
  record('Own favicon is served', Boolean(faviconRes?.ok()) && favicon.endsWith('.svg'), favicon || 'no <link rel=icon>');

  // Wait for the API row to settle (passed or failed).
  const apiRow = page.locator('li', { hasText: 'API' });
  await apiRow.locator('text=/answered in|Could not|server/').first().waitFor({ timeout: 30000 }).catch(() => {});
  const apiText = (await apiRow.innerText()).replace(/\s+/g, ' ');
  record('Home page shows the API answered', /Passed: \/api\/health answered/.test(apiText), apiText);

  const dbText = (await page.locator('li', { hasText: 'Database' }).innerText()).replace(/\s+/g, ' ');
  record('Home page shows the Atlas database', /Passed: tripsync_dev on MongoDB Atlas/.test(dbText), dbText);

  // Fonts: the browser must report both families as really loaded and used.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
    const h1 = getComputedStyle(document.querySelector('h1')).fontFamily;
    const body = getComputedStyle(document.body).fontFamily;
    return { loaded: [...new Set(loaded)], h1, body };
  });
  const hasAnek = fonts.loaded.includes('Anek Latin Variable');
  const hasMukta = fonts.loaded.includes('Mukta');
  record('Anek Latin and Mukta are loaded', hasAnek && hasMukta, `loaded: ${fonts.loaded.join(', ') || 'none'}`);
  record('Headings use Anek, body uses Mukta', fonts.h1.startsWith('"Anek Latin Variable"') && fonts.body.startsWith('Mukta'), `h1: ${fonts.h1} | body: ${fonts.body}`);

  // Keyboard: the first Tab must land on something with a visible focus ring.
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    return el && el !== document.body ? { tag: el.tagName, shadow: getComputedStyle(el).boxShadow } : null;
  });
  record('Keyboard focus is visible', Boolean(focus && focus.shadow && focus.shadow !== 'none'), focus ? `${focus.tag}: ${focus.shadow}` : 'nothing focused');

  record('No errors in the browser console', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  if (saveLook) await shot(page, 'home-laptop');
  if (results.some((r) => !r.ok)) await shot(page, 'FAILED-home-laptop');
  await context.close();
}

// Phone width: nothing may stick out sideways
{
  const { context, page } = await openPage(375, 740);
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record('Phone width (375px): no sideways scrolling', overflow <= 0, `${overflow}px too wide`);
  if (saveLook || overflow > 0) await shot(page, overflow > 0 ? 'FAILED-home-phone' : 'home-phone');
  await context.close();
}

// Deep link and unknown address: the app loads and shows its own not-found page
{
  const { context, page } = await openPage(1366, 800);
  const res = await page.goto(base + '/no/such/road', { waitUntil: 'networkidle' });
  const heading = await page.locator('h1').innerText().catch(() => '');
  record('Unknown address shows the TripSync not-found page', res.status() === 200 && /does not go anywhere/.test(heading), `HTTP ${res.status()}, h1 "${heading}"`);
  if (saveLook) await shot(page, 'not-found');
  await context.close();
}

// API contract: unknown API routes answer with JSON { error }
{
  const res = await fetch(base + '/api/no-such-route');
  const body = await res.json().catch(() => null);
  record('Unknown API route gives 404 with { error }', res.status === 404 && typeof body?.error === 'string', `HTTP ${res.status}`);
}

await browser.close();

// Report
const failed = results.filter((r) => !r.ok);
console.log(`\nTripSync browser check: ${base}`);
for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.detail})`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `. Screenshots of failures are in checks/.artifacts` : ''}${saveLook ? '. Look screenshots are in checks/.artifacts' : ''}\n`);
process.exit(failed.length ? 1 : 0);
