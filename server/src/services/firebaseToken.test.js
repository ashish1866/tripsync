import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyFirebaseToken } from './firebaseToken.js';

// These tests play the part of Google: they make their own signing key, sign
// test tokens with it, and check that verifyFirebaseToken accepts only the
// right ones. The real code uses Google's public keys instead.

const projectId = 'tripsync-test';
const now = () => Math.floor(Date.now() / 1000);
let googleKey; // stands in for Google's key
let strangerKey; // someone else's key

beforeAll(async () => {
  googleKey = await generateKeyPair('RS256');
  strangerKey = await generateKeyPair('RS256');
});

function makeToken({ key = googleKey.privateKey, alg = 'RS256', claims = {}, issuer, audience } = {}) {
  const base = {
    sub: 'user-123',
    email: 'dhruv@example.com',
    auth_time: now() - 60,
    ...claims,
  };
  const jwt = new SignJWT(base)
    .setProtectedHeader({ alg, kid: 'test-key' })
    .setIssuer(issuer ?? `https://securetoken.google.com/${projectId}`)
    .setAudience(audience ?? projectId)
    .setIssuedAt(claims.iat ?? now() - 60)
    .setExpirationTime(claims.exp ?? now() + 3600);
  return jwt.sign(key);
}

const verify = (token) => verifyFirebaseToken(token, { projectId, keySet: googleKey.publicKey });

async function expect401(promise, messagePart = 'could not be verified') {
  await expect(promise).rejects.toMatchObject({ status: 401 });
  await expect(promise).rejects.toThrow(messagePart);
}

describe('verifyFirebaseToken', () => {
  it('accepts a genuine token and returns the user', async () => {
    const user = await verify(await makeToken());
    expect(user).toEqual({ uid: 'user-123', email: 'dhruv@example.com', name: null });
  });

  it('refuses a token signed by a different key (forged)', async () => {
    await expect401(verify(await makeToken({ key: strangerKey.privateKey })));
  });

  it('refuses a token made for another Firebase project (audience)', async () => {
    await expect401(verify(await makeToken({ audience: 'someone-elses-project' })));
  });

  it('refuses a token from the wrong issuer', async () => {
    await expect401(verify(await makeToken({ issuer: 'https://evil.example' })));
  });

  it('refuses an expired token with an "expired" message', async () => {
    const token = await makeToken({ claims: { iat: now() - 7200, exp: now() - 3600 } });
    await expect401(verify(token), 'expired');
  });

  it('refuses a token whose payload was edited after signing', async () => {
    const [header, , signature] = (await makeToken()).split('.');
    const edited = Buffer.from(JSON.stringify({ sub: 'someone-else', aud: projectId })).toString('base64url');
    await expect401(verify(`${header}.${edited}.${signature}`));
  });

  it('refuses a token signed with a shared secret (HS256) instead of RS256', async () => {
    const secret = new TextEncoder().encode('a-secret-that-is-at-least-32-bytes-long!');
    await expect401(verify(await makeToken({ key: secret, alg: 'HS256' })));
  });

  it('refuses a token with no user id', async () => {
    await expect401(verify(await makeToken({ claims: { sub: '' } })));
  });

  it('refuses a token that claims to have been issued in the future', async () => {
    const token = await makeToken({ claims: { auth_time: now() + 3600 } });
    await expect401(verify(token));
  });

  it('refuses text that is not a token at all', async () => {
    await expect401(verify('not.a.token'));
  });
});
