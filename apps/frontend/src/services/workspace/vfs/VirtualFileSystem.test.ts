import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFileSystem } from './VirtualFileSystem';

describe('VirtualFileSystem', () => {
  let vfs: VirtualFileSystem;

  beforeEach(() => {
    vfs = new VirtualFileSystem();
  });

  describe('Initialization', () => {
    it('should initialize a directory root node', () => {
      const root = vfs.initializeRoot('workspace', 'directory');
      expect(root.id).toBeDefined();
      expect(root.name).toBe('workspace');
      expect(root.type).toBe('directory');
      expect(root.parentId).toBeNull();
      
      const foundRoot = vfs.find(root.id);
      expect(foundRoot).toBeDefined();
      expect(foundRoot?.name).toBe('workspace');
    });

    it('should resolve the root path correctly', () => {
      const root = vfs.initializeRoot();
      const resolvedId = vfs.resolve('/');
      expect(resolvedId).toBe(root.id);
    });
  });

  describe('File and Folder Creation', () => {
    beforeEach(() => {
      vfs.initializeRoot();
    });

    it('should create a file in the root', () => {
      const file = vfs.createFile('/test.txt');
      expect(file.name).toBe('test.txt');
      expect(file.type).toBe('file');
      
      const resolvedId = vfs.resolve('/test.txt');
      expect(resolvedId).toBe(file.id);
    });

    it('should create a folder in the root', () => {
      const folder = vfs.createFolder('/src');
      expect(folder.name).toBe('src');
      expect(folder.type).toBe('directory');

      const resolvedId = vfs.resolve('/src');
      expect(resolvedId).toBe(folder.id);
    });

    it('should support nested file creation', () => {
      vfs.createFolder('/src');
      const file = vfs.createFile('/src/index.ts');
      
      expect(file.name).toBe('index.ts');
      const resolvedId = vfs.resolve('/src/index.ts');
      expect(resolvedId).toBe(file.id);
    });

    it('should fail if parent directory does not exist', () => {
      expect(() => {
        vfs.createFile('/missing/file.txt');
      }).toThrow(/does not exist/);
    });

    it('should fail if file already exists (uniqueness constraint)', () => {
      vfs.createFile('/test.txt');
      expect(() => {
        vfs.createFile('/test.txt');
      }).toThrow(/already exists/);
    });
  });

  describe('Node Operations', () => {
    beforeEach(() => {
      vfs.initializeRoot();
      vfs.createFolder('/src');
      vfs.createFile('/src/index.ts');
      vfs.createFile('/readme.md');
    });

    it('should rename a file successfully', () => {
      vfs.rename('/src/index.ts', 'main.ts');
      expect(vfs.resolve('/src/index.ts')).toBeNull();
      expect(vfs.resolve('/src/main.ts')).toBeDefined();
    });

    it('should fail to rename to an existing sibling (conflict)', () => {
      vfs.createFile('/src/utils.ts');
      expect(() => {
        vfs.rename('/src/utils.ts', 'index.ts');
      }).toThrow(/already exists/);
    });

    it('should move a file to another directory', () => {
      vfs.createFolder('/lib');
      vfs.move('/src/index.ts', '/lib');
      
      expect(vfs.resolve('/src/index.ts')).toBeNull();
      expect(vfs.resolve('/lib/index.ts')).toBeDefined();
    });

    it('should delete a file', () => {
      vfs.delete('/readme.md');
      expect(vfs.resolve('/readme.md')).toBeNull();
    });

    it('should cascade delete a directory and its children', () => {
      vfs.delete('/src');
      expect(vfs.resolve('/src')).toBeNull();
      expect(vfs.resolve('/src/index.ts')).toBeNull();
    });

    it('should fail to delete root', () => {
      expect(() => {
        vfs.delete('/');
      }).toThrow(/Cannot delete the workspace root/);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      vfs.initializeRoot();
    });

    it('should handle trailing slashes during resolution', () => {
      vfs.createFolder('/src');
      const id1 = vfs.resolve('/src');
      const id2 = vfs.resolve('/src/');
      expect(id1).toBe(id2);
      expect(id1).not.toBeNull();
    });
    
    it('should handle empty directory creation gracefully', () => {
      const folder = vfs.createFolder('/empty');
      expect(folder.children).toBeDefined();
      expect(folder.children?.length).toBe(0);
    });
  });
});
