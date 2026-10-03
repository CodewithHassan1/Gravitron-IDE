export class BrowserFSAdapter {
  private rootHandle: FileSystemDirectoryHandle;

  constructor(handle: any) {
    this.rootHandle = handle;
  }

  // To support isomorphic-git, we need to map paths to DirectoryHandles/FileHandles
  private async resolveHandle(path: string, create: boolean = false, type: 'file' | 'directory' = 'file'): Promise<any> {
    const parts = path.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
    let current: FileSystemDirectoryHandle = this.rootHandle;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      try {
        if (isLast && type === 'file') {
          return await current.getFileHandle(part, { create });
        } else {
          current = await current.getDirectoryHandle(part, { create });
        }
      } catch (err) {
        throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
      }
    }
    return current;
  }

  get promises() {
    const self = this;
    return {
      async readFile(path: string, encoding?: string) {
        const handle = await self.resolveHandle(path, false, 'file');
        const file = await handle.getFile();
        if (encoding === 'utf8') {
          return await file.text();
        }
        return new Uint8Array(await file.arrayBuffer());
      },
      async writeFile(path: string, data: Uint8Array | string) {
        const handle = await self.resolveHandle(path, true, 'file');
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
      },
      async unlink(path: string) {
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        const name = path.substring(path.lastIndexOf('/') + 1);
        const parent = await self.resolveHandle(parentPath, false, 'directory');
        await parent.removeEntry(name);
      },
      async readdir(path: string) {
        const handle = await self.resolveHandle(path, false, 'directory');
        const entries = [];
        // @ts-ignore
        for await (const entry of handle.values()) {
          entries.push(entry.name);
        }
        return entries;
      },
      async mkdir(path: string) {
        await self.resolveHandle(path, true, 'directory');
      },
      async rmdir(path: string) {
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        const name = path.substring(path.lastIndexOf('/') + 1);
        const parent = await self.resolveHandle(parentPath, false, 'directory');
        await parent.removeEntry(name, { recursive: true });
      },
      async stat(path: string) {
        const handle = await self.resolveHandle(path, false, 'file').catch(() => self.resolveHandle(path, false, 'directory'));
        if (handle.kind === 'file') {
          const file = await handle.getFile();
          return {
            type: 'file',
            mode: 0o100644,
            size: file.size,
            ino: 0,
            mtimeMs: file.lastModified,
            ctimeMs: file.lastModified,
            isFile: () => true,
            isDirectory: () => false,
            isSymbolicLink: () => false,
          };
        } else {
          return {
            type: 'dir',
            mode: 0o040755,
            size: 0,
            ino: 0,
            mtimeMs: Date.now(),
            ctimeMs: Date.now(),
            isFile: () => false,
            isDirectory: () => true,
            isSymbolicLink: () => false,
          };
        }
      },
      async lstat(path: string) {
        return this.stat(path);
      },
      async readlink(path: string) {
        throw new Error('readlink not implemented');
      },
      async symlink(target: string, path: string) {
        throw new Error('symlink not implemented');
      }
    };
  }
}
