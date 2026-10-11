// Firebase reports problems as codes like "auth/email-already-in-use".
// This turns each code into a sentence a person can act on, and says which
// form field it belongs to ("form" means it is shown above the button).
const MESSAGES = {
  'auth/email-already-in-use': ['email', 'An account with this email already exists. Log in instead.'],
  'auth/invalid-email': ['email', 'This email address is not valid.'],
  'auth/weak-password': ['password', 'Choose a longer password: at least 8 characters.'],
  'auth/invalid-credential': ['form', 'The email or password is wrong.'],
  'auth/wrong-password': ['form', 'The email or password is wrong.'],
  'auth/user-not-found': ['form', 'The email or password is wrong.'],
  'auth/user-disabled': ['form', 'This account has been switched off.'],
  'auth/too-many-requests': ['form', 'Too many attempts from this device. Wait a few minutes, then try again.'],
  'auth/network-request-failed': ['form', 'Could not reach the login service. Check your internet connection.'],
  'auth/operation-not-allowed': [
    'form',
    'Email sign-in is switched off for this Firebase project. In Firebase, open Authentication, then Sign-in method, and enable Email/Password.',
  ],
  'auth/unauthorized-domain': [
    'form',
    `Logins are not allowed from ${window.location.host} yet. Add it under Firebase, Authentication, Settings, Authorized domains.`,
  ],
};

export function describeAuthError(err) {
  const known = MESSAGES[err?.code];
  if (known) return { field: known[0], message: known[1] };
  return { field: 'form', message: `Firebase did not accept this (${err?.code || 'no code'}). Try again in a minute.` };
}
