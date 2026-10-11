import { Router } from 'express';
import { getConfig } from '../config/env.js';
import { getDb } from '../config/db.js';

const router = Router();

// GET /api/health/ping
// Does NOT touch the database. Answers instantly as long as the server process
// is up. This is what the keep-awake ping calls, so it stays cheap.
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

// GET /api/health
// Proves the whole chain works: Express is running AND MongoDB Atlas answers.
// It sends MongoDB a "ping" command, which reads no user data, so this public
// route never reveals anything about who uses TripSync.
router.get('/', async (req, res) => {
  const started = Date.now();
  const db = await getDb();
  await db.command({ ping: 1 });

  res.json({
    status: 'ok',
    database: getConfig().MONGODB_DB,
    mongo: 'connected',
    dbMs: Date.now() - started,
  });
});

export default router;
