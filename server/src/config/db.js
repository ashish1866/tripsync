import { MongoClient } from 'mongodb';
import { getConfig } from './env.js';

// ONE MongoDB client for the whole server process.
// It is opened on first use and then reused by every request. The driver keeps
// a small pool of open connections inside it, so a request does not pay for a
// new connection and login each time.

let client = null;
let connecting = null;

export async function getDb() {
  if (!connecting) {
    client = new MongoClient(getConfig().MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      appName: 'tripsync-api',
    });
    connecting = client.connect().then(() => console.log('MongoDB connected'));
  }
  try {
    await connecting;
  } catch (err) {
    // Do not keep a failed connection: the next request tries again.
    connecting = null;
    throw err;
  }
  return client.db(getConfig().MONGODB_DB);
}

// Closes the shared client (used when the server shuts down, and by scripts).
export async function closeDb() {
  const old = client;
  client = null;
  connecting = null;
  if (old) await old.close();
}
