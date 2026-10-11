import { z } from 'zod';

// All server settings come from environment variables.
// - Locally they live in server/.dev.vars (never committed).
// - On Cloudflare they are Worker secrets/vars, which the runtime copies into process.env.
// - Under plain Node, `node --env-file=.dev.vars` fills process.env the same way.
// So the rest of the code only ever reads process.env, wherever it runs.

const envSchema = z.object({
  MONGODB_URI: z.string().startsWith('mongodb', 'MONGODB_URI must be a MongoDB connection string'),
  MONGODB_DB: z.string().min(1).default('tripsync_dev'),
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  GEOAPIFY_KEY: z.string().default(''),
});

let cached = null;

// Read lazily (on first use, inside a request), because on Workers the
// environment is only guaranteed to be filled in once a request arrives.
export function getConfig() {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Server configuration is incomplete. ${problems}`);
  }
  cached = result.data;
  return cached;
}
