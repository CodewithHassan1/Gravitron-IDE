/**
 * Minimal stand-in for the auth service's JWKS endpoint.
 *
 * The real `@ag/auth-service` cannot boot in this environment (its committed
 * `dist` requires `@ag/database/src/outbox`, and `nodemailer` is not installed).
 * This serves the SAME public key material as `services/auth/.env`
 * (AUTH_PRIVATE_KEY + AUTH_KID) so the Gateway can perform genuine remote-JWKS
 * signature verification of the external access token. It does NOT touch the
 * M8.3 delegation chain, which uses independent real ES256 key material.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:http';
import { importPKCS8, exportJWK } from 'jose';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(ROOT, 'services/auth/.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\n/g, '\n');
  env[m[1]] = v;
}

const priv = await importPKCS8(env.AUTH_PRIVATE_KEY, 'ES256', { extractable: true });
const jwk = await exportJWK(priv);
delete jwk.d;
jwk.alg = 'ES256';
jwk.use = 'sig';
jwk.kid = env.AUTH_KID || 'test-key-v1';
jwk.key_ops = ['verify'];

const jwks = JSON.stringify({ keys: [jwk] });

createServer((req, res) => {
  if (req.url === '/.well-known/jwks.json' || req.url === '/api/v1/auth/.well-known/jwks.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(jwks);
    return;
  }
  if (req.url === '/health' || req.url === '/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok"}');
    return;
  }
  res.writeHead(404); res.end();
}).listen(3001, '0.0.0.0', () => console.log('JWKS stand-in listening on 3001'));
