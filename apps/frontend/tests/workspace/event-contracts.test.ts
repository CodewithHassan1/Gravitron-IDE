import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../src/services/workspace/types';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Event Contracts', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      { id: 'ws-events', name: 'Test', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
      { nativeHandle: {} as any }
    );
  });

  it('mutations emit strongly typed, immutable file events synchronously', async () => {
    const events: any[] = [];
    
    WorkspaceEvents.on('fileEvent', (event) => {
      events.push(event.payload);
    });

    // 1. Create Folder
    await manager.createFolder('/src');
    
    expect(events.length).toBe(1);
    const folderEvent = events[0];
    expect(folderEvent.type).toBe('created');
    expect(folderEvent.node).toBeDefined();
    expect(folderEvent.node.name).toBe('src');
    expect(folderEvent.node.type).toBe('directory');
    
    // Check immutability
    expect(() => { folderEvent.node.name = 'mutated'; }).toThrow();

    // 2. Create File
    await manager.createFile('/src/index.ts');
    
    expect(events.length).toBe(2);
    const fileEvent = events[1];
    expect(fileEvent.type).toBe('created');
    expect(fileEvent.node.name).toBe('index.ts');
    
    // Check immutability
    expect(() => { fileEvent.node.name = 'mutated'; }).toThrow();
    
    const fileId = fileEvent.node.id;

    // 3. Rename File
    await manager.rename('/src/index.ts', 'main.ts');
    
    expect(events.length).toBe(3);
    const renameEvent = events[2];
    expect(renameEvent.type).toBe('renamed');
    expect(renameEvent.id).toBe(fileId);
    expect(renameEvent.newName).toBe('main.ts');
    expect(renameEvent.newPath).toBe('/src/main.ts');

    // 4. Move File
    await manager.createFolder('/lib');
    const libFolderId = events[3].node.id; // It fired created event
    
    await manager.move('/src/main.ts', '/lib');
    
    expect(events.length).toBe(5);
    const moveEvent = events[4];
    expect(moveEvent.type).toBe('moved');
    expect(moveEvent.id).toBe(fileId);
    expect(moveEvent.newParentId).toBe(libFolderId);

    // 5. Delete File
    await manager.delete('/lib/main.ts');
    
    expect(events.length).toBe(6);
    const deleteEvent = events[5];
    expect(deleteEvent.type).toBe('deleted');
    expect(deleteEvent.id).toBe(fileId);
  });
});
