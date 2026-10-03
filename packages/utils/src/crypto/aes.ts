import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a plaintext string using AES-256-GCM
 * @param text The plaintext to encrypt
 * @param masterKey A 32-byte hex string or Buffer
 * @returns Base64 encoded string containing IV:AuthTag:EncryptedData
 */
export function encrypt(text: string, masterKey: string | Buffer): string {
  const key = typeof masterKey === 'string' ? Buffer.from(masterKey, 'hex') : masterKey;
  if (key.length !== 32) throw new Error('Master key must be exactly 32 bytes.');

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  return `${iv.toString('base64')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM payload
 * @param payload Base64 encoded string (IV:AuthTag:EncryptedData)
 * @param masterKey A 32-byte hex string or Buffer
 */
export function decrypt(payload: string, masterKey: string | Buffer): string {
  const key = typeof masterKey === 'string' ? Buffer.from(masterKey, 'hex') : masterKey;
  if (key.length !== 32) throw new Error('Master key must be exactly 32 bytes.');

  const [ivB64, authTagB64, encryptedB64] = payload.split(':');
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedB64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
