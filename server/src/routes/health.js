import { Router } from 'express';
import { getConfig } from '../config/env.js';

const router = Router();

// GET /api/health
// Proves the whole chain works: Express is running and MongoDB Atlas answers.
// It reads one document from the users collection (null if there are no users yet).
router.get('/', async (req, res) => {
  const started = Date.now();
  const db = await req.getDb();
  const oneUser = await db.collection('users').findOne({}, { projection: { _id: 1, createdAt: 1 } });
  const userCount = await db.collection('users').estimatedDocumentCount();

  res.json({
    status: 'ok',
    database: getConfig().MONGODB_DB,
    mongo: 'connected',
    usersInDatabase: userCount,
    readOneUser: oneUser ? 'found' : 'none yet',
    dbMs: Date.now() - started,
  });
});

export default router;
