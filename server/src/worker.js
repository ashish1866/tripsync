// Cloudflare Worker: the one public address of TripSync.
//
// - Every address except /api/* is the built React app. Cloudflare serves those
//   files directly (see "assets" in wrangler.jsonc), so this code does not run for them.
// - /api/* is passed on unchanged to the API server on Render. Its address is
//   the API_ORIGIN setting in wrangler.jsonc, not written into this file.
// - Every 10 minutes a Cron Trigger pings the API, so Render's free plan does not
//   put it to sleep (it sleeps after 15 quiet minutes).
//
// There is no database code here. Because the browser only ever talks to this
// one address, the website needs no CORS setup.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      // Only reached if the assets settings change; serve the website as usual.
      return env.ASSETS.fetch(request);
    }
    return forwardToApi(request, url, env);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(keepApiAwake(env));
  },
};

// The Render address from wrangler.jsonc, without a trailing slash.
function apiOrigin(env) {
  const origin = env.API_ORIGIN;
  if (typeof origin !== 'string' || !/^https?:\/\/[^/]+/.test(origin)) {
    throw new Error('API_ORIGIN is missing or not a URL. Set it under "vars" in server/wrangler.jsonc.');
  }
  return origin.replace(/\/+$/, '');
}

async function forwardToApi(request, url, env) {
  let target;
  try {
    target = apiOrigin(env) + url.pathname + url.search;
  } catch (err) {
    console.error(err.message);
    return Response.json({ error: 'The TripSync API address is not set up yet.' }, { status: 500 });
  }

  // Same method, headers (including the Firebase token) and body.
  // The Host header must name Render, not workers.dev, so it is dropped and fetch sets it.
  const headers = new Headers(request.headers);
  headers.delete('host');
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
    });
    if (res.status < 500) return res;
    // An error the API chose to send, for example 503 "The weather service could not answer".
    // Measured on the live site (2026-10-12): an API answer of 502 reached the browser as
    // Cloudflare's own HTML "Bad gateway" page, so the API now answers 503 for a failing outside
    // service. The answer is rebuilt as a fresh response so its JSON body and status are kept as they are.
    const kept = new Headers(res.headers);
    kept.delete('content-encoding');
    kept.delete('content-length');
    return new Response(await res.arrayBuffer(), { status: res.status, statusText: res.statusText, headers: kept });
  } catch (err) {
    console.error(`Could not reach the API at ${target}: ${err.message}`);
    return Response.json(
      { error: 'The TripSync API is not answering right now. If it was asleep, try again in a minute.' },
      { status: 502 },
    );
  }
}

// Called by the Cron Trigger. The result is written to Workers Logs.
async function keepApiAwake(env) {
  const started = Date.now();
  try {
    const res = await fetch(`${apiOrigin(env)}/api/health/ping`, { signal: AbortSignal.timeout(90_000) });
    await res.text();
    console.log(`Keep-awake ping: HTTP ${res.status} in ${Date.now() - started} ms`);
  } catch (err) {
    console.error(`Keep-awake ping failed after ${Date.now() - started} ms: ${err.message}`);
  }
}
