import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { validateConfig } from '@ag/config';

// Base DB Types mimicking our Flyway schemas
export interface Database {
  users: {
    id: string;
    email: string;
    password_hash: string | null;
    role: string;
    display_name: string | null;
    status: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  };
  organizations: {
    id: string;
    name: string;
    slug: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  };
  organization_members: {
    organization_id: string;
    user_id: string;
    role: string;
    created_at: Date;
  };
  organization_invitations: {
    id: string;
    organization_id: string;
    email: string;
    role: string;
    token: string;
    status: string;
    expires_at: Date;
    created_at: Date;
    created_by: string;
  };
  outbox_events: {
    event_id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    payload: any;
    created_at: Date;
  };
  workspaces: {
    id: string;
    organization_id: string;
    created_by: string;
    name: string;
    git_uri: string;
    default_branch: string;
    provider: string;
    is_private: boolean;
    visibility: string;
    status: string;
    last_activity_at: Date;
    created_at: Date;
    updated_at: Date;
  };
}

const config = validateConfig(process.env);

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: config.POSTGRES_URL,
      max: 10,
    }),
  }),
});

export * from './outbox';
export * from './repositories/workspace';
export * from './repositories/organization';
