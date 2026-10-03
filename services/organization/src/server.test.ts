import { describe, it, expect, vi } from 'vitest';
import { authorize } from '@ag/auth';

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
