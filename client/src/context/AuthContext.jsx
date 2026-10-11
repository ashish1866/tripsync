import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../api/firebase';
import api, { errorMessage } from '../api/client';

// Who is logged in, shared with every page.
//
// status:
//   'checking'  - Firebase is restoring a saved login, or we are loading the profile
//   'signedOut' - nobody is logged in
//   'signedIn'  - logged in, and `profile` holds the TripSync profile from MongoDB
//   'error'     - logged in with Firebase, but the TripSync server could not be reached
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'checking', profile: null, error: null });
  // The name typed on the sign-up form, kept until the profile has been created.
  const pendingName = useRef(null);

  // Get the TripSync profile for a Firebase user, creating it on first login.
  const loadProfile = useCallback(async (firebaseUser) => {
    try {
      const { data } = await api.get('/users/me');
      return data.user;
    } catch (err) {
      if (err.response?.status !== 404) throw err;
      // 404: logged in, but no TripSync profile yet. Create it.
      const name = pendingName.current || firebaseUser.displayName || firebaseUser.email.split('@')[0];
      const { data } = await api.post('/users/me', { name: name.slice(0, 60) });
      return data.user;
    }
  }, []);

  const syncWith = useCallback(
    async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ status: 'signedOut', profile: null, error: null });
        return;
      }
      setState({ status: 'checking', profile: null, error: null });
      try {
        const profile = await loadProfile(firebaseUser);
        if (auth.currentUser?.uid !== firebaseUser.uid) return; // logged out meanwhile
        pendingName.current = null;
        setState({ status: 'signedIn', profile, error: null });
      } catch (err) {
        if (auth.currentUser?.uid !== firebaseUser.uid) return;
        setState({ status: 'error', profile: null, error: errorMessage(err) });
      }
    },
    [loadProfile],
  );

  // Firebase calls this on page load (restored login or none), on log-in and on log-out.
  useEffect(() => onAuthStateChanged(auth, syncWith), [syncWith]);

  const register = useCallback(async ({ name, email, password }) => {
    pendingName.current = name;
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      // Also save the name on the Firebase account (used if the profile is ever re-created).
      updateProfile(user, { displayName: name }).catch(() => {});
    } catch (err) {
      pendingName.current = null;
      throw err;
    }
  }, []);

  const login = useCallback(({ email, password }) => signInWithEmailAndPassword(auth, email, password), []);
  const logout = useCallback(() => signOut(auth), []);
  const retry = useCallback(() => syncWith(auth.currentUser), [syncWith]);

  const value = useMemo(() => ({ ...state, register, login, logout, retry }), [state, register, login, logout, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
