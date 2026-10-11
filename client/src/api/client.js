import axios from 'axios';

// One axios instance for the whole app. Every call goes to /api on the same
// address as the website (Vite forwards it to the Worker during development).
// Step 1 adds the Firebase token to every request here.
const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
});

// Turns any failed request into one readable sentence for the screen.
export function errorMessage(err) {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ECONNABORTED') return 'The TripSync server took too long to answer. Check your connection and try again.';
  if (!err?.response) return 'Could not reach the TripSync server. Check your internet connection.';
  return `The TripSync server answered with status ${err.response.status}.`;
}

export default api;
