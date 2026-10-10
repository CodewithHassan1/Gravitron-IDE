import { SignJWT, jwtVerify, KeyLike } from 'jose';
import { ConnectError, Code } from '@connectrpc/connect';
import { randomUUID } from 'crypto';

/**
 * The single trusted issuer identity for all internal credentials.
 * Only the Gateway is expected to possess the signing private key
 * that this issuer name binds to.
 */
export const TRUSTED_INTERNAL_ISSUER = 'ag-internal-gateway';

/**
 * Canonical agent-execution scope. Mirrors the `agent:execute` permission
 * defined in packages/auth/src/rbac.ts.
 */
export const AGENT_EXECUTE_SCOPE = 'agent:execute';

/**
 * Required claims for an agent delegation, derived from the verified JWT.
 */
export interface DelegationClaims {
  purpose: 'agent_delegation';
  user_id: string;
  org_id: string;
  execution_id: string;
  scope: string;
  jti: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
}

export interface S2SContext {
  userId: string;
  orgId: string;
}

export interface DelegationContext extends S2SContext {
  executionId: string;
  scope: string;
  delegationId?: string;
}

export interface JWTPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  sub?: string;
  jti?: string;
  [key: string]: any;
}

/**
 * Validates a JWT against an external JWKS or trusted verification key.
 * 
 * @param token The raw JWT token
 * @param key The KeyLike verification key (from JWKS)
 * @param expectedIssuer Expected issuer (e.g. Auth Service)
 * @param expectedAudience Expected audience
 */
export async function verifyExternalToken(
  token: string, 
  key: KeyLike | Uint8Array,
  expectedIssuer: string,
  expectedAudience: string
): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: expectedIssuer,
      audience: expectedAudience,
    });
    return payload as JWTPayload;
  } catch (err: any) {
    throw new ConnectError(`External token verification failed: ${err.message}`, Code.Unauthenticated);
  }
}

/**
 * S2S Issuer Capability.
 *
 * This is the ONLY trusted signing capability. Instantiating it requires
 * possession of the Gateway's private signing key material, so importing
 * `@ag/auth` alone grants no minting capability. No worker, execution
 * service, intelligence worker, or ordinary downstream service may ever
 * hold this capability.
 *
 * Minting is deliberately limited to trusted, typed contexts
 * (`S2SContext` / `DelegationContext`). There is no generic
 * impersonation / mint-any-token API.
 */
export class S2SIssuer {
  constructor(
    private privateKey: KeyLike | Uint8Array,
    private issuerName: string = TRUSTED_INTERNAL_ISSUER
  ) {}

  /**
   * Mints a normal S2S token for trusted internal operations.
   * Accepts a trusted context, not arbitrary identity claims.
   */
  async mintS2S(context: S2SContext, audience: string, expiresIn: string | number = '5m'): Promise<string> {
    return new SignJWT({
      purpose: 's2s',
      user_id: context.userId,
      org_id: context.orgId
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .setIssuer(this.issuerName)
      .setAudience(audience)
      .sign(this.privateKey);
  }

  /**
   * Mints an execution-bound Agent Delegation token.
   * The token is bound to a single execution and expires.
   */
  async mintDelegation(context: DelegationContext, audience: string, expiresIn: string | number = '1h'): Promise<string> {
    if (!context.userId || !context.orgId || !context.executionId || !context.scope) {
      throw new ConnectError('Delegation context is incomplete. All identity and execution bindings are required.', Code.InvalidArgument);
    }
    const jti = context.delegationId || randomUUID();
    return new SignJWT({
      purpose: 'agent_delegation',
      user_id: context.userId,
      org_id: context.orgId,
      execution_id: context.executionId,
      scope: context.scope
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .setIssuer(this.issuerName)
      .setAudience(audience)
      .setJti(jti)
      .sign(this.privateKey);
  }
}

/**
 * Validates an internal credential ensuring it has the 's2s' purpose.
 */
export async function requireS2S(token: string, key: KeyLike | Uint8Array, expectedAudience: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: TRUSTED_INTERNAL_ISSUER,
      audience: expectedAudience
    });

    if (payload.purpose !== 's2s') {
      throw new ConnectError('Invalid credential purpose. Expected s2s.', Code.PermissionDenied);
    }

    return payload as JWTPayload;
  } catch (err: any) {
    if (err instanceof ConnectError) throw err;
    throw new ConnectError(`S2S token verification failed: ${err.message}`, Code.Unauthenticated);
  }
}

/**
 * Validates that a verified token payload contains every required delegation
 * claim and that each is well-formed. Identity is derived exclusively from
 * the verified token; caller-supplied identity headers are never trusted.
 */
export function parseDelegationClaims(payload: JWTPayload): DelegationClaims {
  const purpose = payload.purpose;
  const userId = payload.user_id;
  const orgId = payload.org_id;
  const executionId = payload.execution_id;
  const scope = payload.scope;
  const jti = payload.jti;

  if (purpose !== 'agent_delegation') {
    throw new ConnectError('Invalid credential purpose. Expected agent_delegation.', Code.PermissionDenied);
  }
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new ConnectError('Delegation is missing a valid user_id claim.', Code.PermissionDenied);
  }
  if (typeof orgId !== 'string' || orgId.length === 0) {
    throw new ConnectError('Delegation is missing a valid org_id claim.', Code.PermissionDenied);
  }
  if (typeof executionId !== 'string' || executionId.length === 0) {
    throw new ConnectError('Delegation is missing a valid execution_id claim.', Code.PermissionDenied);
  }
  if (typeof scope !== 'string' || scope.length === 0) {
    throw new ConnectError('Delegation is missing a valid scope claim.', Code.PermissionDenied);
  }
  if (typeof jti !== 'string' || jti.length === 0) {
    throw new ConnectError('Delegation is missing a valid jti claim.', Code.PermissionDenied);
  }
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    throw new ConnectError('Delegation is missing iat/exp claims.', Code.PermissionDenied);
  }
  if (typeof payload.aud === 'undefined' || payload.aud === null || payload.aud === '') {
    throw new ConnectError('Delegation is missing an audience claim.', Code.PermissionDenied);
  }

  return {
    purpose,
    user_id: userId,
    org_id: orgId,
    execution_id: executionId,
    scope,
    jti,
    iss: typeof payload.iss === 'string' ? payload.iss : '',
    aud: payload.aud as string | string[],
    iat: payload.iat,
    exp: payload.exp,
  };
}

/**
 * Verifies an agent delegation token without binding it to a specific
 * execution. Returns the validated claims. Handlers that require a runtime
 * execution binding MUST use `requireAgentDelegation` instead.
 */
export async function verifyAgentDelegation(token: string, key: KeyLike | Uint8Array, expectedAudience: string): Promise<DelegationClaims> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: TRUSTED_INTERNAL_ISSUER,
      audience: expectedAudience,
    });
    return parseDelegationClaims(payload as JWTPayload);
  } catch (err: any) {
    if (err instanceof ConnectError) throw err;
    throw new ConnectError(`Delegation token verification failed: ${err.message}`, Code.Unauthenticated);
  }
}

/**
 * Validates an internal credential ensuring it is an execution-bound
 * 'agent_delegation' token. Cryptographically verifies:
 *   signature, issuer, audience, expiration, purpose, execution_id,
 *   and presence of user_id / org_id / scope / jti.
 *
 * The supplied `expectedExecutionId` must be the trusted execution identity
 * for the request being authorized.
 */
export async function requireAgentDelegation(
  token: string,
  key: KeyLike | Uint8Array,
  expectedAudience: string,
  expectedExecutionId: string
): Promise<DelegationClaims> {
  if (!expectedExecutionId || typeof expectedExecutionId !== 'string') {
    throw new ConnectError('An expectedExecutionId is required to enforce execution binding.', Code.InvalidArgument);
  }
  const claims = await verifyAgentDelegation(token, key, expectedAudience);

  if (claims.execution_id !== expectedExecutionId) {
    throw new ConnectError('Delegation execution binding mismatch.', Code.PermissionDenied);
  }

  return claims;
}
