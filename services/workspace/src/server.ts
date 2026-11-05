import { FastifyPluginAsync } from 'fastify';
import { ConnectRouter } from '@connectrpc/connect';
import { WorkspaceService } from '@ag/proto/gen/ts/workspace/v1/workspace_connect';
import {
  WorkspaceStatus,
  GitProvider,
  WorkspaceVisibility,
} from '@ag/proto/gen/ts/workspace/v1/workspace_pb';
import { db, WorkspaceRepository, OrganizationRepository } from '@ag/database';
import { ConnectError, Code } from '@connectrpc/connect';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { createAuthInterceptor, authorize, Role } from '@ag/auth';
import { importSPKI, KeyLike } from 'jose';

let internalPublicKey: KeyLike | Uint8Array;

export const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  const repo = new WorkspaceRepository(db);
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
        WorkspaceService,
        WorkspaceService.methods.createWorkspace,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          // Layer 2 RBAC Enforcement
          const role = await orgRepo.getMemberRole(req.organizationId, userId);
          if (!role || !authorize({ id: userId, roles: [role as Role] }, 'workspace:create')) {
            throw new ConnectError('Permission denied: workspace:create', Code.PermissionDenied);
          }

          try {
            const workspace = await repo.createWorkspace({
              organization_id: req.organizationId,
              name: req.name,
              git_uri: req.gitUri,
              default_branch: req.defaultBranch || 'main',
              provider: req.provider.toString(),
              is_private: req.isPrivate,
              visibility: req.visibility.toString(),
              status: WorkspaceStatus.PROVISIONING.toString(),
              created_by: userId,
            });

            return {
              workspace: {
                ...workspace,
                status: WorkspaceStatus.PROVISIONING,
                provider: req.provider,
                visibility: req.visibility,
                createdAt: {
                  seconds: BigInt(Math.floor(workspace.created_at.getTime() / 1000)),
                  nanos: 0,
                },
                updatedAt: {
                  seconds: BigInt(Math.floor(workspace.updated_at.getTime() / 1000)),
                  nanos: 0,
                },
                lastActivityAt: {
                  seconds: BigInt(Math.floor(workspace.last_activity_at.getTime() / 1000)),
                  nanos: 0,
                },
              },
            };
          } catch (error) {
            fastify.log.error(error);
            throw new ConnectError('Failed to create workspace', Code.Internal);
          }
        }
      );

      router.rpc(
        WorkspaceService,
        WorkspaceService.methods.getWorkspace,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          const workspace = await repo.getWorkspace(req.id);
          if (!workspace) {
            throw new ConnectError('Workspace not found', Code.NotFound);
          }

          // Layer 2 RBAC Enforcement
          const role = await orgRepo.getMemberRole(workspace.organization_id, userId);
          if (!role || !authorize({ id: userId, roles: [role as Role] }, 'workspace:read')) {
            throw new ConnectError('Workspace not found', Code.NotFound); // Use NotFound for resource probing protection
          }

          return {
            workspace: {
              ...workspace,
              status: WorkspaceStatus[workspace.status as keyof typeof WorkspaceStatus],
              provider: GitProvider[workspace.provider as keyof typeof GitProvider],
              visibility:
                WorkspaceVisibility[workspace.visibility as keyof typeof WorkspaceVisibility],
              createdAt: {
                seconds: BigInt(Math.floor(workspace.created_at.getTime() / 1000)),
                nanos: 0,
              },
              updatedAt: {
                seconds: BigInt(Math.floor(workspace.updated_at.getTime() / 1000)),
                nanos: 0,
              },
              lastActivityAt: {
                seconds: BigInt(Math.floor(workspace.last_activity_at.getTime() / 1000)),
                nanos: 0,
              },
            },
          };
        }
      );

      router.rpc(
        WorkspaceService,
        WorkspaceService.methods.listWorkspaces,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          // Layer 2 RBAC Enforcement
          const role = await orgRepo.getMemberRole(req.organizationId, userId);
          if (!role || !authorize({ id: userId, roles: [role as Role] }, 'workspace:read')) {
            throw new ConnectError('Permission denied: workspace:read', Code.PermissionDenied);
          }

          const workspaces = await repo.listWorkspaces(
            req.organizationId,
            userId,
            req.pageSize || 50,
            0
          );
          return {
            workspaces: workspaces.map((workspace) => ({
              ...workspace,
              status: WorkspaceStatus[workspace.status as keyof typeof WorkspaceStatus],
              provider: GitProvider[workspace.provider as keyof typeof GitProvider],
              visibility:
                WorkspaceVisibility[workspace.visibility as keyof typeof WorkspaceVisibility],
              createdAt: {
                seconds: BigInt(Math.floor(workspace.created_at.getTime() / 1000)),
                nanos: 0,
              },
              updatedAt: {
                seconds: BigInt(Math.floor(workspace.updated_at.getTime() / 1000)),
                nanos: 0,
              },
              lastActivityAt: {
                seconds: BigInt(Math.floor(workspace.last_activity_at.getTime() / 1000)),
                nanos: 0,
              },
            })),
            nextPageToken: '',
          };
        }
      );

      router.rpc(
        WorkspaceService,
        WorkspaceService.methods.deleteWorkspace,
        async (req: any, context: any) => {
          const userId = context.requestHeader.get('x-trusted-user-id');
          if (!userId) throw new ConnectError('Unauthenticated', Code.Unauthenticated);

          const workspace = await repo.getWorkspace(req.id);
          if (!workspace) throw new ConnectError('Workspace not found', Code.NotFound);

          // Layer 2 RBAC Enforcement
          const role = await orgRepo.getMemberRole(workspace.organization_id, userId);
          if (!role || !authorize({ id: userId, roles: [role as Role] }, 'workspace:delete')) {
            throw new ConnectError('Permission denied: workspace:delete', Code.PermissionDenied);
          }

          const deleted = await repo.deleteWorkspace(req.id, userId);
          if (!deleted) {
            throw new ConnectError('Workspace not found', Code.NotFound);
          }
          return {};
        }
      );
    },
  });
};
