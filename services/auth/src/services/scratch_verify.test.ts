import { test, expect } from 'vitest';
import { SignJWT, generateKeyPair, exportPKCS8, exportJWK } from 'jose';
import crypto from 'crypto';

// Setup environment for jwt.ts
let privateKeyStr: string;
let kid = 'test-kid';

test('verifyAccessToken cryptographic checks', async () => {
  // Generate real ES256 keypair
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  privateKeyStr = await exportPKCS8(privateKey);
  process.env.AUTH_PRIVATE_KEY = privateKeyStr;
  process.env.AUTH_KID = kid;

  // Initialize keys in jwt.ts
  const { initKeys, verifyAccessToken, getJWKS } = await import('./jwt');
  await initKeys();

  const jwks = getJWKS();
  expect(jwks.keys[0].kid).toBe(kid);
  expect(jwks.keys[0].d).toBeUndefined(); // private material not exposed

  // Helper to generate custom tokens
  const signCustomToken = async (payload: any, key: any, headers = {}) => {
    return new SignJWT(payload).setProtectedHeader({ alg: 'ES256', kid, ...headers }).sign(key);
  };

  const now = Math.floor(Date.now() / 1000);

  // 1. Valid Token
  const validToken = await signCustomToken(
    {
      iss: 'https://auth.ag-ide.local',
      aud: 'ag-ide-platform',
      sub: 'user-123',
      scope: 'verify_email',
      exp: now + 300,
      iat: now,
    },
    privateKey
  );
  const validPayload = await verifyAccessToken(validToken);
  expect(validPayload.sub).toBe('user-123');

  // 2. Wrong Issuer
  const wrongIss = await signCustomToken(
    {
      iss: 'https://wrong-issuer',
      aud: 'ag-ide-platform',
      exp: now + 300,
    },
    privateKey
  );
  await expect(verifyAccessToken(wrongIss)).rejects.toThrow();

  // 3. Wrong Audience
  const wrongAud = await signCustomToken(
    {
      iss: 'https://auth.ag-ide.local',
      aud: 'wrong-aud',
      exp: now + 300,
    },
    privateKey
  );
  await expect(verifyAccessToken(wrongAud)).rejects.toThrow();

  // 4. Expired Token
  const expiredToken = await signCustomToken(
    {
      iss: 'https://auth.ag-ide.local',
      aud: 'ag-ide-platform',
      exp: now - 300, // expired 5 mins ago
    },
    privateKey
  );
  await expect(verifyAccessToken(expiredToken)).rejects.toThrow();

  // 5. Invalid Signature (Forged)
  const { privateKey: fakeKey } = await generateKeyPair('ES256');
  const forgedToken = await signCustomToken(
    {
      iss: 'https://auth.ag-ide.local',
      aud: 'ag-ide-platform',
      exp: now + 300,
    },
    fakeKey
  );
  await expect(verifyAccessToken(forgedToken)).rejects.toThrow();
});
