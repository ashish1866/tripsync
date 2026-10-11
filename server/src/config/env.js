import { z } from 'zod';

// All server settings come from environment variables (process.env).
// - On this PC they live in server/.dev.vars (never committed); `npm run dev` loads them.
// - On Render they are typed into the service's Environment page.

const envSchema = z.object({
  MONGODB_URI: z
    .string('MONGODB_URI is not set')
    .startsWith('mongodb', 'MONGODB_URI must start with mongodb+srv:// (copy the whole Atlas link)'),
  MONGODB_DB: z.string().min(1).default('tripsync_dev'),
  FIREBASE_PROJECT_ID: z.string('FIREBASE_PROJECT_ID is not set').min(1, 'FIREBASE_PROJECT_ID is empty'),
  GEOAPIFY_KEY: z.string().default(''),
});

let cached = null;

// Checked once (server.js calls it at startup) and then remembered.
export function getConfig() {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => i.message).join('; ');
    throw new Error(`TripSync API settings are incomplete: ${problems}.`);
  }
  cached = result.data;
  return cached;
}
