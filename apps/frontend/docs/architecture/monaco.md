# Monaco Editor Integration Architecture

The Monaco Editor integration provides the core text editing capabilities within the IDE.

## Responsibilities

- Render file contents natively using the Monaco Editor library.
- Track dirty states and buffer changes.
- Handle syntax highlighting, themes, and language features.
- Persist file changes securely via the `WorkspaceManager`.

## Public APIs

The primary access is through the `EditorManager` or the React `MonacoEditor` wrapper.

- **Editor Operations:** `openFile(uri)`, `closeFile(uri)`, `saveFile(uri)`.
- **Model Management:** `ModelManager` manages Monaco models associated with files.

## Dependency Rules

- **Decoupling from Storage:** Monaco MUST NOT read or write directly to IndexedDB or the Native File System. It MUST read/write entirely through `WorkspaceManager.readFile` and `WorkspaceManager.writeFile`.
- **Single Instance:** Monaco relies on a globally cached instance (the `EditorManager` creates models) to ensure memory efficiency and preserve view states across tab switches.

## Extension Points

- **Language Providers:** Custom providers (LSP) can be registered against the Monaco instance for completions, hovers, and diagnostics.
- **Themes:** Dynamically hook into the standard IDE theme engine.

## Lifecycle

1. User clicks a file in the `ExplorerView`.
2. Editor framework requests file content via `WorkspaceManager.readFile()`.
3. `ModelManager` creates a Monaco model.
4. User types; model buffers changes locally (dirty state).
5. User saves; Editor invokes `WorkspaceManager.writeFile()`.
6. `WorkspaceSyncEngine` asynchronously commits changes to disk.

## Ownership

- **Location:** `src/components/ide/editor/` and `src/services/editor/`
- **Maintainers:** Core Editor & Text Services Team.
