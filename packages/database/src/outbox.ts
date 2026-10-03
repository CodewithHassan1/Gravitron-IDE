import { Transaction } from 'kysely';
import { Database } from './index';
import crypto from 'crypto';

export async function publishOutboxEvent(
  tx: Transaction<Database>,
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const eventId = crypto.randomUUID(); // In production, ULID is preferred
  
  await tx.insertInto('outbox_events')
    .values({
      event_id: eventId,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      event_type: eventType,
      payload: JSON.stringify(payload),
      created_at: new Date()
    })
    .execute();
    
  return eventId;
}
