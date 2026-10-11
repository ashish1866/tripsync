import express from 'express';
import { attachDb } from './middleware/attachDb.js';
import { notFound, errorHandler } from './middleware/errors.js';
import healthRoutes from './routes/health.js';

// Builds the Express app. The same app runs in two places:
//   - worker.js  -> inside a Cloudflare Worker (production)
//   - server.js  -> under plain Node (fallback host such as Render)
// The only difference is how MongoDB connections are handled (see config/db.js).
export function createApp({ dbPerRequest }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', attachDb({ perRequest: dbPerRequest }));

  // No database: shows the cost of Express alone (used for the CPU-time check).
  app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/health', healthRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
