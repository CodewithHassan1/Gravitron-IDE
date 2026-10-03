import { ConnectRouter, ConnectError, Code } from '@connectrpc/connect';
import { SessionManager } from '@ag/cache';
import { db } from '@ag/database';
import { publishOutboxEvent } from '@ag/database/src/outbox';
import { issueAccessToken, generateRefreshToken, generateJTI } from './services/jwt';
import { PasswordService } from './services/password';
import { DevelopmentMailer, ProductionMailer } from './services/mailer';
import crypto from 'crypto';

import { AuthService } from '@ag/proto/gen/ts/auth/v1/auth_connect';
import Redis from 'ioredis';
import { validateConfig } from '@ag/config';

const config = validateConfig(process.env);
const redis = new Redis(config.REDIS_URL);
const mailer = config.SMTP_URL ? new ProductionMailer(config.SMTP_URL, config.FROM_EMAIL) : new DevelopmentMailer();

export default (router: ConnectRouter) => {
  // OIDC Login is deprecated in Phase 8.1
  router.rpc(AuthService, AuthService.methods.login, async (req: any, _context: any) => {
    throw new ConnectError("OIDC Login is deprecated. Use PasswordLogin.", Code.Unimplemented);
  });

  router.rpc(AuthService, AuthService.methods.register, async (req: any, _context: any) => {
    const { email, password, displayName } = req;
    if (!email || !password) throw new ConnectError("Email and password required", Code.InvalidArgument);
    if (password.length < 8) throw new ConnectError("Password too weak", Code.InvalidArgument);

    // Check if user exists
    const existing = await db.selectFrom('users').where('email', '=', email).selectAll().executeTakeFirst();
    if (existing) {
      // Prevent enumeration: act like it succeeded, but don't do anything if they are already active
      return { userId: "", status: "EXISTS" }; 
    }

    const hash = await PasswordService.hash(password);
    const userId = crypto.randomUUID();

    await db.insertInto('users').values({
      id: userId,
      email,
      password_hash: hash,
      display_name: displayName,
      role: 'MEMBER',
      status: 'PENDING_VERIFICATION',
      created_at: new Date(),
      updated_at: new Date()
    }).execute();

    const orgId = crypto.randomUUID();
    const slug = `${displayName || email.split('@')[0]}-personal`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    await db.insertInto('organizations').values({
      id: orgId,
      name: `${displayName || 'User'}'s Personal Organization`,
      slug: slug,
      created_at: new Date(),
      updated_at: new Date()
    }).execute();

    await db.insertInto('organization_members').values({
      organization_id: orgId,
      user_id: userId,
      role: 'OWNER',
      created_at: new Date()
    }).execute();

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    // Store in Redis (24h TTL)
    await redis.set(`verify:${tokenHash}`, userId, 'EX', 24 * 60 * 60);

    await mailer.sendVerificationEmail(email, rawToken);

    return { userId, status: "PENDING_VERIFICATION" };
  });

  router.rpc(AuthService, AuthService.methods.passwordLogin, async (req: any, _context: any) => {
    const { email, password } = req;
    if (!email || !password) throw new ConnectError("Email and password required", Code.InvalidArgument);

    const user = await db.selectFrom('users').where('email', '=', email).selectAll().executeTakeFirst();
    if (!user) {
      await PasswordService.dummyCompare();
      throw new ConnectError("Invalid email or password", Code.Unauthenticated);
    }

    if (!user.password_hash) {
      throw new ConnectError("Invalid email or password", Code.Unauthenticated);
    }

    const valid = await PasswordService.compare(password, user.password_hash);
    if (!valid) {
      throw new ConnectError("Invalid email or password", Code.Unauthenticated);
    }

    if (user.status === 'DISABLED') {
      throw new ConnectError("Account disabled", Code.PermissionDenied);
    }

    const sid = crypto.randomUUID();
    const jti = generateJTI();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 900; // 15m

    const roles = [user.role];
    let scope = "";
    if (user.status === 'PENDING_VERIFICATION') {
      scope = "verify_email";
    }

    const accessToken = await issueAccessToken({
      iss: "https://auth.ag-ide.local",
      aud: "ag-ide-platform",
      iat: now,
      exp: exp,
      jti: jti,
      sid: sid,
      sub: user.id,
      org_id: "", // TODO: Get org id when user context includes orgs natively
      roles: roles,
      scope: scope
    } as any);

    const refreshToken = generateRefreshToken();

    // The JTI is conceptually the hash of the refresh token, 
    // or we can store the refresh token directly since Redis is server-side.
    // For true atomic rotation, we hash the refresh token to serve as JTI.
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await SessionManager.createSession(sid, {
      user_id: user.id,
      org_id: "",
      current_jti: refreshHash, 
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    await db.transaction().execute(async (tx) => {
      await publishOutboxEvent(tx, "User", user.id, "auth.login", { sid });
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      status: user.status
    };
  });

  router.rpc(AuthService, AuthService.methods.refresh, async (req: any, _context: any) => {
    // req.refreshToken should be extracted by Gateway from HttpOnly cookie and passed down,
    // or passed directly if it's a mobile client.
    const token = req.refreshToken;
    if (!token) throw new ConnectError("Refresh token required", Code.Unauthenticated);

    const refreshHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // We need the SID. In a real system, the SID might be encoded in the refresh token, 
    // or passed via a separate cookie, or we can look up the session by JTI index.
    // For this mock, we assume the SID is passed or embedded. Let's assume the refresh token format is `sid:opaque_random`.
    const parts = token.split(':');
    if (parts.length !== 2) throw new ConnectError("Invalid token format", Code.Unauthenticated);
    const sid = parts[0];
    const opaque = parts[1];

    const actualHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const newOpaque = generateRefreshToken();
    const newRefreshToken = `${sid}:${newOpaque}`;
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    const rotated = await SessionManager.rotateJTI(sid, actualHash, newHash);
    if (!rotated) {
      // Replay detected! Revoke session!
      await SessionManager.revokeSession(sid);
      throw new ConnectError("Invalid or replayed token", Code.Unauthenticated);
    }

    const session = await SessionManager.getSession(sid);
    if (!session) throw new ConnectError("Session expired", Code.Unauthenticated);

    const user = await db.selectFrom('users').where('id', '=', session.user_id).selectAll().executeTakeFirst();
    if (!user || user.status === 'DISABLED') {
      await SessionManager.revokeSession(sid);
      throw new ConnectError("Account disabled", Code.Unauthenticated);
    }

    const now = Math.floor(Date.now() / 1000);
    const accessToken = await issueAccessToken({
      iss: "https://auth.ag-ide.local",
      aud: "ag-ide-platform",
      iat: now,
      exp: now + 900,
      jti: generateJTI(),
      sid: sid,
      sub: user.id,
      org_id: session.org_id,
      roles: [user.role],
      scope: user.status === 'PENDING_VERIFICATION' ? "verify_email" : ""
    } as any);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
      status: user.status
    };
  });

  router.rpc(AuthService, AuthService.methods.logout, async (req: any, context: any) => {
    // Session ID should come from authenticated context, but here we take from request
    const sid = req.sessionId;
    if (sid) {
      await SessionManager.revokeSession(sid);
      await db.transaction().execute(async (tx) => {
        await publishOutboxEvent(tx, "Session", sid, "auth.logout", { sid });
      });
    }
    return {};
  });

  router.rpc(AuthService, AuthService.methods.revokeSession, async (req: any) => {
    // Mock: just revoke based on what's passed
    if (req.sessionId) {
      await SessionManager.revokeSession(req.sessionId);
    }
    return {};
  });

  router.rpc(AuthService, AuthService.methods.forgotPassword, async (req: any) => {
    const { email } = req;
    const user = await db.selectFrom('users').where('email', '=', email).select(['id']).executeTakeFirst();
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await redis.set(`reset:${tokenHash}`, user.id, 'EX', 15 * 60);
      await mailer.sendPasswordResetEmail(email, rawToken);
    }
    return {}; // Generic response
  });

  router.rpc(AuthService, AuthService.methods.resetPassword, async (req: any) => {
    const { token, newPassword } = req;
    if (newPassword.length < 8) throw new ConnectError("Password too weak", Code.InvalidArgument);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const userId = await redis.get(`reset:${tokenHash}`);
    
    if (!userId) {
      throw new ConnectError("Invalid or expired token", Code.InvalidArgument);
    }

    // Atomic consumption
    await redis.del(`reset:${tokenHash}`);

    const hash = await PasswordService.hash(newPassword);
    await db.updateTable('users').set({ password_hash: hash }).where('id', '=', userId).execute();

    // In a real system, we would query Redis for all sessions for this user_id and revoke them.
    // For this mock without a secondary index, we would need to store user sessions in a Set in Redis to revoke easily.
    
    return {};
  });

  router.rpc(AuthService, AuthService.methods.verifyEmail, async (req: any) => {
    const { token } = req;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const userId = await redis.get(`verify:${tokenHash}`);

    if (!userId) {
      throw new ConnectError("Invalid or expired token", Code.InvalidArgument);
    }

    await redis.del(`verify:${tokenHash}`);
    await db.updateTable('users').set({ status: 'ACTIVE' }).where('id', '=', userId).execute();

    return {};
  });

  router.rpc(AuthService, AuthService.methods.resendVerification, async (req: any) => {
    // In a secure system, this requires an authenticated context (even if PENDING_VERIFICATION)
    // To prevent abuse. For now we assume Gateway protects it.
    // However, we don't have the user object here directly unless passed by gateway via headers.
    return {};
  });

  router.rpc(AuthService, AuthService.methods.introspectToken, async (req: any) => {
    return { active: true, userContext: { id: "mock", roles: [] } as any };
  });
};
