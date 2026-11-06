import { importSPKI } from 'jose';
import { requireAgentDelegation } from '@ag/auth';

/**
 * Metadata-only context that binds an agent session to an authorized
 * execution. It deliberately carries NO raw delegation token: sessions must
 * never hold bearer credentials. Identity and execution identity are derived
 * exclusively from the cryptographically verified delegation token and never
 * from caller-supplied inputs.
 */
export interface DelegationContext {
  readonly executionId: string;
  readonly userId: string;
  readonly orgId: string;
  readonly scope: string;
  readonly jti: string;
}

/**
 * Cryptographically verifies an agent delegation token against the public
 * verification key (SPKI PEM), enforces the worker-ai audience and the
 * execution binding, and returns only metadata for session context.
 *
 * This is the entry point consumed by trusted execution hosts (e.g. the
 * Electron main process) before an in-process runtime is allowed to start.
 * The caller is responsible for never persisting or forwarding the raw token.
 */
export async function verifyDelegationWithPublicKey(
  token: string,
  publicKeyPem: string,
  expectedExecutionId: string
): Promise<DelegationContext> {
  const publicKey = await importSPKI(publicKeyPem, 'ES256');
  const claims = await requireAgentDelegation(token, publicKey, 'worker-ai', expectedExecutionId);

  return {
    executionId: claims.execution_id,
    userId: claims.user_id,
    orgId: claims.org_id,
    scope: claims.scope,
    jti: claims.jti,
  };
}

export function isDelegationContext(value: unknown): value is DelegationContext {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.executionId === 'string' &&
    v.executionId.length > 0 &&
    typeof v.userId === 'string' &&
    v.userId.length > 0 &&
    typeof v.orgId === 'string' &&
    v.orgId.length > 0 &&
    typeof v.scope === 'string' &&
    v.scope.length > 0 &&
    typeof v.jti === 'string' &&
    v.jti.length > 0
  );
}
