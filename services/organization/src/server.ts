import { FastifyPluginAsync } from 'fastify';
import { ConnectRouter } from '@connectrpc/connect';
import { OrganizationService } from '@ag/proto/gen/ts/organization/v1/organization_connect';
import { db, OrganizationRepository } from '@ag/database';
import { ConnectError, Code } from '@connectrpc/connect';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { createAuthInterceptor, authorize, Role } from '@ag/auth';
import { importSPKI, KeyLike } from 'jose';

let internalPublicKey: KeyLike | Uint8Array;

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  const orgRepo = new OrganizationRepository(db);

  // Wait for public key init
  const pubKeyStr = process.env.INTERNAL_PUBLIC_KEY;
  if (!pubKeyStr) throw new Error("INTERNAL_PUBLIC_KEY is missing");
  internalPublicKey = await importSPKI(pubKeyStr, 'ES256');

  const authInterceptor = createAuthInterceptor({
    verificationKey: internalPublicKey,
    audience: 'internal-services',
    requireDelegation: false
  });

  fastify.register(fastifyConnectPlugin, {
    interceptors: [authInterceptor],
    routes: (router: ConnectRouter) => {
      
      router.rpc(OrganizationService, OrganizationService.methods.createOrganization, async (req: any, context: any) => {
        const { name, slug } = req;
        const userId = context.requestHeader.get('x-trusted-user-id');
        if (!userId) throw new ConnectError("Unauthenticated", Code.Unauthenticated);
        
        try {
          return await db.transaction().execute(async (tx) => {
            const org = await tx.insertInto('organizations')
              .values({ 
                id: require('crypto').randomUUID(),
                name, 
                slug,
                created_at: new Date(),
                updated_at: new Date()
              })
              .returningAll()
              .executeTakeFirstOrThrow();
              
            await tx.insertInto('organization_members')
              .values({
                organization_id: org.id,
                user_id: userId,
                role: 'OWNER',
                created_at: new Date()
              })
              .execute();

            return {
              id: org.id,
              name: org.name,
              slug: org.slug,
              createdAt: { seconds: BigInt(Math.floor(org.created_at.getTime() / 1000)), nanos: 0 }
            };
          });
        } catch (error) {
          fastify.log.error(error);
          throw new ConnectError("Failed to create organization", Code.Internal);
        }
      });

      router.rpc(OrganizationService, OrganizationService.methods.getOrganization, async (req: any, context: any) => {
        const userId = context.requestHeader.get('x-trusted-user-id');
        if (!userId) throw new ConnectError("Unauthenticated", Code.Unauthenticated);

        const role = await orgRepo.getMemberRole(req.id, userId);
        if (!role || !authorize({ id: userId, roles: [role as Role] }, 'organization:read')) {
          throw new ConnectError("Organization not found", Code.NotFound);
        }

        const org = await db.selectFrom('organizations')
          .selectAll()
          .where('id', '=', req.id)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
          
        if (!org) {
          throw new ConnectError("Organization not found", Code.NotFound);
        }
        
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          createdAt: { seconds: BigInt(Math.floor(org.created_at.getTime() / 1000)), nanos: 0 }
        };
      });

      router.rpc(OrganizationService, OrganizationService.methods.listOrganizations, async (req: any, context: any) => {
        const userId = context.requestHeader.get('x-trusted-user-id');
        if (!userId) throw new ConnectError("Unauthenticated", Code.Unauthenticated);

        // listOrganizations only returns orgs where the user is a member, so it inherently passes organization:read
        const orgs = await db.selectFrom('organizations')
          .innerJoin('organization_members', 'organization_members.organization_id', 'organizations.id')
          .selectAll('organizations')
          .where('organization_members.user_id', '=', userId)
          .where('organizations.deleted_at', 'is', null)
          .execute();
          
        return {
          organizations: orgs.map(org => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            createdAt: { seconds: BigInt(Math.floor(org.created_at.getTime() / 1000)), nanos: 0 }
          }))
        };
      });

      // Stubs for remaining methods
      router.rpc(OrganizationService, OrganizationService.methods.updateOrganization, async (req: any, context: any) => {
        const userId = context.requestHeader.get('x-trusted-user-id');
        if (!userId) throw new ConnectError("Unauthenticated", Code.Unauthenticated);

        const role = await orgRepo.getMemberRole(req.id, userId);
        if (!role || !authorize({ id: userId, roles: [role as Role] }, 'organization:update')) {
          throw new ConnectError("Permission denied: organization:update", Code.PermissionDenied);
        }

        throw new ConnectError("Not implemented", Code.Unimplemented);
      });
      
      router.rpc(OrganizationService, OrganizationService.methods.listMembers, async (req: any, context: any) => {
        const userId = context.requestHeader.get('x-trusted-user-id');
        if (!userId) throw new ConnectError("Unauthenticated", Code.Unauthenticated);

        const role = await orgRepo.getMemberRole(req.organizationId, userId);
        if (!role || !authorize({ id: userId, roles: [role as Role] }, 'organization:read')) {
          throw new ConnectError("Organization not found", Code.NotFound);
        }

        throw new ConnectError("Not implemented", Code.Unimplemented);
      });
      
      router.rpc(OrganizationService, OrganizationService.methods.inviteMember, async (req: any, context: any) => {
        const userId = context.requestHeader.get('x-trusted-user-id');
        if (!userId) throw new ConnectError("Unauthenticated", Code.Unauthenticated);

        const role = await orgRepo.getMemberRole(req.organizationId, userId);
        if (!role || !authorize({ id: userId, roles: [role as Role] }, 'member:invite')) {
          throw new ConnectError("Permission denied: member:invite", Code.PermissionDenied);
        }

        throw new ConnectError("Not implemented", Code.Unimplemented);
      });
      
      router.rpc(OrganizationService, OrganizationService.methods.acceptInvitation, async (req: any, context: any) => {
        throw new ConnectError("Not implemented", Code.Unimplemented);
      });
      
      router.rpc(OrganizationService, OrganizationService.methods.removeMember, async (req: any, context: any) => {
        const userId = context.requestHeader.get('x-trusted-user-id');
        if (!userId) throw new ConnectError("Unauthenticated", Code.Unauthenticated);

        const role = await orgRepo.getMemberRole(req.organizationId, userId);
        if (!role || !authorize({ id: userId, roles: [role as Role] }, 'member:remove')) {
          throw new ConnectError("Permission denied: member:remove", Code.PermissionDenied);
        }

        // Must also verify they are not removing the last OWNER or themselves if they are the last OWNER.
        // And ADMIN cannot remove OWNER. 
        // We evaluate this at Layer 2 but would need to check target's role.
        
        throw new ConnectError("Not implemented", Code.Unimplemented);
      });

    }
  });
};
