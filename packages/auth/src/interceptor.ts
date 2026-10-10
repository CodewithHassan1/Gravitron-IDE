import { Interceptor, ConnectError, Code } from '@connectrpc/connect';
import { requireS2S, verifyAgentDelegation, JWTPayload } from './s2s';
import { KeyLike } from 'jose';

/**
 * Options for the internal credential interceptor.
 */
export interface AuthInterceptorOptions {
  verificationKey: KeyLike | Uint8Array;
  audience: string;
  // If true, validates purpose='agent_delegation'. If false, validates purpose='s2s'.
  requireDelegation?: boolean;
}

/**
 * A ConnectRPC interceptor that validates the incoming Authorization header
 * ensuring it is a valid Gateway-issued internal credential (S2S or Agent Delegation).
 */
export const createAuthInterceptor = (options: AuthInterceptorOptions): Interceptor => (next) => async (req) => {
  const authHeader = req.header.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ConnectError('Missing or invalid Authorization header', Code.Unauthenticated);
  }

  const token = authHeader.substring(7);
  let payload: JWTPayload;

  if (options.requireDelegation) {
    // Structure-level validation. The service implementation MUST enforce
    // execution binding against the requested resource using the returned
    // execution_id (bind via requireAgentDelegation).
    payload = await verifyAgentDelegation(token, options.verificationKey, options.audience);
  } else {
    payload = await requireS2S(token, options.verificationKey, options.audience);
  }

  // Inject trusted context into headers for the handler to read
  req.header.set('x-trusted-user-id', payload.user_id as string);
  if (payload.org_id) {
    req.header.set('x-trusted-org-id', payload.org_id as string);
  }
  if (payload.execution_id) {
    req.header.set('x-trusted-execution-id', payload.execution_id as string);
  }
  if (payload.scope) {
    req.header.set('x-trusted-scope', payload.scope as string);
  }

  return await next(req);
};
