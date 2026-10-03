export type WorkspaceId = string & { readonly __brand: unique symbol };
export type DocumentId = string & { readonly __brand: unique symbol };
export type DirectoryId = string & { readonly __brand: unique symbol };
export type SymbolId = string & { readonly __brand: unique symbol };
export type ReferenceId = string & { readonly __brand: unique symbol };
export type GraphNodeId = string & { readonly __brand: unique symbol };

/**
 * Factory utilities for creating strongly typed entity IDs from strings.
 * Used internally by the ID generation or bridging logic.
 */
export const EntityIds = {
  workspace: (id: string) => id as WorkspaceId,
  document: (id: string) => id as DocumentId,
  directory: (id: string) => id as DirectoryId,
  symbol: (id: string) => id as SymbolId,
  reference: (id: string) => id as ReferenceId,
  graphNode: (id: string) => id as GraphNodeId,
};
