# Search Engine Architecture

The Workspace Search engine provides high-speed, indexed searching across the virtual file system.

## Responsibilities
- Maintain an up-to-date index of file paths, extensions, and types.
- Evaluate ignore patterns (`.gitignore`, `.antigravityignore`) rapidly.
- Provide fuzzy matching and scoring for file queries.
- Support both quick searches (for the File Picker) and potentially deep semantic search.

## Public APIs
The primary interface is `WorkspaceSearch` instantiated by the `WorkspaceManager`.

- **Initialization:** `buildIndex()` to perform initial workspace scanning.
- **Queries:** `search(query: SearchQuery): SearchResult[]` to perform fuzzy matching.
- **Updates:** `updateIndex(node)` and `removeFromIndex(nodeId)` for real-time reactions.

## Dependency Rules
- **VFS Driven:** The Search engine observes the `VirtualFileSystem` via events or direct queries to build its index. It does NOT hit the disk.
- **Performance:** Relies entirely on `WorkspaceSearchCache` and internal tries/hashmaps for sub-10ms query times.

## Extension Points
- **Semantic Search:** Designed to allow vector-based embeddings or symbol indexing alongside the path index.
- **Rankers:** `SearchRanker` can be hot-swapped to prioritize recent files, open files, or AI-suggested files.

## Lifecycle
1. `WorkspaceManager` finishes loading the `VirtualFileSystem`.
2. `WorkspaceManager` instantiates `WorkspaceSearch(vfs)`.
3. `WorkspaceSearch` parses ignore rules and traverses the VFS to populate `PathIndex` and `ExtensionIndex`.
4. As files change, `WorkspaceSyncEngine` emits `fileEvent` notifications, causing the search engine to atomically update its caches.
5. `QuickInput` triggers `search()`, hitting the memory cache instantly.

## Ownership
- **Location:** `src/services/workspace/search/`
- **Maintainers:** Search & Indexing Team.
