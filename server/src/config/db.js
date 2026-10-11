import { MongoClient } from 'mongodb';
import { getConfig } from './env.js';

// How the server talks to MongoDB Atlas, in two modes:
//
// 1. Plain Node (server.js): one MongoClient for the whole process, opened once
//    and reused by every request. This is the normal Node pattern.
//
// 2. Cloudflare Worker (worker.js): a network socket belongs to the request that
//    opened it, so a client cannot be shared between requests. Each request opens
//    its own small client (pool size 1) and closes it when the response is sent.
//    This is opened lazily: a request that fails the token check never touches the DB.

let sharedClient = null;
let sharedClientPromise = null;

function newClient(options = {}) {
  const { MONGODB_URI } = getConfig();
  return new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    appName: 'tripsync',
    ...options,
  });
}

// Mode 1: the shared client used under plain Node.
export async function getSharedDb() {
  if (!sharedClientPromise) {
    sharedClient = newClient();
    sharedClientPromise = sharedClient.connect().then(() => {
      console.log('MongoDB connected');
    });
  }
  try {
    await sharedClientPromise;
  } catch (err) {
    // Let the next request try again instead of caching a failed connection.
    sharedClientPromise = null;
    throw err;
  }
  return sharedClient.db(getConfig().MONGODB_DB);
}

// Mode 2: a short-lived client for one Worker request.
let loggedWorkerConnect = false;
export async function openRequestDb() {
  const client = newClient({ maxPoolSize: 1, minPoolSize: 0 });
  await client.connect();
  if (!loggedWorkerConnect) {
    // Logged once per Worker instance, so the dev terminal shows the link works.
    console.log('MongoDB connected');
    loggedWorkerConnect = true;
  }
  return {
    db: client.db(getConfig().MONGODB_DB),
    close: () => client.close(),
  };
}

// Used by scripts (index setup) that run once and exit.
export async function withDb(work) {
  const client = newClient();
  await client.connect();
  console.log('MongoDB connected');
  try {
    return await work(client.db(getConfig().MONGODB_DB));
  } finally {
    await client.close();
  }
}
