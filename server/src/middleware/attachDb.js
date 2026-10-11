import { getSharedDb, openRequestDb } from '../config/db.js';

// Gives every API request a `req.getDb()` function.
// Route code always writes `const db = await req.getDb();` and does not need to
// know whether it is running under Node or inside a Cloudflare Worker.
export function attachDb({ perRequest }) {
  return (req, res, next) => {
    if (!perRequest) {
      req.getDb = getSharedDb;
      return next();
    }

    // Worker mode: open at most one connection for this request, on first use,
    // and close it once the response has been sent (or the client went away).
    let opened = null;
    req.getDb = async () => {
      if (!opened) opened = openRequestDb();
      return (await opened).db;
    };

    let closed = false;
    const closeConnection = () => {
      if (closed || !opened) return;
      closed = true;
      opened.then((conn) => conn.close()).catch(() => {});
    };
    res.on('finish', closeConnection);
    res.on('close', closeConnection);
    next();
  };
}
