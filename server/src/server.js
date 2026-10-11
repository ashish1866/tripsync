import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { getSharedDb } from './config/db.js';

// Plain Node entry (the fallback if the API ever has to move off Cloudflare).
// Run with: npm run dev:node   (reads server/.dev.vars)
const app = createApp({ dbPerRequest: false });

// Serve the built React app too, so site and API stay on one address.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`TripSync API listening on http://localhost:${port}`);
});

// Connect at startup so a bad connection string shows up immediately.
getSharedDb().catch((err) => {
  console.error('MongoDB connection failed:', err.message);
});
