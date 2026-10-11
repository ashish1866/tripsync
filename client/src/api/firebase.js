import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase handles sign-up, log-in and passwords. TripSync never sees or stores a password.
// These values are public by design (they only say WHICH Firebase project to use),
// so they live in client/.env as VITE_ variables and end up in the browser.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length) {
  console.error(`Firebase settings missing in client/.env: ${missing.join(', ')}`);
}

const app = initializeApp(config);

// The Firebase SDK keeps the login in the browser (IndexedDB), so a refresh
// or reopening the tab keeps you logged in.
export const auth = getAuth(app);
