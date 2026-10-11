import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './app.js';

// Cloudflare Worker entry.
// Cloudflare turns each incoming request into a Node-style request for this
// Express app. The port is only a routing key inside the Worker, not a real port.
// Requests that are not /api/* never reach this file: Cloudflare serves the
// built React app for them (see "assets" in wrangler.jsonc).
const app = createApp({ dbPerRequest: true });
app.listen(3000);

export default httpServerHandler({ port: 3000 });
