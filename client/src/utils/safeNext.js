// After logging in we send people back where they were going (?next=/join/abc).
// Only paths inside TripSync are allowed, so a crafted link like
// /login?next=https://evil.example cannot bounce someone to another site.
export function safeNext(value, fallback = '/trips') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

// The login URL that brings the visitor back to `path` afterwards.
export function loginUrlFor(path) {
  return path && path !== '/' ? `/login?next=${encodeURIComponent(path)}` : '/login';
}
