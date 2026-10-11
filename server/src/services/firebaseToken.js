import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from '../utils/httpError.js';

// THE TOKEN CHECK
// When someone logs in, Firebase gives their browser an "ID token": a signed
// note saying "this is user X, valid for one hour". The browser sends it with
// every API call. Here we prove the note is genuine, without asking Firebase:
//   1. It was signed by Google (checked against Google's public keys).
//   2. It was made for OUR Firebase project (issuer and audience).
//   3. It has not expired and was not issued in the future.
//   4. It names a user (the "sub" claim is the Firebase user id).
// Rules from https://firebase.google.com/docs/auth/admin/verify-id-tokens

const GOOGLE_KEYS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// Google's public keys. jose downloads them on first use, keeps them in memory,
// and downloads again if a token mentions a key it has not seen (Google rotates keys).
let googleKeys = null;
function googleKeySet() {
  googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_KEYS_URL));
  return googleKeys;
}

// jose error codes that mean "this token is not acceptable" (answer 401).
// Any other error (for example Google's key server unreachable) is our problem, not the user's.
const BAD_TOKEN_CODES = new Set([
  'ERR_JWT_INVALID',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
]);

const CLOCK_SKEW_SECONDS = 60; // allow our server clock to be a little behind Google's

export async function verifyFirebaseToken(token, { projectId, keySet = googleKeySet() }) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
    }));
  } catch (err) {
    if (err?.code === 'ERR_JWT_EXPIRED') {
      throw new HttpError(401, 'Your login has expired. Please log in again.');
    }
    if (BAD_TOKEN_CODES.has(err?.code)) {
      throw new HttpError(401, 'Your login could not be verified. Please log in again.');
    }
    throw err;
  }

  // Checks jose does not do for us.
  const now = Math.floor(Date.now() / 1000);
  const validUser = typeof payload.sub === 'string' && payload.sub.length > 0 && payload.sub.length <= 128;
  const issuedInPast = payload.iat <= now + CLOCK_SKEW_SECONDS && payload.auth_time <= now + CLOCK_SKEW_SECONDS;
  if (!validUser || !issuedInPast) {
    throw new HttpError(401, 'Your login could not be verified. Please log in again.');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}
