import axios from 'axios';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

// One axios instance for the whole app. Every call goes to /api on the same
// address as the website (Vite forwards it to the API during development).
const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
});

// Before every request: attach the logged-in user's Firebase ID token.
// getIdToken() returns the saved token, or quietly fetches a new one when the
// saved one is about to expire (tokens last one hour). So we never store a token ourselves.
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// After a 401 ("not logged in"): force a brand-new token and try once more.
// If the server still says 401, the login really is no longer valid, so log out.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && auth.currentUser && config && !config.retriedWithFreshToken) {
      config.retriedWithFreshToken = true;
      const token = await auth.currentUser.getIdToken(true);
      config.headers.Authorization = `Bearer ${token}`;
      return api(config);
    }
    if (response?.status === 401 && config?.retriedWithFreshToken && auth.currentUser) {
      await signOut(auth);
    }
    throw error;
  },
);

// Turns any failed request into one readable sentence for the screen.
export function errorMessage(err) {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ECONNABORTED') return 'The TripSync server took too long to answer. Check your connection and try again.';
  if (!err?.response) return 'Could not reach the TripSync server. Check your internet connection.';
  return `The TripSync server answered with status ${err.response.status}.`;
}

export default api;
