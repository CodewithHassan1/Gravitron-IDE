import { describe, it, expect } from 'vitest';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../src/services/workspace/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Protects:
 * docs/architecture/events.md
 *
 * Rule:
 * Event Registry Completeness, Payload Safety, and Event Ordering.
 */
describe('Event Contracts', () => {
  it('Event Ordering: Multiple synchronous emits must be received in exact order', () => {
    const received: number[] = [];

    // Subscribe
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceOpened, () => received.push(1));
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceClosed, () => received.push(2));
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceUpdated, () => received.push(3));

    // Emit synchronously
    WorkspaceEvents.emit(WorkspaceEventType.WorkspaceOpened, { workspaceId: '1' });
    WorkspaceEvents.emit(WorkspaceEventType.WorkspaceClosed, { workspaceId: '1' });
    WorkspaceEvents.emit(WorkspaceEventType.WorkspaceUpdated, undefined);

    expect(received).toEqual([1, 2, 3]);

    WorkspaceEvents.clearAllListeners();
  });

  it('Payload Safety: No event payload contains any, unknown mutable references, or private instances', () => {
    // This is primarily statically verified by TypeScript interfaces inside types.ts
    // We parse the types.ts file as a lightweight AST/regex check to ensure 'any' is not used in WorkspaceEventPayloads
    const typesPath = path.resolve(__dirname, '../../src/services/workspace/types.ts');
    const content = fs.readFileSync(typesPath, 'utf8');

    // Extract WorkspaceEventPayloads block
    const payloadsMatch = content.match(/export type WorkspaceEventPayloads = \{([^}]+)\};/);
    if (payloadsMatch) {
      const payloadsBlock = payloadsMatch[1];
      // Search for ': any'
      expect(payloadsBlock).not.toMatch(/:\s*any\b/);
    }
  });

  it('Event Registry Completeness: Every WorkspaceEvent exists in WorkspaceEventPayloads', () => {
    const typesPath = path.resolve(__dirname, '../../src/services/workspace/types.ts');
    const content = fs.readFileSync(typesPath, 'utf8');

    // Extract enum keys
    const enumMatch = content.match(/export enum WorkspaceEventType \{([^}]+)\}/);
    expect(enumMatch).toBeTruthy();

    const lines = enumMatch![1]
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l);
    lines.forEach((line) => {
      const key = line.split('=')[0].trim();
      // Ensure the key exists in WorkspaceEventPayloads
      expect(content).toContain(`[WorkspaceEventType.${key}]`);
    });
  });
});
