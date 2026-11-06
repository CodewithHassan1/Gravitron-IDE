import { Kysely } from 'kysely';
import { Database } from '../index';
import { publishOutboxEvent } from '../outbox';
import { randomUUID } from 'crypto';

export class WorkspaceRepository {
  constructor(private db: Kysely<Database>) {}

  async createWorkspace(data: {
    organization_id: string;
    created_by: string;
    name: string;
    git_uri: string;
    default_branch: string;
    provider: string;
    is_private: boolean;
    visibility: string;
    status: string;
  }) {
    return await this.db.transaction().execute(async (tx) => {
      const id = randomUUID();
      const now = new Date();

      const workspace = await tx
        .insertInto('workspaces')
        .values({
          id,
          ...data,
          last_activity_at: now,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await publishOutboxEvent(tx, 'Workspace', id, 'workspace.created', workspace);

      return workspace;
    });
  }

  async getWorkspace(id: string) {
    return await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async listWorkspaces(organization_id: string, user_id: string, limit: number, offset: number) {
    return await this.db
      .selectFrom('workspaces')
      .selectAll('workspaces')
      .innerJoin(
        'organization_members',
        'organization_members.organization_id',
        'workspaces.organization_id'
      )
      .where('workspaces.organization_id', '=', organization_id)
      .where('organization_members.user_id', '=', user_id)
      .limit(limit)
      .offset(offset)
      .orderBy('workspaces.created_at', 'desc')
      .execute();
  }

  async deleteWorkspace(id: string, user_id: string) {
    return await this.db.transaction().execute(async (tx) => {
      // Find workspace and enforce membership simultaneously
      const workspace = await tx
        .deleteFrom('workspaces')
        .where('workspaces.id', '=', id)
        .where((eb) =>
          eb.exists(
            tx
              .selectFrom('organization_members')
              .select('organization_members.user_id')
              .whereRef(
                'organization_members.organization_id',
                '=',
                'workspaces.organization_id' as any
              )
              .where('organization_members.user_id', '=', user_id)
          )
        )
        .returningAll()
        .executeTakeFirst();

      if (workspace) {
        await publishOutboxEvent(tx, 'Workspace', id, 'workspace.deleted', { id });
      }
      return workspace;
    });
  }
}
