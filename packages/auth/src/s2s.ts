import { SignJWT, jwtVerify, KeyLike } from 'jose';
import { ConnectError, Code } from '@connectrpc/connect';

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
 * Requires the Gateway's private signing key. Worker CANNOT instantiate this.
 */
export class S2SIssuer {
  constructor(
    private privateKey: KeyLike | Uint8Array,
    private issuerName: string = 'ag-internal-gateway'
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
   */
  async mintDelegation(context: DelegationContext, audience: string, expiresIn: string | number = '1h'): Promise<string> {
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
      .setJti(context.delegationId || (Math.random() * 1000000).toString()) // Simplified fallback
      .sign(this.privateKey);
  }
}

/**
 * Validates an internal credential ensuring it has the 's2s' purpose.
 */
export async function requireS2S(token: string, key: KeyLike | Uint8Array, expectedAudience: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: 'ag-internal-gateway',
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
 * Validates an internal credential ensuring it has the 'agent_delegation' purpose.
 */
export async function requireAgentDelegation(token: string, key: KeyLike | Uint8Array, expectedAudience: string, expectedExecutionId?: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: 'ag-internal-gateway',
      audience: expectedAudience
    });

    if (payload.purpose !== 'agent_delegation') {
      throw new ConnectError('Invalid credential purpose. Expected agent_delegation.', Code.PermissionDenied);
    }
    
    if (expectedExecutionId && payload.execution_id !== expectedExecutionId) {
       throw new ConnectError('Delegation execution binding mismatch.', Code.PermissionDenied);
    }

    return payload as JWTPayload;
  } catch (err: any) {
    if (err instanceof ConnectError) throw err;
    throw new ConnectError(`Delegation token verification failed: ${err.message}`, Code.Unauthenticated);
  }
}
