export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type Permission = 
  | 'organization:read'
  | 'organization:update'
  | 'organization:delete'
  | 'member:invite'
  | 'member:remove'
  | 'member:update_role'
  | 'workspace:create'
  | 'workspace:read'
  | 'workspace:update'
  | 'workspace:delete'
  | 'agent:execute'
  | 'billing:manage'
  | 'apikey:create';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [
    'organization:read', 'organization:update', 'organization:delete',
    'member:invite', 'member:remove', 'member:update_role',
    'workspace:create', 'workspace:read', 'workspace:update', 'workspace:delete',
    'agent:execute', 'billing:manage', 'apikey:create'
  ],
  ADMIN: [
    'organization:read', 'organization:update',
    'member:invite', 'member:remove', 'member:update_role',
    'workspace:create', 'workspace:read', 'workspace:update', 'workspace:delete',
    'agent:execute', 'apikey:create'
  ],
  MEMBER: [
    'organization:read',
    'workspace:create', 'workspace:read', 'workspace:update', 'workspace:delete',
    'agent:execute'
  ],
  VIEWER: [
    'organization:read',
    'workspace:read'
  ]
};

export interface UserContext {
  id: string;
  roles: Role[];
}

/**
 * Shared authorization resolution function.
 * Evaluates if a user's assigned roles implicitly grant the requested permission.
 */
export function authorize(user: UserContext, action: Permission, resourceId?: string): boolean {
  for (const role of user.roles) {
    const permissions = ROLE_PERMISSIONS[role];
    if (permissions && permissions.includes(action)) {
      // Note: In an ABAC context, resourceId would be evaluated here dynamically.
      // For this static RBAC map, possessing the permission grants access.
      return true;
    }
  }
  return false;
}
