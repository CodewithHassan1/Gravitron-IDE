import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorize, Role } from '@ag/auth';
import { Code, ConnectError } from '@connectrpc/connect';
import { generateKeyPair, exportSPKI } from 'jose';
import crypto from 'node:crypto';

// Existing Layer 2 RBAC direct unit tests
describe('Organization Service Layer 2 RBAC', () => {
  it('OWNER can update organization', () => {
    expect(authorize({ id: 'u1', roles: ['OWNER'] }, 'organization:update')).toBe(true);
  });
  it('ADMIN can update organization', () => {
    expect(authorize({ id: 'u1', roles: ['ADMIN'] }, 'organization:update')).toBe(true);
  });
  it('MEMBER cannot update organization', () => {
    expect(authorize({ id: 'u1', roles: ['MEMBER'] }, 'organization:update')).toBe(false);
  });
  it('VIEWER cannot update organization', () => {
    expect(authorize({ id: 'u1', roles: ['VIEWER'] }, 'organization:update')).toBe(false);
  });

  it('OWNER can delete organization', () => {
    expect(authorize({ id: 'u1', roles: ['OWNER'] }, 'organization:delete')).toBe(true);
  });
  it('ADMIN cannot delete organization', () => {
    expect(authorize({ id: 'u1', roles: ['ADMIN'] }, 'organization:delete')).toBe(false);
  });
  it('MEMBER cannot delete organization', () => {
    expect(authorize({ id: 'u1', roles: ['MEMBER'] }, 'organization:delete')).toBe(false);
  });
  it('VIEWER cannot delete organization', () => {
    expect(authorize({ id: 'u1', roles: ['VIEWER'] }, 'organization:delete')).toBe(false);
  });

  it('VIEWER cannot execute agent', () => {
    expect(authorize({ id: 'u1', roles: ['VIEWER'] }, 'agent:execute')).toBe(false);
  });
  it('MEMBER can execute agent', () => {
    expect(authorize({ id: 'u1', roles: ['MEMBER'] }, 'agent:execute')).toBe(true);
  });

  it('VIEWER cannot invite member', () => {
    expect(authorize({ id: 'u1', roles: ['VIEWER'] }, 'member:invite')).toBe(false);
  });
  it('MEMBER cannot invite member', () => {
    expect(authorize({ id: 'u1', roles: ['MEMBER'] }, 'member:invite')).toBe(false);
  });
  it('ADMIN can invite member', () => {
    expect(authorize({ id: 'u1', roles: ['ADMIN'] }, 'member:invite')).toBe(true);
  });
  it('OWNER can invite member', () => {
    expect(authorize({ id: 'u1', roles: ['OWNER'] }, 'member:invite')).toBe(true);
  });
});

const { mockDb, mockGetMemberRole } = vi.hoisted(() => {
  const mockDb = {
    selectFrom: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    forUpdate: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    executeTakeFirst: vi.fn(),
    executeTakeFirstOrThrow: vi.fn(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    deleteFrom: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
  };
  const mockGetMemberRole = vi.fn();
  return { mockDb, mockGetMemberRole };
});

// Mock database and repositories
vi.mock('@ag/database', () => {
  return {
    db: mockDb,
    OrganizationRepository: vi.fn().mockImplementation(() => ({
      getMemberRole: mockGetMemberRole,
    })),
    publishOutboxEvent: vi.fn().mockResolvedValue('mock-event-id'),
  };
});

import { db, OrganizationRepository, publishOutboxEvent } from '@ag/database';
import { organizationRoutes } from './server';

describe('Organization Membership Management RPC Handlers (SEC-AUTH-04)', () => {
  let handlers: Record<string, Function> = {};
  let mockTx: any;
  let orgRepoInstance: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { publicKey } = await generateKeyPair('ES256');
    process.env.INTERNAL_PUBLIC_KEY = await exportSPKI(publicKey);

    mockTx = {
      selectFrom: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      forUpdate: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      deleteFrom: vi.fn().mockReturnThis(),
    };

    (db.transaction as any).mockReturnValue({
      execute: vi.fn().mockImplementation(async (cb: any) => cb(mockTx)),
    });

    const mockFastify: any = {
      log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      register: vi.fn().mockImplementation((plugin, opts) => {
        if (opts && typeof opts.routes === 'function') {
          const mockRouter = {
            rpc: (service: any, method: any, handler: any) => {
              const name = method.name.charAt(0).toLowerCase() + method.name.slice(1);
              handlers[name] = handler;
            },
          };
          opts.routes(mockRouter);
        }
      }),
    };

    await organizationRoutes(mockFastify, {} as any);
    orgRepoInstance = { getMemberRole: mockGetMemberRole };
  });

  const makeContext = (userId?: string) => ({
    requestHeader: {
      get: (header: string) => {
        if (header.toLowerCase() === 'x-trusted-user-id') return userId;
        return null;
      },
    },
  });

  describe('listMembers', () => {
    it('throws Unauthenticated if x-trusted-user-id is missing', async () => {
      await expect(
        handlers.listMembers({ organizationId: 'org-1' }, makeContext())
      ).rejects.toThrowError(new ConnectError('Unauthenticated', Code.Unauthenticated));
    });

    it('throws InvalidArgument if organizationId is missing', async () => {
      await expect(handlers.listMembers({}, makeContext('user-1'))).rejects.toThrowError(
        new ConnectError('Organization ID required', Code.InvalidArgument)
      );
    });

    it('throws NotFound if caller is not a member of the organization (probing protection)', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce(null);

      await expect(
        handlers.listMembers({ organizationId: 'org-foreign' }, makeContext('user-1'))
      ).rejects.toThrowError(new ConnectError('Organization not found', Code.NotFound));
    });

    it('throws NotFound if organization does not exist or is deleted', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('MEMBER');
      (db as any).executeTakeFirst.mockResolvedValueOnce(undefined); // org not found

      await expect(
        handlers.listMembers({ organizationId: 'org-deleted' }, makeContext('user-1'))
      ).rejects.toThrowError(new ConnectError('Organization not found', Code.NotFound));
    });

    it('returns member list for valid organization member', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('MEMBER');
      (db as any).executeTakeFirst.mockResolvedValueOnce({ id: 'org-1' }); // org exists
      (db as any).execute.mockResolvedValueOnce([
        { userId: 'u1', role: 'OWNER', email: 'owner@example.com', displayName: 'Owner' },
        { userId: 'u2', role: 'MEMBER', email: 'member@example.com', displayName: null },
      ]);

      const res = await handlers.listMembers({ organizationId: 'org-1' }, makeContext('user-1'));
      expect(res.members).toHaveLength(2);
      expect(res.members[0]).toEqual({
        userId: 'u1',
        role: 'OWNER',
        email: 'owner@example.com',
        displayName: 'Owner',
      });
      expect(res.members[1]).toEqual({
        userId: 'u2',
        role: 'MEMBER',
        email: 'member@example.com',
        displayName: '',
      });
    });
  });

  describe('inviteMember', () => {
    it('throws Unauthenticated if caller is unauthenticated', async () => {
      await expect(
        handlers.inviteMember(
          { organizationId: 'org-1', email: 'a@b.com', role: 'MEMBER' },
          makeContext()
        )
      ).rejects.toThrowError(new ConnectError('Unauthenticated', Code.Unauthenticated));
    });

    it('throws InvalidArgument for missing organizationId, email, or role', async () => {
      await expect(
        handlers.inviteMember({ email: 'a@b.com', role: 'MEMBER' }, makeContext('u1'))
      ).rejects.toThrowError(new ConnectError('Organization ID required', Code.InvalidArgument));

      await expect(
        handlers.inviteMember(
          { organizationId: 'org-1', email: 'invalid-email', role: 'MEMBER' },
          makeContext('u1')
        )
      ).rejects.toThrowError(new ConnectError('Valid email required', Code.InvalidArgument));

      await expect(
        handlers.inviteMember(
          { organizationId: 'org-1', email: 'a@b.com', role: 'SUPERUSER' },
          makeContext('u1')
        )
      ).rejects.toThrowError(new ConnectError('Invalid role', Code.InvalidArgument));
    });

    it('throws NotFound if caller is not in organization (cross-tenant probing protection)', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce(null);

      await expect(
        handlers.inviteMember(
          { organizationId: 'org-other', email: 'a@b.com', role: 'MEMBER' },
          makeContext('u1')
        )
      ).rejects.toThrowError(new ConnectError('Organization not found', Code.NotFound));
    });

    it('throws PermissionDenied if MEMBER or VIEWER attempts to invite', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('MEMBER');

      await expect(
        handlers.inviteMember(
          { organizationId: 'org-1', email: 'a@b.com', role: 'MEMBER' },
          makeContext('u1')
        )
      ).rejects.toThrowError(
        new ConnectError('Permission denied: member:invite', Code.PermissionDenied)
      );
    });

    it('throws PermissionDenied if ADMIN attempts to invite an OWNER', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('ADMIN');

      await expect(
        handlers.inviteMember(
          { organizationId: 'org-1', email: 'a@b.com', role: 'OWNER' },
          makeContext('u1')
        )
      ).rejects.toThrowError(
        new ConnectError(
          'Only an OWNER can invite members with the OWNER role',
          Code.PermissionDenied
        )
      );
    });

    it('throws AlreadyExists if target user is already a member', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('OWNER');
      (db as any).executeTakeFirst
        .mockResolvedValueOnce({ id: 'org-1' }) // org exists
        .mockResolvedValueOnce({ user_id: 'existing-u' }); // existing member

      await expect(
        handlers.inviteMember(
          { organizationId: 'org-1', email: 'existing@b.com', role: 'MEMBER' },
          makeContext('u1')
        )
      ).rejects.toThrowError(
        new ConnectError('User is already a member of this organization', Code.AlreadyExists)
      );
    });

    it('throws AlreadyExists if active pending invitation already exists for target email', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('OWNER');
      (db as any).executeTakeFirst
        .mockResolvedValueOnce({ id: 'org-1' }) // org exists
        .mockResolvedValueOnce(undefined) // not existing member
        .mockResolvedValueOnce({ id: 'invite-1' }); // existing active invite

      await expect(
        handlers.inviteMember(
          { organizationId: 'org-1', email: 'pending@b.com', role: 'MEMBER' },
          makeContext('u1')
        )
      ).rejects.toThrowError(
        new ConnectError('An active invitation for this email already exists', Code.AlreadyExists)
      );
    });

    it('succeeds for valid OWNER invitation: stores SHA-256 hash in DB and emits outbox event', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('OWNER');
      (db as any).executeTakeFirst
        .mockResolvedValueOnce({ id: 'org-1' }) // org exists
        .mockResolvedValueOnce(undefined) // not a member
        .mockResolvedValueOnce(undefined); // no pending invite

      const res = await handlers.inviteMember(
        { organizationId: 'org-1', email: 'NewUser@Example.Com', role: 'ADMIN' },
        makeContext('u1')
      );

      expect(res).toEqual({});
      expect(mockTx.insertInto).toHaveBeenCalledWith('organization_invitations');
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: 'org-1',
          email: 'newuser@example.com',
          role: 'ADMIN',
          status: 'PENDING',
          token: expect.stringMatching(/^[0-9a-f]{64}$/), // SHA-256 hash
          created_by: 'u1',
        })
      );

      // Verify outbox event carries raw token
      expect(publishOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        'Organization',
        'org-1',
        'organization.member.invited',
        expect.objectContaining({
          organizationId: 'org-1',
          email: 'newuser@example.com',
          role: 'ADMIN',
          token: expect.stringMatching(/^[0-9a-f]{64}$/), // rawToken
        })
      );
    });

    it('rolls back and propagates error if database transaction fails', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('OWNER');
      (db as any).executeTakeFirst
        .mockResolvedValueOnce({ id: 'org-1' })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      (mockTx.execute as any).mockRejectedValueOnce(new Error('DB failure'));

      await expect(
        handlers.inviteMember(
          { organizationId: 'org-1', email: 'new@b.com', role: 'MEMBER' },
          makeContext('u1')
        )
      ).rejects.toThrowError('DB failure');
    });
  });

  describe('acceptInvitation', () => {
    it('throws Unauthenticated if caller is unauthenticated', async () => {
      await expect(handlers.acceptInvitation({ token: 'tok' }, makeContext())).rejects.toThrowError(
        new ConnectError('Unauthenticated', Code.Unauthenticated)
      );
    });

    it('throws InvalidArgument if token is missing', async () => {
      await expect(handlers.acceptInvitation({}, makeContext('u1'))).rejects.toThrowError(
        new ConnectError('Invitation token required', Code.InvalidArgument)
      );
    });

    it('throws NotFound if invitation token hash is not found', async () => {
      (mockTx.executeTakeFirst as any).mockResolvedValueOnce(undefined); // invite not found

      await expect(
        handlers.acceptInvitation({ token: 'unknown-token' }, makeContext('u1'))
      ).rejects.toThrowError(new ConnectError('Invitation not found', Code.NotFound));
    });

    it('throws FailedPrecondition if invitation is not PENDING (replay rejection)', async () => {
      (mockTx.executeTakeFirst as any).mockResolvedValueOnce({
        id: 'inv-1',
        status: 'ACCEPTED',
        expires_at: new Date(Date.now() + 100000),
      });

      await expect(
        handlers.acceptInvitation({ token: 'already-used-token' }, makeContext('u1'))
      ).rejects.toThrowError(
        new ConnectError('Invitation has already been accepted or revoked', Code.FailedPrecondition)
      );
    });

    it('throws FailedPrecondition if invitation has expired', async () => {
      (mockTx.executeTakeFirst as any).mockResolvedValueOnce({
        id: 'inv-1',
        status: 'PENDING',
        expires_at: new Date(Date.now() - 100000), // expired
      });

      await expect(
        handlers.acceptInvitation({ token: 'expired-token' }, makeContext('u1'))
      ).rejects.toThrowError(new ConnectError('Invitation has expired', Code.FailedPrecondition));
    });

    it('throws PermissionDenied if user account is DISABLED', async () => {
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({
          id: 'inv-1',
          status: 'PENDING',
          expires_at: new Date(Date.now() + 100000),
          email: 'target@example.com',
        })
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'target@example.com',
          status: 'DISABLED',
        });

      await expect(
        handlers.acceptInvitation({ token: 'valid-tok' }, makeContext('u1'))
      ).rejects.toThrowError(new ConnectError('Account is disabled', Code.PermissionDenied));
    });

    it('throws PermissionDenied if authenticated user email does not match invitation recipient', async () => {
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({
          id: 'inv-1',
          status: 'PENDING',
          expires_at: new Date(Date.now() + 100000),
          email: 'target@example.com',
        })
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'attacker@example.com',
          status: 'ACTIVE',
        });

      await expect(
        handlers.acceptInvitation({ token: 'valid-tok' }, makeContext('u1'))
      ).rejects.toThrowError(
        new ConnectError(
          'This invitation was issued for a different email address',
          Code.PermissionDenied
        )
      );
    });

    it('throws AlreadyExists if user is already a member of the organization', async () => {
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({
          id: 'inv-1',
          organization_id: 'org-1',
          status: 'PENDING',
          expires_at: new Date(Date.now() + 100000),
          email: 'target@example.com',
          role: 'MEMBER',
        })
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'target@example.com',
          status: 'ACTIVE',
        })
        .mockResolvedValueOnce({ role: 'MEMBER' }); // already in org

      await expect(
        handlers.acceptInvitation({ token: 'valid-tok' }, makeContext('u1'))
      ).rejects.toThrowError(
        new ConnectError('User is already a member of this organization', Code.AlreadyExists)
      );
    });

    it('atomically marks invitation accepted and inserts organization member', async () => {
      const rawToken = 'my-secret-invitation-token-12345';
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({
          id: 'inv-1',
          organization_id: 'org-1',
          status: 'PENDING',
          expires_at: new Date(Date.now() + 100000),
          email: 'target@example.com',
          role: 'ADMIN',
        })
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'target@example.com',
          status: 'ACTIVE',
        })
        .mockResolvedValueOnce(undefined); // not already member

      const res = await handlers.acceptInvitation({ token: rawToken }, makeContext('u1'));
      expect(res).toEqual({});

      // Verified row lock was called
      expect(mockTx.forUpdate).toHaveBeenCalled();

      // Verified invitation updated to ACCEPTED
      expect(mockTx.updateTable).toHaveBeenCalledWith('organization_invitations');
      expect(mockTx.set).toHaveBeenCalledWith({ status: 'ACCEPTED' });

      // Verified member record inserted with target role
      expect(mockTx.insertInto).toHaveBeenCalledWith('organization_members');
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: 'org-1',
          user_id: 'u1',
          role: 'ADMIN',
        })
      );

      // Verified outbox event published
      expect(publishOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        'Organization',
        'org-1',
        'organization.member.joined',
        expect.objectContaining({
          invitationId: 'inv-1',
          organizationId: 'org-1',
          userId: 'u1',
          role: 'ADMIN',
        })
      );
    });
  });

  describe('removeMember', () => {
    it('throws Unauthenticated if caller is unauthenticated', async () => {
      await expect(
        handlers.removeMember({ organizationId: 'org-1', userId: 'u2' }, makeContext())
      ).rejects.toThrowError(new ConnectError('Unauthenticated', Code.Unauthenticated));
    });

    it('throws InvalidArgument if organizationId or userId missing', async () => {
      await expect(handlers.removeMember({ userId: 'u2' }, makeContext('u1'))).rejects.toThrowError(
        new ConnectError('Organization ID and User ID required', Code.InvalidArgument)
      );
    });

    it('throws NotFound if caller is not in organization (cross-tenant probing protection)', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce(null);

      await expect(
        handlers.removeMember({ organizationId: 'org-foreign', userId: 'u2' }, makeContext('u1'))
      ).rejects.toThrowError(new ConnectError('Organization not found', Code.NotFound));
    });

    it('throws PermissionDenied if MEMBER or VIEWER attempts to remove another member', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('MEMBER');

      await expect(
        handlers.removeMember({ organizationId: 'org-1', userId: 'u2' }, makeContext('u1'))
      ).rejects.toThrowError(
        new ConnectError('Permission denied: member:remove', Code.PermissionDenied)
      );
    });

    it('throws NotFound if target member is not in the organization', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('OWNER');
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({ id: 'org-1' }) // org exists and locked
        .mockResolvedValueOnce(undefined); // target member not found

      await expect(
        handlers.removeMember({ organizationId: 'org-1', userId: 'unknown-u' }, makeContext('u1'))
      ).rejects.toThrowError(new ConnectError('Member not found in organization', Code.NotFound));
    });

    it('throws PermissionDenied if ADMIN attempts to remove an OWNER', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('ADMIN');
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({ id: 'org-1' })
        .mockResolvedValueOnce({ role: 'OWNER' }); // target is OWNER

      await expect(
        handlers.removeMember(
          { organizationId: 'org-1', userId: 'owner-u' },
          makeContext('admin-u')
        )
      ).rejects.toThrowError(
        new ConnectError('ADMIN cannot remove an OWNER', Code.PermissionDenied)
      );
    });

    it('throws FailedPrecondition when removing the last OWNER of an organization (Last-OWNER Invariant)', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('OWNER');
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({ id: 'org-1' }) // org locked
        .mockResolvedValueOnce({ role: 'OWNER' }); // target is OWNER
      (mockTx.execute as any).mockResolvedValueOnce([{ user_id: 'u1' }]); // only 1 owner in org

      await expect(
        handlers.removeMember({ organizationId: 'org-1', userId: 'u1' }, makeContext('u1'))
      ).rejects.toThrowError(
        new ConnectError('Cannot remove the last OWNER of an organization', Code.FailedPrecondition)
      );
    });

    it('serializes removal with organization row lock and succeeds when multiple owners exist', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('OWNER');
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({ id: 'org-1' }) // org locked FOR UPDATE
        .mockResolvedValueOnce({ role: 'OWNER' }); // target is OWNER
      (mockTx.execute as any).mockResolvedValueOnce([{ user_id: 'u1' }, { user_id: 'u2' }]); // 2 owners

      const res = await handlers.removeMember(
        { organizationId: 'org-1', userId: 'u2' },
        makeContext('u1')
      );
      expect(res).toEqual({});

      // Verify organization was locked FOR UPDATE to serialize concurrent owner changes
      expect(mockTx.selectFrom).toHaveBeenCalledWith('organizations');
      expect(mockTx.forUpdate).toHaveBeenCalled();

      // Verify deletion from organization_members
      expect(mockTx.deleteFrom).toHaveBeenCalledWith('organization_members');
      expect(mockTx.where).toHaveBeenCalledWith('organization_id', '=', 'org-1');
      expect(mockTx.where).toHaveBeenCalledWith('user_id', '=', 'u2');

      // Verify outbox event emitted
      expect(publishOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        'Organization',
        'org-1',
        'organization.member.removed',
        expect.objectContaining({
          organizationId: 'org-1',
          targetUserId: 'u2',
          removedBy: 'u1',
          targetRole: 'OWNER',
        })
      );
    });

    it('allows MEMBER to remove themselves (leave organization)', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('MEMBER');
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({ id: 'org-1' })
        .mockResolvedValueOnce({ role: 'MEMBER' }); // target is MEMBER

      const res = await handlers.removeMember(
        { organizationId: 'org-1', userId: 'u-member' },
        makeContext('u-member')
      );
      expect(res).toEqual({});
      expect(mockTx.deleteFrom).toHaveBeenCalledWith('organization_members');
    });

    it('allows ADMIN to remove a MEMBER', async () => {
      orgRepoInstance.getMemberRole.mockResolvedValueOnce('ADMIN');
      (mockTx.executeTakeFirst as any)
        .mockResolvedValueOnce({ id: 'org-1' })
        .mockResolvedValueOnce({ role: 'MEMBER' });

      const res = await handlers.removeMember(
        { organizationId: 'org-1', userId: 'u-member' },
        makeContext('u-admin')
      );
      expect(res).toEqual({});
      expect(mockTx.deleteFrom).toHaveBeenCalledWith('organization_members');
    });
  });
});
