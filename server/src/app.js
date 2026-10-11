import express from 'express';
import { attachDb } from './middleware/attachDb.js';
import { requireAuth } from './middleware/requireAuth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import healthRoutes from './routes/health.js';
import userRoutes from './routes/users.js';

// Builds the Express app.
//   - server.js runs it under plain Node with ONE shared MongoDB client
//     (local development now, Render in production from Step 1.5).
//   - worker.js is the Step 0 Cloudflare entry; Step 1.5 turns it into a small
//     proxy that forwards /api/* to Render.
export function createApp({ dbPerRequest }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', attachDb({ perRequest: dbPerRequest }));

  // Public: anyone may call these.
  app.use('/api/health', healthRoutes);

  // Everything below needs a valid Firebase login (guard chain, step 1: token check).
  app.use('/api/users', requireAuth, userRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
