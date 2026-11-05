import { SignJWT, importPKCS8, exportJWK, KeyLike } from 'jose';
import crypto from 'crypto';
import { JWTPayload } from '@ag/validation/src/auth';

let currentPrivateKey: KeyLike | Uint8Array;
let currentPublicKeyJwk: any;
let currentKid = 'key-v1'; // Ideally from config
let initialized = false;

/**
 * Initializes the JWT service with persistent keys from environment.
 * Expects AUTH_PRIVATE_KEY to be set in environment.
 */
export async function initKeys() {
  const privateKeyStr = process.env.AUTH_PRIVATE_KEY;
  if (!privateKeyStr) {
    throw new Error(
      'AUTH_PRIVATE_KEY is missing from environment. Ephemeral keys are strictly prohibited in production.'
    );
  }

  if (process.env.AUTH_KID) {
    currentKid = process.env.AUTH_KID;
  }

  // Assuming PKCS8 PEM format for the private key
  currentPrivateKey = await importPKCS8(privateKeyStr, 'ES256');
  const jwk = await exportJWK(currentPrivateKey as KeyLike);
  currentPublicKeyJwk = { ...jwk, kid: currentKid, alg: 'ES256', use: 'sig' };

  // Never expose private material
  delete currentPublicKeyJwk.d;

  initialized = true;
}

export function getJWKS() {
  if (!initialized) throw new Error('Keys not initialized');
  return {
    keys: [currentPublicKeyJwk],
  };
}

export async function issueAccessToken(payload: JWTPayload): Promise<string> {
  if (!initialized) throw new Error('Keys not initialized');

  const jwt = await new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'ES256', kid: currentKid })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .setIssuer(payload.iss)
    .setAudience(payload.aud)
    .sign(currentPrivateKey);

  return jwt;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('base64url');
}

export function generateJTI(): string {
  return crypto.randomUUID();
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  if (!initialized) throw new Error('Keys not initialized');
  const { jwtVerify, importJWK } = await import('jose');
  const publicKey = await importJWK(currentPublicKeyJwk);
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: process.env.AUTH_ISSUER || 'https://auth.ag-ide.local',
    audience: process.env.AUTH_AUDIENCE || 'ag-ide-platform',
  });
  return payload as JWTPayload;
}
