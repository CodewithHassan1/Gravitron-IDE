// Setup file to ensure global mock is installed before other imports are resolved.
const mockDbStore = new Map<string, any>();
const mockIdb = {
  open: () => ({}),
  openDB: async () => ({
    get: async (storeName: string, key: string) => mockDbStore.get(`${storeName}:${key}`),
    put: async (storeName: string, val: any, key: string) => {
      const actualKey = key || val.workspaceId || val.id;
      mockDbStore.set(`${storeName}:${actualKey}`, val);
    },
    delete: async (storeName: string, key: string) => mockDbStore.delete(`${storeName}:${key}`),
  }),
};

(global as any).indexedDB = mockIdb;
(globalThis as any).indexedDB = mockIdb;
export { mockIdb };
