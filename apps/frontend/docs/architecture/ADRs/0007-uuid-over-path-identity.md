# ADR 0007: UUID over Path Identity

**Status:** Accepted
**Date:** 2026-07-17

## Context
Files and folders move frequently during standard IDE operations. Tracking an object purely by its string path (`/src/components/Button.tsx`) makes tracking identity through renames, moves, and offline sync cycles incredibly brittle.

## Decision
Every node in the `VirtualFileSystem` is assigned a structurally invariant UUID upon creation.

## Consequences
- **Pros:** A file moved from `/src` to `/lib` retains its exact UUID. Any system (like Monaco Editor models or the Search Engine) tracking the file by UUID maintains a perfect reference.
- **Cons:** Requires a `resolve(path)` mapping dictionary in the VFS to quickly map incoming string paths to UUIDs, which slightly increases memory overhead.
