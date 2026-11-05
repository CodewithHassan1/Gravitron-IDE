import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceManagerImpl } from '../WorkspaceManager';

describe('WorkspaceManager - getNativeAbsolutePath', () => {
  let workspaceManager: WorkspaceManagerImpl;

  beforeEach(() => {
    // Create a mock or partial instance if needed, or just instantiate it if it has no strict constructor deps
    // Assuming WorkspaceManager is a singleton or can be instantiated normally.
    workspaceManager = new WorkspaceManagerImpl();
  });

  it('normalizes Windows path representations correctly', () => {
    const expected = 'D:\\Techmire Solutions\\05_OJT\\02_OJT_02\\Project_08(Tawakkal)';

    const representations = [
      'D:\\Techmire Solutions\\05_OJT\\02_OJT_02\\Project_08(Tawakkal)',
      'D:/Techmire Solutions/05_OJT/02_OJT_02/Project_08(Tawakkal)',
      '/D:\\Techmire Solutions\\05_OJT\\02_OJT_02\\Project_08(Tawakkal)',
      '/D:/Techmire Solutions/05_OJT/02_OJT_02/Project_08(Tawakkal)',
      'file:///D:/Techmire Solutions/05_OJT/02_OJT_02/Project_08(Tawakkal)',
      'file:///D:\\Techmire Solutions\\05_OJT\\02_OJT_02\\Project_08(Tawakkal)',
      'file://localhost/D:\\Techmire Solutions\\05_OJT\\02_OJT_02\\Project_08(Tawakkal)',
    ];

    for (const uri of representations) {
      const result = workspaceManager.getNativeAbsolutePath(uri);
      expect(result).toBe(expected);
    }
  });

  it('preserves POSIX paths correctly', () => {
    const expected = '/home/user/project';
    const representations = [
      '/home/user/project',
      'file:///home/user/project',
      'file://localhost/home/user/project',
    ];

    for (const uri of representations) {
      const result = workspaceManager.getNativeAbsolutePath(uri);
      expect(result).toBe(expected);
    }
  });
});
