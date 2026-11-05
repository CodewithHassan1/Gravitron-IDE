import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN', 'OWNER']),
});

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['PENDING', 'ACTIVE', 'ERROR']),
});

export type UserDTO = z.infer<typeof UserSchema>;
export type WorkspaceDTO = z.infer<typeof WorkspaceSchema>;
export * from './auth';
