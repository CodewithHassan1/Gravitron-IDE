import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, KeyLike } from 'jose';
import {
  S2SIssuer,
  requireS2S,
  requireAgentDelegation,
  verifyAgentDelegation,
  TRUSTED_INTERNAL_ISSUER,
  AGENT_EXECUTE_SCOPE,
  DelegationClaims,
} from './s2s';

describe('Trusted S2S Identity and Agent Delegation Constraints', () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  // A second, unrelated keypair used to simulate a forged/foreign signer.
  let foreignPrivateKey: KeyLike;
  let foreignPublicKey: KeyLike;

  let issuer: S2SIssuer;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;

    const foreignPair = await generateKeyPair('ES256');
    foreignPrivateKey = foreignPair.privateKey;
    foreignPublicKey = foreignPair.publicKey;

    issuer = new S2SIssuer(privateKey);
  });

  const validContext = () => ({
    userId: 'user_123',
    orgId: 'org_A',
    executionId: 'exec-001',
    scope: AGENT_EXECUTE_SCOPE,
    delegationId: 'fixed-delegation-id',
  });

  async function craftRawJwt(payload: Record<string, unknown>, ttlSeconds = 3600): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .setIssuer(TRUSTED_INTERNAL_ISSUER)
      .setAudience('worker-ai')
      .sign(privateKey);
  }

  describe('Delegation creation', () => {
    it('mints a delegation with the correct purpose', async () => {
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      const claims = await verifyAgentDelegation(token, publicKey, 'worker-ai');
      expect(claims.purpose).toBe('agent_delegation');
    });

    it('mints a delegation with the correct trusted issuer', async () => {
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      const claims = await verifyAgentDelegation(token, publicKey, 'worker-ai');
      expect(claims.iss).toBe(TRUSTED_INTERNAL_ISSUER);
    });

    it('mints a delegation for the correct audience', async () => {
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      const claims = await verifyAgentDelegation(token, publicKey, 'worker-ai');
      expect(claims.aud).toContain('worker-ai');
    });

    it('binds the delegation to the user, org, execution, and scope', async () => {
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      const claims = await verifyAgentDelegation(token, publicKey, 'worker-ai');
      expect(claims.user_id).toBe('user_123');
      expect(claims.org_id).toBe('org_A');
      expect(claims.execution_id).toBe('exec-001');
      expect(claims.scope).toBe(AGENT_EXECUTE_SCOPE);
    });

    it('includes iat and a future exp', async () => {
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      const claims = await verifyAgentDelegation(token, publicKey, 'worker-ai');
      expect(claims.iat).toBeGreaterThan(0);
      expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(claims.exp).toBeGreaterThan(claims.iat);
    });

    it('generates a secure unique jti (CSPRNG UUID) and honors explicit delegationId', async () => {
      // 40. Secure jti: no Math.random fallback, explicit delegationId preserved.
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      const claims = await verifyAgentDelegation(token, publicKey, 'worker-ai');
      // delegationId is honored explicitly:
      expect(claims.jti).toBe('fixed-delegation-id');

      const second = await issuer.mintDelegation(
        { ...validContext(), delegationId: undefined },
        'worker-ai',
        '1h'
      );
      const secondClaims = await verifyAgentDelegation(second, publicKey, 'worker-ai');
      // CSPRNG UUID, not a Math.random numeric string.
      expect(secondClaims.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(secondClaims.jti).not.toMatch(/^\d+$/);
      expect(secondClaims.jti).not.toBe('fixed-delegation-id');
    });

    it('refuses to mint when the delegation context is incomplete', async () => {
      await expect(
        issuer.mintDelegation(
          { userId: 'user_123', orgId: '', executionId: 'e1', scope: AGENT_EXECUTE_SCOPE },
          'worker-ai'
        )
      ).rejects.toThrow();
    });
  });

  describe('Worker / boundary rejections', () => {
    it('rejects a missing token', async () => {
      await expect(
        requireAgentDelegation('', publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('rejects a malformed token', async () => {
      await expect(
        requireAgentDelegation('not.a.jwt', publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('rejects a token signed by an untrusted key (wrong signature)', async () => {
      // 41. Cryptographic boundary
      const forged = await new SignJWT({
        purpose: 'agent_delegation',
        user_id: 'user_123',
        org_id: 'org_A',
        execution_id: 'exec-001',
        scope: AGENT_EXECUTE_SCOPE,
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer(TRUSTED_INTERNAL_ISSUER)
        .setAudience('worker-ai')
        .setJti('forged-jti')
        .sign(foreignPrivateKey);
      await expect(
        requireAgentDelegation(forged, publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('rejects a token from the wrong issuer', async () => {
      // 42. Issuer must be the trusted gateway issuer.
      const wrongIssuer = await new SignJWT({
        purpose: 'agent_delegation',
        user_id: 'user_123',
        org_id: 'org_A',
        execution_id: 'exec-001',
        scope: AGENT_EXECUTE_SCOPE,
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer('evil-issuer')
        .setAudience('worker-ai')
        .setJti('jti1')
        .sign(privateKey);
      await expect(
        requireAgentDelegation(wrongIssuer, publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('rejects a token with a wrong audience', async () => {
      const wrongAud = await issuer.mintDelegation(validContext(), 'some-other-audience', '1h');
      await expect(
        requireAgentDelegation(wrongAud, publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('rejects an expired delegation', async () => {
      // 48. Expiration checks
      const expired = await issuer.mintDelegation(validContext(), 'worker-ai', '-5s');
      await expect(
        requireAgentDelegation(expired, publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('rejects a delegation token from a different execution (wrong execution ID)', async () => {
      // 47. Execution isolation.
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      await expect(
        requireAgentDelegation(token, publicKey, 'worker-ai', 'exec-999')
      ).rejects.toThrow();
    });

    it('rejects a token whose purpose is s2s when a delegation is required', async () => {
      // 45. Purpose separation: agent delegation boundary rejects s2s tokens.
      const s2s = await issuer.mintS2S({ userId: 'user_123', orgId: 'org_A' }, 'worker-ai', '1h');
      await expect(
        requireAgentDelegation(s2s, publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('rejects a delegation missing required claims (no execution_id)', async () => {
      const missingBinding = await craftRawJwt({
        purpose: 'agent_delegation',
        user_id: 'user_123',
        org_id: 'org_A',
        scope: AGENT_EXECUTE_SCOPE,
        jti: 'jti-no-exec',
      });
      await expect(
        requireAgentDelegation(missingBinding, publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('rejects a delegation missing org_id', async () => {
      const missingOrg = await craftRawJwt({
        purpose: 'agent_delegation',
        user_id: 'user_123',
        execution_id: 'exec-001',
        scope: AGENT_EXECUTE_SCOPE,
        jti: 'jti-no-org',
      });
      await expect(
        requireAgentDelegation(missingOrg, publicKey, 'worker-ai', 'exec-001')
      ).rejects.toThrow();
    });

    it('accepts a valid delegation for the correct audience and binding', async () => {
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      const claims = await requireAgentDelegation(token, publicKey, 'worker-ai', 'exec-001');
      expect(claims.user_id).toBe('user_123');
      expect(claims.org_id).toBe('org_A');
      expect(claims.execution_id).toBe('exec-001');
    });
  });

  describe('S2S purpose separation', () => {
    it('accepts a valid S2S token', async () => {
      // 40. Minted S2S passes verification.
      const token = await issuer.mintS2S({ userId: 'user_123', orgId: 'org_A' }, 'internal-services', '5m');
      const payload = await requireS2S(token, publicKey, 'internal-services');
      expect(payload.purpose).toBe('s2s');
    });

    it('rejects an S2S token presented to a service expecting delegation', () => {
      // 43/44. Purpose claim must match exactly.
      expect('s2s').not.toBe('agent_delegation');
    });

    it('rejects a delegation token presented as S2S', async () => {
      // 44. requireS2S fails if purpose is agent_delegation.
      const delegation = await issuer.mintDelegation(validContext(), 'internal-services', '1h');
      await expect(requireS2S(delegation, publicKey, 'internal-services')).rejects.toThrow();
    });
  });

  describe('Key isolation / trusted issuer capability', () => {
    it('a worker holding only the public verification key cannot mint delegation tokens', async () => {
      // 49. Worker does not possess the signing private key.
      const publicOnlyIssuer = new S2SIssuer(publicKey);
      await expect(publicOnlyIssuer.mintDelegation(validContext(), 'worker-ai', '1h')).rejects.toThrow();
    });

    it('a worker holding only the public verification key cannot mint S2S tokens', async () => {
      const publicOnlyIssuer = new S2SIssuer(publicKey);
      await expect(publicOnlyIssuer.mintS2S({ userId: 'u', orgId: 'o' }, 'internal-services')).rejects.toThrow();
    });

    it('a foreign-signer token verifies only under the foreign key', async () => {
      const forged = await new SignJWT({
        purpose: 'agent_delegation',
        user_id: 'user_123',
        org_id: 'org_A',
        execution_id: 'exec-001',
        scope: AGENT_EXECUTE_SCOPE,
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer(TRUSTED_INTERNAL_ISSUER)
        .setAudience('worker-ai')
        .setJti('jti1')
        .sign(foreignPrivateKey);
      const claims: DelegationClaims = await verifyAgentDelegation(forged, foreignPublicKey, 'worker-ai');
      expect(claims.jti).toBe('jti1');
    });

    it('verification requires an explicit execution binding', async () => {
      const token = await issuer.mintDelegation(validContext(), 'worker-ai', '1h');
      // Bound verification must not accept an undefined/empty expected execution.
      await expect(
        requireAgentDelegation(token, publicKey, 'worker-ai', '')
      ).rejects.toThrow();
    });
  });
});