# Quick Input Architecture

The Quick Input subsystem powers the fast, fuzzy-searchable global command palette and file picker interfaces.

## Responsibilities
- Provide a stateless, high-performance UI overlay for file switching, symbol searching, and command execution.
- Maintain a decoupled integration with the backing file search index (`WorkspaceSearch`) and `CommandRegistry`.
- Expose a simple, intent-based React interface.

## Public APIs
The primary entry point is the `useQuickInputStore` and the UI `QuickInput` component.

- **Actions:** `showQuickInput(options)`, `hideQuickInput()`, `setItems(items)`.
- **Integrations:** The `QuickInputManager` translates high-level commands (e.g. "open file picker") into quick input states.

## Dependency Rules
- **Strict Separation:** Quick Input UI components must NOT directly query the VirtualFileSystem. They must ask `WorkspaceManager` or `WorkspaceSearch` for results.
- **Stateless:** Quick Input should not cache workspace files. It relies on the `WorkspaceSearchCache` for speed.

## Extension Points
- **Providers:** Can be extended to support custom quick input providers (e.g., git branch switching, symbol search) by supplying custom item lists and `onSelect` handlers.

## Lifecycle
1. User invokes a shortcut (e.g. `Ctrl+P`).
2. `ShortcutManager` triggers the command in `CommandRegistry`.
3. `CommandRegistry` instructs `QuickInputManager` to open the file picker.
4. `QuickInputManager` queries `WorkspaceManager.getSearchEngine().search(query)`.
5. User selects an item; `QuickInputManager` invokes `WorkspaceManager.readFile` or switches editor tabs.
6. `QuickInput` overlay is unmounted and state is cleared.

## Ownership
- **Location:** `src/components/ide/quickinput/` and `src/services/quickinput/`
- **Maintainers:** Core IDE UI Team.
