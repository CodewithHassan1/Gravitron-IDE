import { ConnectRouter, ConnectError, Code } from '@connectrpc/connect';
import { SessionManager } from '@ag/cache';
import { db, publishOutboxEvent } from '@ag/database';
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

const authIssuer = process.env.AUTH_ISSUER || "https://auth.ag-ide.local";
const authAudience = process.env.AUTH_AUDIENCE || "ag-ide-platform";

export default (router: ConnectRouter) => {
  // OIDC Login is deprecated in Phase 8.1
  router.rpc(AuthService, AuthService.methods.login, async (req: any, _context: any) => {
    throw new ConnectError("OIDC Login is deprecated. Use PasswordLogin.", Code.Unimplemented);
  });

  router.rpc(AuthService, AuthService.methods.register, async (req: any, _context: any) => {
    const rawEmail = req.email;
    const password = req.password;
    const displayName = req.displayName?.trim();
    if (!rawEmail || !password) throw new ConnectError("Email and password required", Code.InvalidArgument);
    if (password.length < 8) throw new ConnectError("Password must be at least 8 characters long", Code.InvalidArgument);

    const email = rawEmail.trim().toLowerCase();

    // Check if user exists
    const existing = await db.selectFrom('users').where('email', '=', email).selectAll().executeTakeFirst();
    if (existing) {
      throw new ConnectError("An account with this email address already exists. Please sign in or use a different email address.", Code.AlreadyExists);
    }

    const hash = await PasswordService.hash(password);
    const userId = crypto.randomUUID();

    const orgId = crypto.randomUUID();
    const slug = `${displayName || email.split('@')[0]}-personal-${userId.substring(0, 8)}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const now = new Date();

    await db.transaction().execute(async (tx) => {
      await tx.insertInto('users').values({
        id: userId,
        email,
        password_hash: hash,
        display_name: displayName,
        role: 'MEMBER',
        status: 'PENDING_VERIFICATION',
        created_at: now,
        updated_at: now
      }).execute();

      await tx.insertInto('organizations').values({
        id: orgId,
        name: `${displayName || 'User'}'s Personal Organization`,
        slug: slug,
        created_at: now,
        updated_at: now
      }).execute();

      await tx.insertInto('organization_members').values({
        organization_id: orgId,
        user_id: userId,
        role: 'OWNER',
        created_at: now
      }).execute();
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    // Store in Redis (24h TTL)
    await redis.set(`verify:${tokenHash}`, userId, 'EX', 24 * 60 * 60);

    let emailSent = false;
    try {
      await mailer.sendVerificationEmail(email, rawToken);
      emailSent = true;
    } catch (e: any) {
      console.error("Failed to send verification email during registration", e);
    }

    if (!emailSent) {
      return { userId, status: "PENDING_VERIFICATION_EMAIL_FAILED" };
    }
    return { userId, status: "PENDING_VERIFICATION" };
  });

  router.rpc(AuthService, AuthService.methods.passwordLogin, async (req: any, _context: any) => {
    const rawEmail = req.email;
    const { password } = req;
    if (!rawEmail || !password) throw new ConnectError("Email and password required", Code.InvalidArgument);

    const email = rawEmail.trim().toLowerCase();
    const user = await db.selectFrom('users').where('email', '=', email).selectAll().executeTakeFirst();
    if (!user) {
      await PasswordService.dummyCompare();
      throw new ConnectError("The email or password is incorrect.", Code.Unauthenticated);
    }

    if (!user.password_hash) {
      throw new ConnectError("The email or password is incorrect.", Code.Unauthenticated);
    }

    const valid = await PasswordService.compare(password, user.password_hash);
    if (!valid) {
      throw new ConnectError("The email or password is incorrect.", Code.Unauthenticated);
    }

    if (user.status === 'DISABLED') {
      throw new ConnectError("Your account has been disabled. Please contact support for assistance.", Code.PermissionDenied);
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

    const membership = await db
      .selectFrom('organization_members')
      .where('user_id', '=', user.id)
      .select(['organization_id'])
      .executeTakeFirst();
    const orgId = membership?.organization_id || '00000000-0000-0000-0000-000000000000';

    const accessToken = await issueAccessToken({
      iss: authIssuer,
      aud: authAudience,
      iat: now,
      exp: exp,
      jti: jti,
      sid: sid,
      sub: user.id,
      org_id: orgId,
      roles: roles,
      scope: scope
    } as any);

    const opaqueToken = generateRefreshToken();
    const compoundRefreshToken = `${sid}:${opaqueToken}`;

    // The JTI is conceptually the hash of the refresh token, 
    // or we can store the refresh token directly since Redis is server-side.
    // For true atomic rotation, we hash the refresh token to serve as JTI.
    const refreshHash = crypto.createHash('sha256').update(compoundRefreshToken).digest('hex');

    await SessionManager.createSession(sid, {
      user_id: user.id,
      org_id: orgId,
      current_jti: refreshHash, 
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    await db.transaction().execute(async (tx) => {
      await publishOutboxEvent(tx, "User", user.id, "auth.login", { sid });
    });

    return {
      accessToken,
      refreshToken: compoundRefreshToken,
      expiresIn: 900,
      status: user.status
    };
  });

  router.rpc(AuthService, AuthService.methods.refresh, async (req: any, _context: any) => {
    // req.refreshToken should be extracted by Gateway from HttpOnly cookie and passed down,
    // or passed directly if it's a mobile client.
    const token = req.refreshToken;
    if (!token) throw new ConnectError("Refresh token required", Code.Unauthenticated);

    // We need the SID. The refresh token format is `sid:opaque_random`.
    const parts = token.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new ConnectError("Invalid token format", Code.Unauthenticated);
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
      iss: authIssuer,
      aud: authAudience,
      iat: now,
      exp: now + 900,
      jti: generateJTI(),
      sid: sid,
      sub: user.id,
      org_id: session.org_id || '00000000-0000-0000-0000-000000000000',
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
    const rawEmail = req.email;
    if (!rawEmail) return {};
    const email = rawEmail.trim().toLowerCase();
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
    if (newPassword.length < 8) throw new ConnectError("Password must be at least 8 characters long", Code.InvalidArgument);

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
    if (!token) {
      throw new ConnectError("Token required", Code.InvalidArgument);
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const userId = await redis.getdel(`verify:${tokenHash}`);

    if (!userId) {
      throw new ConnectError("Invalid or expired token", Code.InvalidArgument);
    }

    await db.updateTable('users').set({ status: 'ACTIVE', updated_at: new Date() }).where('id', '=', userId).execute();

    return {};
  });

  router.rpc(AuthService, AuthService.methods.resendVerification, async (req: any, context: any) => {
    const authHeader = context.requestHeader.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ConnectError("Unauthenticated", Code.Unauthenticated);
    }
    const token = authHeader.split(" ")[1];
    
    let payload;
    try {
      const { verifyAccessToken } = await import('./services/jwt');
      payload = await verifyAccessToken(token);
    } catch (e) {
      throw new ConnectError("Invalid or expired token", Code.Unauthenticated);
    }

    const userId = payload.sub;
    if (!userId) {
      throw new ConnectError("Invalid token format", Code.Unauthenticated);
    }

    if ((payload as any).scope !== 'verify_email') {
      throw new ConnectError("Insufficient scope for this action", Code.PermissionDenied);
    }

    const user = await db.selectFrom('users').where('id', '=', userId).selectAll().executeTakeFirst();
    if (!user) {
      throw new ConnectError("User not found", Code.NotFound);
    }

    if (user.status !== 'PENDING_VERIFICATION') {
      throw new ConnectError("Email is already verified", Code.FailedPrecondition);
    }

    const rateLimitKey = `rate_limit:resend_verify:${userId}`;
    const canResend = await redis.set(rateLimitKey, '1', 'EX', 60, 'NX'); // 1 minute cooldown
    if (!canResend) {
      throw new ConnectError("Please wait a minute before requesting another verification email.", Code.ResourceExhausted);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    await redis.set(`verify:${tokenHash}`, userId, 'EX', 24 * 60 * 60);
    await mailer.sendVerificationEmail(user.email, rawToken);

    return {};
  });

  router.rpc(AuthService, AuthService.methods.introspectToken, async (req: any) => {
    return { active: true, userContext: { id: "mock", roles: [] } as any };
  });
};
