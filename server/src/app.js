import express from 'express';
import { requireAuth } from './middleware/requireAuth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import healthRoutes from './routes/health.js';
import userRoutes from './routes/users.js';

// Builds the Express app (the TripSync API).
// server.js starts it: on Render in production, on this PC for `npm run dev`.
// The website itself is served by the Cloudflare Worker, which forwards /api/* here.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // API answers are about people's trips and money: no browser or proxy may cache them.
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Public: anyone may call these.
  app.use('/api/health', healthRoutes);

  // Everything below needs a valid Firebase login (guard chain, step 1: token check).
  app.use('/api/users', requireAuth, userRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
