import { Kysely } from 'kysely';
import { Database } from '../index';

export class OrganizationRepository {
  constructor(private db: Kysely<Database>) {}

  async getMemberRole(organizationId: string, userId: string): Promise<string | null> {
    const member = await this.db
      .selectFrom('organization_members')
      .select('role')
      .where('organization_id', '=', organizationId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return member?.role || null;
  }
}
