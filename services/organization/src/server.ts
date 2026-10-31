import { FastifyPluginAsync } from 'fastify';
import { ConnectRouter } from '@connectrpc/connect';
import { OrganizationService } from '@ag/proto/gen/ts/organization/v1/organization_connect';
import { db, OrganizationRepository, publishOutboxEvent } from '@ag/database';
import { ConnectError, Code } from '@connectrpc/connect';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { createAuthInterceptor, authorize, Role } from '@ag/auth';
import { importSPKI, KeyLike } from 'jose';
import crypto, { randomUUID } from 'node:crypto';

let internalPublicKey: KeyLike | Uint8Array;

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  const orgRepo = new OrganizationRepository(db);

  // Wait for public key init
  const pubKeyStr = process.env.INTERNAL_PUBLIC_KEY;
  if (!pubKeyStr) throw new Error('INTERNAL_PUBLIC_KEY is missing');
  internalPublicKey = await importSPKI(pubKeyStr, 'ES256');

  const authInterceptor = createAuthInterceptor({
    verificationKey: internalPublicKey,
    audience: 'internal-services',
    requireDelegation: false,
  });

  fastify.register(fastifyConnectPlugin, {
    interceptors: [authInterceptor],
    routes: (router: ConnectRouter) => {
      router.rpc(
        OrganizationService,
        OrganizationService.methods.createOrganization,
        async (req: any, context: any) => {
          const { name, slug } = req;
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          try {
            return await db.transaction().execute(async (tx) => {
              const org = await tx
                .insertInto('organizations')
                .values({
                  id: randomUUID(),
                  name,
                  slug,
                  created_at: new Date(),
                  updated_at: new Date(),
                })
                .returningAll()
                .executeTakeFirstOrThrow();

              await tx
                .insertInto('organization_members')
                .values({
                  organization_id: org.id,
                  user_id: userId,
                  role: 'OWNER',
                  created_at: new Date(),
                })
                .execute();

              return {
                id: org.id,
                name: org.name,
                slug: org.slug,
                createdAt: {
                  seconds: BigInt(Math.floor(org.created_at.getTime() / 1000)),
                  nanos: 0,
                },
              };
            });
          } catch (error) {
            fastify.log.error(error);
            throw new ConnectError('Failed to create organization', Code.Internal);
          }
        }
      );

      router.rpc(
        OrganizationService,
        OrganizationService.methods.getOrganization,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          const role = await orgRepo.getMemberRole(req.id, userId);
          if (!role || !authorize({ id: userId, roles: [role as Role] }, 'organization:read')) {
            throw new ConnectError('Organization not found', Code.NotFound);
          }

          const org = await db
            .selectFrom('organizations')
            .selectAll()
            .where('id', '=', req.id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

          if (!org) {
            throw new ConnectError('Organization not found', Code.NotFound);
          }

          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            createdAt: { seconds: BigInt(Math.floor(org.created_at.getTime() / 1000)), nanos: 0 },
          };
        }
      );

      router.rpc(
        OrganizationService,
        OrganizationService.methods.listOrganizations,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          // listOrganizations only returns orgs where the user is a member, so it inherently passes organization:read
          const orgs = await db
            .selectFrom('organizations')
            .innerJoin(
              'organization_members',
              'organization_members.organization_id',
              'organizations.id'
            )
            .selectAll('organizations')
            .where('organization_members.user_id', '=', userId)
            .where('organizations.deleted_at', 'is', null)
            .execute();

          return {
            organizations: orgs.map((org) => ({
              id: org.id,
              name: org.name,
              slug: org.slug,
              createdAt: { seconds: BigInt(Math.floor(org.created_at.getTime() / 1000)), nanos: 0 },
            })),
          };
        }
      );

      // Stubs for remaining methods
      router.rpc(
        OrganizationService,
        OrganizationService.methods.updateOrganization,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          const role = await orgRepo.getMemberRole(req.id, userId);
          if (!role || !authorize({ id: userId, roles: [role as Role] }, 'organization:update')) {
            throw new ConnectError('Permission denied: organization:update', Code.PermissionDenied);
          }

          throw new ConnectError('Not implemented', Code.Unimplemented);
        }
      );

      router.rpc(
        OrganizationService,
        OrganizationService.methods.listMembers,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          const organizationId = req.organizationId;
          if (!organizationId) {
            throw new ConnectError('Organization ID required', Code.InvalidArgument);
          }

          const role = await orgRepo.getMemberRole(organizationId, userId);
          if (!role || !authorize({ id: userId, roles: [role as Role] }, 'organization:read')) {
            throw new ConnectError('Organization not found', Code.NotFound);
          }

          const org = await db
            .selectFrom('organizations')
            .select(['id'])
            .where('id', '=', organizationId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

          if (!org) {
            throw new ConnectError('Organization not found', Code.NotFound);
          }

          const members = await db
            .selectFrom('organization_members')
            .innerJoin('users', 'users.id', 'organization_members.user_id')
            .where('organization_members.organization_id', '=', organizationId)
            .where('users.deleted_at', 'is', null)
            .select([
              'organization_members.user_id as userId',
              'organization_members.role as role',
              'users.email as email',
              'users.display_name as displayName',
            ])
            .orderBy('organization_members.created_at', 'asc')
            .execute();

          return {
            members: members.map((m) => ({
              userId: m.userId,
              role: m.role,
              email: m.email,
              displayName: m.displayName || '',
            })),
          };
        }
      );

      router.rpc(
        OrganizationService,
        OrganizationService.methods.inviteMember,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          const organizationId = req.organizationId;
          const rawEmail = req.email;
          const requestedRole = req.role;

          if (!organizationId) {
            throw new ConnectError('Organization ID required', Code.InvalidArgument);
          }
          if (!rawEmail || typeof rawEmail !== 'string') {
            throw new ConnectError('Valid email required', Code.InvalidArgument);
          }
          const email = rawEmail.trim().toLowerCase();
          if (!email.includes('@') || !email.includes('.')) {
            throw new ConnectError('Valid email required', Code.InvalidArgument);
          }

          const validRoles: Role[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
          if (!requestedRole || !validRoles.includes(requestedRole as Role)) {
            throw new ConnectError('Invalid role', Code.InvalidArgument);
          }

          const callerRole = await orgRepo.getMemberRole(organizationId, userId);
          if (!callerRole) {
            throw new ConnectError('Organization not found', Code.NotFound);
          }

          if (!authorize({ id: userId, roles: [callerRole as Role] }, 'member:invite')) {
            throw new ConnectError('Permission denied: member:invite', Code.PermissionDenied);
          }

          if (requestedRole === 'OWNER' && callerRole !== 'OWNER') {
            throw new ConnectError('Only an OWNER can invite members with the OWNER role', Code.PermissionDenied);
          }

          const org = await db
            .selectFrom('organizations')
            .select(['id'])
            .where('id', '=', organizationId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

          if (!org) {
            throw new ConnectError('Organization not found', Code.NotFound);
          }

          const existingMember = await db
            .selectFrom('organization_members')
            .innerJoin('users', 'users.id', 'organization_members.user_id')
            .where('organization_members.organization_id', '=', organizationId)
            .where('users.email', '=', email)
            .where('users.deleted_at', 'is', null)
            .select(['organization_members.user_id'])
            .executeTakeFirst();

          if (existingMember) {
            throw new ConnectError('User is already a member of this organization', Code.AlreadyExists);
          }

          const existingInvite = await db
            .selectFrom('organization_invitations')
            .where('organization_id', '=', organizationId)
            .where('email', '=', email)
            .where('status', '=', 'PENDING')
            .where('expires_at', '>', new Date())
            .select(['id'])
            .executeTakeFirst();

          if (existingInvite) {
            throw new ConnectError('An active invitation for this email already exists', Code.AlreadyExists);
          }

          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          const invitationId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          await db.transaction().execute(async (tx) => {
            await tx
              .insertInto('organization_invitations')
              .values({
                id: invitationId,
                organization_id: organizationId,
                email,
                role: requestedRole,
                token: tokenHash,
                status: 'PENDING',
                expires_at: expiresAt,
                created_at: new Date(),
                created_by: userId,
              })
              .execute();

            await publishOutboxEvent(
              tx,
              'Organization',
              organizationId,
              'organization.member.invited',
              {
                invitationId,
                organizationId,
                email,
                role: requestedRole,
                token: rawToken,
                expiresAt: expiresAt.toISOString(),
                invitedBy: userId,
              }
            );
          });

          return {};
        }
      );

      router.rpc(
        OrganizationService,
        OrganizationService.methods.acceptInvitation,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          const rawToken = req.token;
          if (!rawToken || typeof rawToken !== 'string') {
            throw new ConnectError('Invitation token required', Code.InvalidArgument);
          }

          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

          return await db.transaction().execute(async (tx) => {
            const invite = await tx
              .selectFrom('organization_invitations')
              .selectAll()
              .where('token', '=', tokenHash)
              .forUpdate()
              .executeTakeFirst();

            if (!invite) {
              throw new ConnectError('Invitation not found', Code.NotFound);
            }

            if (invite.status !== 'PENDING') {
              throw new ConnectError('Invitation has already been accepted or revoked', Code.FailedPrecondition);
            }

            if (new Date() >= new Date(invite.expires_at)) {
              throw new ConnectError('Invitation has expired', Code.FailedPrecondition);
            }

            const user = await tx
              .selectFrom('users')
              .selectAll()
              .where('id', '=', userId)
              .where('deleted_at', 'is', null)
              .executeTakeFirst();

            if (!user) {
              throw new ConnectError('User not found', Code.NotFound);
            }

            if (user.status === 'DISABLED') {
              throw new ConnectError('Account is disabled', Code.PermissionDenied);
            }

            if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
              throw new ConnectError('This invitation was issued for a different email address', Code.PermissionDenied);
            }

            const existingMember = await tx
              .selectFrom('organization_members')
              .where('organization_id', '=', invite.organization_id)
              .where('user_id', '=', userId)
              .select(['role'])
              .executeTakeFirst();

            if (existingMember) {
              await tx
                .updateTable('organization_invitations')
                .set({ status: 'ACCEPTED' })
                .where('id', '=', invite.id)
                .execute();
              throw new ConnectError('User is already a member of this organization', Code.AlreadyExists);
            }

            await tx
              .updateTable('organization_invitations')
              .set({ status: 'ACCEPTED' })
              .where('id', '=', invite.id)
              .execute();

            await tx
              .insertInto('organization_members')
              .values({
                organization_id: invite.organization_id,
                user_id: userId,
                role: invite.role,
                created_at: new Date(),
              })
              .execute();

            await publishOutboxEvent(
              tx,
              'Organization',
              invite.organization_id,
              'organization.member.joined',
              {
                invitationId: invite.id,
                organizationId: invite.organization_id,
                userId,
                role: invite.role,
              }
            );

            return {};
          });
        }
      );

      router.rpc(
        OrganizationService,
        OrganizationService.methods.removeMember,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          const organizationId = req.organizationId;
          const targetUserId = req.userId;

          if (!organizationId || !targetUserId) {
            throw new ConnectError('Organization ID and User ID required', Code.InvalidArgument);
          }

          const callerRole = await orgRepo.getMemberRole(organizationId, userId);
          if (!callerRole) {
            throw new ConnectError('Organization not found', Code.NotFound);
          }

          const isSelfRemoval = userId === targetUserId;

          if (!isSelfRemoval && !authorize({ id: userId, roles: [callerRole as Role] }, 'member:remove')) {
            throw new ConnectError('Permission denied: member:remove', Code.PermissionDenied);
          }

          return await db.transaction().execute(async (tx) => {
            const org = await tx
              .selectFrom('organizations')
              .select(['id'])
              .where('id', '=', organizationId)
              .where('deleted_at', 'is', null)
              .forUpdate()
              .executeTakeFirst();

            if (!org) {
              throw new ConnectError('Organization not found', Code.NotFound);
            }

            const targetMember = await tx
              .selectFrom('organization_members')
              .select(['role'])
              .where('organization_id', '=', organizationId)
              .where('user_id', '=', targetUserId)
              .executeTakeFirst();

            if (!targetMember) {
              throw new ConnectError('Member not found in organization', Code.NotFound);
            }

            if (targetMember.role === 'OWNER' && callerRole !== 'OWNER') {
              throw new ConnectError('ADMIN cannot remove an OWNER', Code.PermissionDenied);
            }

            if (targetMember.role === 'OWNER') {
              const owners = await tx
                .selectFrom('organization_members')
                .select(['user_id'])
                .where('organization_id', '=', organizationId)
                .where('role', '=', 'OWNER')
                .execute();

              if (owners.length <= 1) {
                throw new ConnectError('Cannot remove the last OWNER of an organization', Code.FailedPrecondition);
              }
            }

            await tx
              .deleteFrom('organization_members')
              .where('organization_id', '=', organizationId)
              .where('user_id', '=', targetUserId)
              .execute();

            await publishOutboxEvent(
              tx,
              'Organization',
              organizationId,
              'organization.member.removed',
              {
                organizationId,
                targetUserId,
                removedBy: userId,
                targetRole: targetMember.role,
              }
            );

            return {};
          });
        }
      );
    },
  });
};
