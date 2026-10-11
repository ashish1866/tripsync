import { createApp } from './app.js';
import { getConfig } from './config/env.js';
import { getDb, closeDb } from './config/db.js';

// Starts the TripSync API.
//   On Render:    node src/server.js         (settings come from Render's Environment page)
//   On this PC:   npm run dev                (settings come from server/.dev.vars)

// Stop at once, with a clear message, if a required setting is missing.
try {
  getConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = createApp();
const port = Number(process.env.PORT) || 8787; // Render tells us the port in PORT
const server = app.listen(port, () => {
  console.log(`TripSync API listening on port ${port}`);
});

// Connect at startup so a wrong connection string shows up in the log immediately.
getDb().catch((err) => {
  console.error('MongoDB connection failed:', err.message);
});

// Render sends SIGTERM before it replaces the server during a deploy:
// stop taking new requests, let open ones finish, then close MongoDB.
process.on('SIGTERM', () => {
  console.log('Shutting down');
  server.close(() => {
    closeDb().finally(() => process.exit(0));
  });
});
