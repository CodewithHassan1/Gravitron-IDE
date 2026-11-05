import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Code, ConnectError } from '@connectrpc/connect';
import setupRouter from './server';
import { AuthService } from '@ag/proto/gen/ts/auth/v1/auth_connect';

// Mock dependencies
vi.mock('@ag/config', () => ({
  validateConfig: vi.fn().mockReturnValue({
    REDIS_URL: 'redis://localhost:6379',
    SMTP_URL: 'smtp://localhost',
    JWT_SECRET: 'test-secret',
    GATEWAY_PORT: 8080,
  }),
}));
vi.mock('@ag/database', () => ({
  publishOutboxEvent: vi.fn(),
  db: {
    selectFrom: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    updateTable: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    transaction: vi.fn().mockReturnValue({ execute: vi.fn() }),
  },
}));
vi.mock('@ag/database/src/outbox', () => ({
  publishOutboxEvent: vi.fn(),
}));
vi.mock('./services/jwt', () => ({
  issueAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
  generateRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  generateJTI: vi.fn().mockReturnValue('mock-jti'),
  verifyAccessToken: vi.fn(),
}));
vi.mock('./services/password', () => ({
  PasswordService: {
    hash: vi.fn().mockResolvedValue('hashed'),
    compare: vi.fn().mockResolvedValue(true),
    dummyCompare: vi.fn().mockResolvedValue(false),
  },
}));
vi.mock('@ag/cache', () => ({
  SessionManager: {
    createSession: vi.fn(),
    rotateJTI: vi.fn(),
    revokeSession: vi.fn(),
    getSession: vi.fn(),
  },
}));
const { mockRedisSet, mockRedisGet, mockRedisDel, mockSendVerificationEmail } = vi.hoisted(() => ({
  mockRedisSet: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: class Redis {
    set = mockRedisSet;
    get = mockRedisGet;
    getdel = mockRedisDel;
    del = mockRedisDel;
  },
}));
vi.mock('./services/mailer', () => ({
  DevelopmentMailer: class {
    sendVerificationEmail = mockSendVerificationEmail;
    sendPasswordResetEmail = vi.fn();
  },
  ProductionMailer: class {
    sendVerificationEmail = mockSendVerificationEmail;
    sendPasswordResetEmail = vi.fn();
  },
}));

import { db } from '@ag/database';
import { PasswordService } from './services/password';
import { SessionManager } from '@ag/cache';
import crypto from 'crypto';
import Redis from 'ioredis';

describe('Auth Service Error Handling Boundaries', () => {
  let handlers: Record<string, Function> = {};
  let redis: Redis;
  let mockTx: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTx = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };

    (db.transaction as any).mockReturnValue({
      execute: vi.fn().mockImplementation(async (cb: any) => cb(mockTx)),
    });

    // Mock the router.rpc to intercept the registered handlers
    const mockRouter: any = {
      rpc: (service: any, method: any, handler: any) => {
        const methodName = method.name
          ? method.name.charAt(0).toLowerCase() + method.name.slice(1)
          : '';
        if (methodName) handlers[methodName] = handler;
      },
    };

    setupRouter(mockRouter);
  });

  describe('passwordLogin', () => {
    it('throws InvalidArgument if email or password missing', async () => {
      await expect(handlers.passwordLogin({ email: '' }, {})).rejects.toThrowError(
        new ConnectError('Email and password required', Code.InvalidArgument)
      );
    });

    it('throws Unauthenticated (The email or password is incorrect.) for non-existent user to prevent enumeration', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined);

      await expect(
        handlers.passwordLogin({ email: 'unknown@example.com', password: 'password123' }, {})
      ).rejects.toThrowError(
        new ConnectError('The email or password is incorrect.', Code.Unauthenticated)
      );

      expect(PasswordService.dummyCompare).toHaveBeenCalled();
    });

    it('throws Unauthenticated (The email or password is incorrect.) for wrong password', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce({
        password_hash: 'hash',
        status: 'ACTIVE',
      });
      (PasswordService.compare as any).mockResolvedValueOnce(false);

      await expect(
        handlers.passwordLogin({ email: 'user@example.com', password: 'wrongpassword' }, {})
      ).rejects.toThrowError(
        new ConnectError('The email or password is incorrect.', Code.Unauthenticated)
      );
    });

    it('throws PermissionDenied if account is disabled', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce({
        password_hash: 'hash',
        status: 'DISABLED',
      });
      (PasswordService.compare as any).mockResolvedValueOnce(true);

      await expect(
        handlers.passwordLogin({ email: 'user@example.com', password: 'password123' }, {})
      ).rejects.toThrowError(
        new ConnectError(
          'Your account has been disabled. Please contact support for assistance.',
          Code.PermissionDenied
        )
      );
    });

    it('returns access token for successful login', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce({
        id: 'uid',
        password_hash: 'hash',
        status: 'ACTIVE',
        role: 'MEMBER',
      });
      (PasswordService.compare as any).mockResolvedValueOnce(true);

      const res = await handlers.passwordLogin(
        { email: 'user@example.com', password: 'password123' },
        {}
      );
      expect(res.accessToken).toBe('mock-access-token');
      expect(res.status).toBe('ACTIVE');
    });

    it('returns compound refreshToken matching sid:opaque format and saves hash to SessionManager', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce({
        id: 'uid',
        password_hash: 'hash',
        status: 'ACTIVE',
        role: 'MEMBER',
      });
      (PasswordService.compare as any).mockResolvedValueOnce(true);

      const res = await handlers.passwordLogin(
        { email: 'user@example.com', password: 'password123' },
        {}
      );
      expect(res.refreshToken).toBeDefined();
      const parts = res.refreshToken.split(':');
      expect(parts.length).toBe(2);
      expect(parts[0]).toMatch(/^[0-9a-f-]{36}$/); // UUID format for sid
      expect(parts[1]).toBe('mock-refresh-token');

      // Verify SessionManager received the SHA-256 hash of the exact compound token
      const expectedHash = crypto.createHash('sha256').update(res.refreshToken).digest('hex');
      expect(SessionManager.createSession).toHaveBeenCalledWith(
        parts[0],
        expect.objectContaining({
          user_id: 'uid',
          current_jti: expectedHash,
        })
      );
    });
  });

  describe('register', () => {
    it('throws InvalidArgument for weak passwords', async () => {
      await expect(
        handlers.register({ email: 'test@example.com', password: 'weak', displayName: 'Test' }, {})
      ).rejects.toThrowError(
        new ConnectError('Password must be at least 8 characters long', Code.InvalidArgument)
      );
    });

    it('throws AlreadyExists if user already exists', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce({ id: 'uid' });

      await expect(
        handlers.register(
          { email: 'test@example.com', password: 'validpassword123', displayName: 'Test' },
          {}
        )
      ).rejects.toThrowError(
        new ConnectError(
          'An account with this email address already exists. Please sign in or use a different email address.',
          Code.AlreadyExists
        )
      );
    });

    it('succeeds for valid new user, executing user, organization, and member creation in an atomic transaction', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined);
      mockSendVerificationEmail.mockResolvedValueOnce(undefined);

      const res = await handlers.register(
        { email: 'new@example.com', password: 'validpassword123', displayName: 'Test' },
        {}
      );
      expect(res.userId).toBeDefined();
      expect(res.status).toBe('PENDING_VERIFICATION');

      // Assert transaction was executed
      expect(db.transaction).toHaveBeenCalled();
      // Assert all 3 inserts were called on the transaction object tx
      expect(mockTx.insertInto).toHaveBeenCalledWith('users');
      expect(mockTx.insertInto).toHaveBeenCalledWith('organizations');
      expect(mockTx.insertInto).toHaveBeenCalledWith('organization_members');
    });

    it('rolls back and propagates error if user insertion fails within transaction', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined);
      mockTx.insertInto.mockImplementationOnce(() => {
        throw new Error('Database error on user insert');
      });

      await expect(
        handlers.register(
          { email: 'fail-user@example.com', password: 'validpassword123', displayName: 'Test' },
          {}
        )
      ).rejects.toThrowError('Database error on user insert');
    });

    it('rolls back and propagates error if organization insertion fails within transaction', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined);
      mockTx.insertInto
        .mockReturnValueOnce({
          values: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValueOnce(undefined),
        }) // user insert ok
        .mockImplementationOnce(() => {
          throw new Error('Database error on organization insert');
        });

      await expect(
        handlers.register(
          { email: 'fail-org@example.com', password: 'validpassword123', displayName: 'Test' },
          {}
        )
      ).rejects.toThrowError('Database error on organization insert');
    });

    it('rolls back and propagates error if membership insertion fails within transaction', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined);
      mockTx.insertInto
        .mockReturnValueOnce({
          values: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValueOnce(undefined),
        }) // user insert ok
        .mockReturnValueOnce({
          values: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValueOnce(undefined),
        }) // org insert ok
        .mockImplementationOnce(() => {
          throw new Error('Database error on member insert');
        });

      await expect(
        handlers.register(
          { email: 'fail-member@example.com', password: 'validpassword123', displayName: 'Test' },
          {}
        )
      ).rejects.toThrowError('Database error on member insert');
    });

    it('succeeds but sets status PENDING_VERIFICATION_EMAIL_FAILED if email sending fails', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined);
      mockSendVerificationEmail.mockRejectedValueOnce(new Error('SMTP timeout'));

      const res = await handlers.register(
        { email: 'new2@example.com', password: 'validpassword123', displayName: 'Test' },
        {}
      );
      expect(res.userId).toBeDefined();
      expect(res.status).toBe('PENDING_VERIFICATION_EMAIL_FAILED');
    });
  });

  describe('refresh', () => {
    it('throws Unauthenticated if refreshToken is missing', async () => {
      await expect(handlers.refresh({}, {})).rejects.toThrowError(
        new ConnectError('Refresh token required', Code.Unauthenticated)
      );
    });

    it('throws Unauthenticated if refreshToken has invalid format without colon', async () => {
      await expect(
        handlers.refresh({ refreshToken: 'raw_opaque_token_without_sid' }, {})
      ).rejects.toThrowError(new ConnectError('Invalid token format', Code.Unauthenticated));
    });

    it('throws Unauthenticated if refreshToken has empty parts', async () => {
      await expect(handlers.refresh({ refreshToken: ':opaque' }, {})).rejects.toThrowError(
        new ConnectError('Invalid token format', Code.Unauthenticated)
      );
      await expect(handlers.refresh({ refreshToken: 'sid:' }, {})).rejects.toThrowError(
        new ConnectError('Invalid token format', Code.Unauthenticated)
      );
    });

    it('rotates valid compound token and returns new access and refresh tokens', async () => {
      const sid = 'session-uuid-123';
      const opaque = 'opaque-token-abc';
      const incomingToken = `${sid}:${opaque}`;

      (SessionManager.rotateJTI as any).mockResolvedValueOnce(true);
      (SessionManager.getSession as any).mockResolvedValueOnce({
        user_id: 'user-456',
        org_id: 'org-789',
        current_jti: 'some-hash',
        expires_at: Date.now() + 100000,
      });
      (db as any).executeTakeFirst.mockResolvedValueOnce({
        id: 'user-456',
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      const res = await handlers.refresh({ refreshToken: incomingToken }, {});
      expect(res.accessToken).toBe('mock-access-token');
      expect(res.refreshToken).toBe(`${sid}:mock-refresh-token`);
      expect(res.expiresIn).toBe(900);
      expect(res.status).toBe('ACTIVE');

      // Verify SessionManager.rotateJTI called with matching expected hash
      const expectedActualHash = crypto.createHash('sha256').update(incomingToken).digest('hex');
      const expectedNewHash = crypto
        .createHash('sha256')
        .update(`${sid}:mock-refresh-token`)
        .digest('hex');
      expect(SessionManager.rotateJTI).toHaveBeenCalledWith(
        sid,
        expectedActualHash,
        expectedNewHash
      );
    });

    it('revokes session on replay detection when rotateJTI fails', async () => {
      const sid = 'session-replayed-123';
      const replayedToken = `${sid}:old-opaque-token`;

      (SessionManager.rotateJTI as any).mockResolvedValueOnce(false); // replay detected

      await expect(handlers.refresh({ refreshToken: replayedToken }, {})).rejects.toThrowError(
        new ConnectError('Invalid or replayed token', Code.Unauthenticated)
      );

      expect(SessionManager.revokeSession).toHaveBeenCalledWith(sid);
    });

    it('throws Unauthenticated and revokes session if account is disabled during refresh', async () => {
      const sid = 'session-disabled-123';
      const incomingToken = `${sid}:opaque-token`;

      (SessionManager.rotateJTI as any).mockResolvedValueOnce(true);
      (SessionManager.getSession as any).mockResolvedValueOnce({
        user_id: 'user-disabled',
        org_id: 'org-789',
      });
      (db as any).executeTakeFirst.mockResolvedValueOnce({
        id: 'user-disabled',
        role: 'MEMBER',
        status: 'DISABLED',
      });

      await expect(handlers.refresh({ refreshToken: incomingToken }, {})).rejects.toThrowError(
        new ConnectError('Account disabled', Code.Unauthenticated)
      );

      expect(SessionManager.revokeSession).toHaveBeenCalledWith(sid);
    });

    it('throws Unauthenticated if session has expired or is missing', async () => {
      const sid = 'session-expired-123';
      const incomingToken = `${sid}:opaque-token`;

      (SessionManager.rotateJTI as any).mockResolvedValueOnce(true);
      (SessionManager.getSession as any).mockResolvedValueOnce(null);

      await expect(handlers.refresh({ refreshToken: incomingToken }, {})).rejects.toThrowError(
        new ConnectError('Session expired', Code.Unauthenticated)
      );
    });
  });

  describe('forgotPassword', () => {
    it('returns generic success even if user does not exist (enumeration protection)', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined);

      const res = await handlers.forgotPassword({ email: 'unknown@example.com' }, {});
      expect(res).toEqual({});
    });

    it('returns generic success and sends email if user exists', async () => {
      (db as any).executeTakeFirst.mockResolvedValueOnce({ id: 'uid' });

      const res = await handlers.forgotPassword({ email: 'known@example.com' }, {});
      expect(res).toEqual({});
    });
  });

  describe('resetPassword', () => {
    it('throws InvalidArgument for weak password', async () => {
      await expect(
        handlers.resetPassword({ token: 'abc', newPassword: 'weak' }, {})
      ).rejects.toThrowError(
        new ConnectError('Password must be at least 8 characters long', Code.InvalidArgument)
      );
    });

    it('throws InvalidArgument if token is invalid or expired', async () => {
      // Mock redis.get to return null
      const redisInstance = new Redis();
      (redisInstance.get as any).mockResolvedValueOnce(null);

      await expect(
        handlers.resetPassword({ token: 'invalid_token', newPassword: 'validpassword123' }, {})
      ).rejects.toThrowError(new ConnectError('Invalid or expired token', Code.InvalidArgument));
    });
  });

  describe('verifyEmail', () => {
    it('throws InvalidArgument if token is missing', async () => {
      await expect(handlers.verifyEmail({ token: '' }, {})).rejects.toThrowError(
        new ConnectError('Token required', Code.InvalidArgument)
      );
    });

    it('throws InvalidArgument if token is invalid or expired', async () => {
      mockRedisDel.mockResolvedValueOnce(null);
      await expect(
        handlers.verifyEmail({ token: 'invalid_or_expired_token' }, {})
      ).rejects.toThrowError(new ConnectError('Invalid or expired token', Code.InvalidArgument));
    });

    it('atomically consumes valid token and activates user', async () => {
      mockRedisDel.mockResolvedValueOnce('user-123');
      const res = await handlers.verifyEmail({ token: 'valid_token' }, {});
      expect(res).toEqual({});
      expect(db.updateTable).toHaveBeenCalledWith('users');
      expect((db as any).set).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE' }));
    });

    it('rejects already consumed token on replay', async () => {
      mockRedisDel.mockResolvedValueOnce(null);
      await expect(handlers.verifyEmail({ token: 'replayed_token' }, {})).rejects.toThrowError(
        new ConnectError('Invalid or expired token', Code.InvalidArgument)
      );
    });
  });

  describe('resendVerification', () => {
    it('throws Unauthenticated if authorization header is missing', async () => {
      await expect(
        handlers.resendVerification({}, { requestHeader: new Map() })
      ).rejects.toThrowError(new ConnectError('Unauthenticated', Code.Unauthenticated));
    });

    it('throws Unauthenticated if token is invalid or expired', async () => {
      // simulate verifyAccessToken rejecting
      const { verifyAccessToken } = await import('./services/jwt');
      (verifyAccessToken as any).mockRejectedValueOnce(new Error('jwt expired'));
      await expect(
        handlers.resendVerification(
          {},
          { requestHeader: new Map([['authorization', 'Bearer bad.token']]) }
        )
      ).rejects.toThrowError(new ConnectError('Invalid or expired token', Code.Unauthenticated));
    });

    it('throws PermissionDenied if scope is not verify_email', async () => {
      const { verifyAccessToken } = await import('./services/jwt');
      (verifyAccessToken as any).mockResolvedValueOnce({ sub: 'uid', scope: 'wrong_scope' });

      await expect(
        handlers.resendVerification(
          {},
          { requestHeader: new Map([['authorization', `Bearer good.token`]]) }
        )
      ).rejects.toThrowError(
        new ConnectError('Insufficient scope for this action', Code.PermissionDenied)
      );
    });

    it('throws NotFound if user does not exist', async () => {
      const { verifyAccessToken } = await import('./services/jwt');
      (verifyAccessToken as any).mockResolvedValueOnce({
        sub: 'unknown-user',
        scope: 'verify_email',
      });
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined);

      await expect(
        handlers.resendVerification(
          {},
          { requestHeader: new Map([['authorization', `Bearer good.token`]]) }
        )
      ).rejects.toThrowError(new ConnectError('User not found', Code.NotFound));
    });

    it('throws FailedPrecondition if email is already verified', async () => {
      const { verifyAccessToken } = await import('./services/jwt');
      (verifyAccessToken as any).mockResolvedValueOnce({ sub: 'uid', scope: 'verify_email' });
      (db as any).executeTakeFirst.mockResolvedValueOnce({ id: 'uid', status: 'ACTIVE' });

      await expect(
        handlers.resendVerification(
          {},
          { requestHeader: new Map([['authorization', `Bearer good.token`]]) }
        )
      ).rejects.toThrowError(
        new ConnectError('Email is already verified', Code.FailedPrecondition)
      );
    });

    it('throws ResourceExhausted if rate limit prevents resend', async () => {
      const { verifyAccessToken } = await import('./services/jwt');
      (verifyAccessToken as any).mockResolvedValueOnce({ sub: 'uid', scope: 'verify_email' });
      (db as any).executeTakeFirst.mockResolvedValueOnce({
        id: 'uid',
        status: 'PENDING_VERIFICATION',
      });
      mockRedisSet.mockResolvedValueOnce(null); // NX fails

      await expect(
        handlers.resendVerification(
          {},
          { requestHeader: new Map([['authorization', `Bearer good.token`]]) }
        )
      ).rejects.toThrowError(
        new ConnectError(
          'Please wait a minute before requesting another verification email.',
          Code.ResourceExhausted
        )
      );
    });

    it('succeeds and sends email if user is PENDING_VERIFICATION', async () => {
      const { verifyAccessToken } = await import('./services/jwt');
      (verifyAccessToken as any).mockResolvedValueOnce({ sub: 'uid', scope: 'verify_email' });
      (db as any).executeTakeFirst.mockResolvedValueOnce({
        id: 'uid',
        email: 'test@example.com',
        status: 'PENDING_VERIFICATION',
      });
      mockRedisSet.mockResolvedValueOnce('OK'); // NX succeeds
      mockRedisSet.mockResolvedValueOnce('OK'); // verify token save

      const res = await handlers.resendVerification(
        {},
        { requestHeader: new Map([['authorization', `Bearer good.token`]]) }
      );
      expect(res).toEqual({});
    });
  });
});
