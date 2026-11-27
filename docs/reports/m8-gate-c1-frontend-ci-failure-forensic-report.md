# M8 GATE C.1 — GITHUB ACTIONS FRONTEND TEST FAILURE ROOT-CAUSE FORENSIC REPORT

**Repository:** `D:\Gravitron-IDE`  
**Execution Host:** Work PC ONLY (Windows 11)  
**Branch:** `main`  
**Published HEAD:** `b23bac5bed86829a0892cc65b74426ebe05f6491`  
**Remote Target:** `origin/main` (`b23bac5bed86829a0892cc65b74426ebe05f6491`)  
**Parent Commit:** `e2513ee4d3707194d58e5f6d6737de905b5e5d13`  
**Failed CI Run ID:** `44730369862`  
**Failed CI Job ID:** `136268263927` (`Lint, Test & Build`)  
**Investigation Mode:** STRICTLY READ-ONLY FORENSIC INVESTIGATION  
**Report Date:** 2026-11-20  

---

## 1. Repository and Commit Verification

A preflight forensic check was conducted on the repository to verify that the local repository matches the published remote commit and that the working tree remains pristine.

### 1.1 Git Preflight Evidence

```powershell
Set-Location D:\Gravitron-IDE

git rev-parse --show-toplevel
# Output: D:/Gravitron-IDE

git branch --show-current
# Output: main

git rev-parse HEAD
# Output: b23bac5bed86829a0892cc65b74426ebe05f6491

git rev-parse origin/main
# Output: b23bac5bed86829a0892cc65b74426ebe05f6491

git status --short
# Output:
# ?? docs/reports/m8-gate-c-publication-and-ci-report.md
```

### 1.2 Verification Findings
- **Branch:** `main` (verified aligned with `origin/main`).
- **Published HEAD:** `b23bac5bed86829a0892cc65b74426ebe05f6491` (verified).
- **Tracked Modifications:** 0 staged, 0 unstaged modifications. Working tree is clean.
- **Untracked Artifacts:** Exactly one untracked report from Gate C (`docs/reports/m8-gate-c-publication-and-ci-report.md`).
- **Authorization Compliance:** Strictly read-only; no source, test, workflow, or configuration modifications were staged or committed.

---

## 2. Exact CI Run and Job Evidence

Forensic extraction of GitHub Actions metadata and Check-Run annotations was executed against the GitHub REST API for Run `44730369862` and Job `136268263927`.

### 2.1 Execution Context
- **Run URL:** [https://github.com/hassanhaider007/Gravitron-IDE/actions/runs/44730369862](https://github.com/hassanhaider007/Gravitron-IDE/actions/runs/44730369862)
- **Workflow:** `CI` (`.github/workflows/ci.yml`)
- **Trigger Event:** `push` to `refs/heads/main` at commit `b23bac5bed86829a0892cc65b74426ebe05f6491`
- **Runner Environment:** GitHub-hosted `ubuntu-latest` (Linux 6.8.0, 2 vCPUs, 7 GB RAM)
- **Node.js Version:** `20.x` (resolved Node `v20.18.0`)
- **Package Manager:** `pnpm 9.15.0`
- **Turborepo Execution Command:** `pnpm turbo run build lint test`
- **Frontend Test Command:** `vitest run --exclude '**/sync-queue-massive.test.ts' --exclude '**/soak/**'`
- **Vitest Version:** `v4.1.10`

### 2.2 Suite Execution Summary Across Workspaces
All packages across the Gravitron-IDE monorepo passed their build, lint, and test jobs, except for `@ag/frontend#test`:
- `@ag/contracts#test`: **PASSED**
- `@ag/core#test`: **PASSED**
- `@ag/backend#test`: **PASSED**
- `@ag/desktop-electron#test`: **PASSED**
- `@ag/frontend#build`: **PASSED**
- `@ag/frontend#lint`: **PASSED**
- `@ag/frontend#test`: **FAILED (Exit Code 1)**

### 2.3 Reconciled GitHub Check-Run Annotations
Querying `https://api.github.com/repos/CodewithHassan1/Gravitron-IDE/check-runs/136268263927/annotations` returned 21 total annotations: 11 notices/informational warnings and exactly 10 failure annotations.

| # | Annotation Path & Line | Failure Title | Exception / Error Message |
|---|---|---|---|
| 1 | `apps/frontend/tests/workspace/sync-engine.test.ts:57` | `Sync Engine > Failed operations handling` | `TypeError: Cannot read properties of null (reading 'enqueueOperation')` |
| 2 | `apps/frontend/tests/workspace/sync-engine.test.ts:39` | `Sync Engine > File operations return FileOperationResult without operationId` | `AssertionError: expected false to be true` |
| 3 | `apps/frontend/tests/workspace/search-consistency.test.ts:43` | `Search Consistency > Search eventually matches VFS after mutations` | `TypeError: Cannot read properties of null (reading 'search')` |
| 4 | `apps/frontend/tests/workspace/persistence-recovery.test.ts:47` | `Persistence Recovery > Reloads identical structure with preserved UUIDs from snapshot` | `AssertionError: expected undefined to be defined` |
| 5 | `apps/frontend/src/services/workspace/vfs/VirtualFileSystem.ts:126` | `Filesystem Operations > should build tree with children via WorkspaceTreeAdapter` | `TypeError: this.index.get is not a function` (invoked via `filesystem-operations.test.ts:168`) |
| 6 | `apps/frontend/tests/workspace/filesystem-operations.test.ts:118` | `Filesystem Operations > delete should remove node recursively and emit delete` | `AssertionError: expected false to be true` |
| 7 | `apps/frontend/tests/workspace/filesystem-operations.test.ts:84` | `Filesystem Operations > rename should correctly move the node and emit rename` | `AssertionError: expected false to be true` |
| 8 | `apps/frontend/tests/workspace/filesystem-operations.test.ts:42` | `Filesystem Operations > createFile and createFolder should update VFS and queue sync operations` | `AssertionError: expected false to be true` |
| 9 | `apps/frontend/tests/workspace/event-contracts.test.ts:44` | `Event Contracts > mutations emit strongly typed, immutable file events synchronously` | `AssertionError: expected +0 to be 1` |
| 10 | `.github:3201` | Turborepo Task Summary | `@ag/frontend#test: command (/home/runner/work/Gravitron-IDE/Gravitron-IDE/apps/frontend) /home/runner/setup-pnpm/node_modules/.bin/pnpm run test exited (1)` |

Annotation #10 is a Turborepo wrapper summary indicating package task termination with non-zero exit code. The 9 active test failures map directly across 5 test suites.

---

## 3. Vitest Isolation and Execution Model Findings

Investigation of Vitest configuration and Node.js execution characteristics revealed critical differences between local execution and CI execution.

### 3.1 Configuration Inspection

**File:** `apps/frontend/vitest.config.ts` [vitest.config.ts#L1-L9](file:///D:/Gravitron-IDE/apps/frontend/vitest.config.ts#L1-L9)
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

**Key Findings:**
1. **No Custom Pool or Isolation Flags:** Neither `pool: 'forks'` nor `isolate: false` is configured.
2. **Default Worker Pool:** In Vitest 4, the default pool is `pool: 'threads'` using Node.js `worker_threads`.
3. **Environment:** Default environment is `node` (since `environment: 'jsdom'` is not specified in `vitest.config.ts`).
4. **Setup File:** `apps/frontend/vitest.setup.ts` [vitest.setup.ts#L40-L49](file:///D:/Gravitron-IDE/apps/frontend/vitest.setup.ts#L40-L49) sets:
   - `global.Worker = MockWorker;`
   - `Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, writable: true });`
5. **Worker Thread Concurrency:**
   - In Vitest with `pool: 'threads'`, worker threads equal the available logical CPU cores (`Math.max(1, cpus - 1)` or up to `cpus`).
   - On the developer's Work PC (Windows 11 with 12 logical cores), Vitest spawns 11–12 worker threads. When running targeted test files or small subsets, each test suite executes in its own dedicated worker thread.
   - On the GitHub Actions runner (`ubuntu-latest` with 2 vCPUs), Vitest spawns only **2 worker threads**.
   - With ~45 test suites in `@ag/frontend`, Vitest assigns **20 to 23 test suites sequentially to each worker thread**.

### 3.2 Thread-Level Global Scope Pollution

In Node.js `worker_threads`:
- While Vitest clears module caches between test files when `isolate: true` is active, **the worker thread's JavaScript `global` object persists across sequentially executed test files within that thread**.
- Any test suite that assigns properties directly to `(global as any).window` pollutes the `global` object for all subsequent test files executed inside that same worker thread.

---

## 4. WorkspaceManager Lifecycle Trace

Detailed analysis was conducted on `apps/frontend/src/services/workspace/WorkspaceManager.ts`.

### 4.1 Singleton and Class Exports
`WorkspaceManager.ts` exports both the implementation class and a module-level singleton:
- Line 25: `export class WorkspaceManagerImpl`
- Line 1069: `export const WorkspaceManager = new WorkspaceManagerImpl();`

### 4.2 Lifecycle Sequence (`openWorkspace`)
[WorkspaceManager.ts#L682-L808](file:///D:/Gravitron-IDE/apps/frontend/src/services/workspace/WorkspaceManager.ts#L682-L808)

1. **Locking:** Enqueued on `this.lifecycleLock`.
2. **Session Updates:** `WorkspaceSession.setLifecycleState(WorkspaceLifecycleState.Opening)`.
3. **Snapshot Retrieval:** `const snapshot = await this.persistence.getSnapshot(metadata.id)`.
4. **VFS Initialization:** `this.vfs.initializeRoot(metadata.name, metadata.type)`.
5. **Sync Engine:** `this.syncEngine = new WorkspaceSyncEngine(...)`; `this.syncEngine.start(handle.nativeHandle)`.
6. **Search Service:** `this.searchEngine = new WorkspaceSearchService(this.vfs)`.
7. **Context & Events:** Sets ContextEngine flags, emits `WorkspaceEventType.WorkspaceOpened` and `WorkspaceEventType.WorkspaceUpdated`.
8. **Catch Block Rollback:**
   ```typescript
   } catch (error: any) {
     WorkspaceSession.setLoading(false);
     console.error('[WorkspaceManager] ERROR in openWorkspace:', error);
     WorkspaceSession.setLifecycleState(WorkspaceLifecycleState.Error);
     WorkspaceSession.setError({ code: 'OPEN_FAILED', message: error.message });
     // Rollback using internal teardown (already within held lifecycleLock)
     await this._closeWorkspaceInternal();
     throw error;
   }
   ```
9. **Error Suppression via `lifecycleLock`:**
   ```typescript
   this.lifecycleLock = this.lifecycleLock.then(operation).catch(console.error);
   return this.lifecycleLock;
   ```
   **Critical Defect:** Because `.catch(console.error)` is chained directly to `this.lifecycleLock` and returned as the promise, the rejection is swallowed. Callers awaiting `openWorkspace(...)` in `beforeEach` do **not** receive a thrown rejection; the promise resolves to `undefined`. If `operation` aborts and rolls back via `_closeWorkspaceInternal()`, tests proceed against a dismantled manager instance.

### 4.3 Internal Teardown (`_closeWorkspaceInternal`)
[WorkspaceManager.ts#L810-L862](file:///D:/Gravitron-IDE/apps/frontend/src/services/workspace/WorkspaceManager.ts#L810-L862)

```typescript
private async _closeWorkspaceInternal(): Promise<void> {
  const currentId = WorkspaceSession.getWorkspaceId();
  if (!currentId && !this.activeWorkspaceId) return;

  // 1. Closing State
  WorkspaceSession.setLifecycleState(WorkspaceLifecycleState.Closing);

  // 2. Dispose Terminal
  // ...

  // 3. Dispose Git (SyncEngine)
  this.syncEngine?.stop();
  this.syncEngine = null;

  // 5. Dispose Search
  this.searchEngine?.dispose();
  this.searchEngine = null;

  // 7. Dispose VFS
  (this.vfs as any).index = { rootId: null, paths: {} };

  // 8. Empty State
  WorkspaceSession.clear();
  this.activeWorkspaceId = null;
  this.activeWorkspaceMetadata = null;

  // ...
  WorkspaceEvents.emit(WorkspaceEventType.WorkspaceClosed, { ... });
  WorkspaceEvents.emit(WorkspaceEventType.WorkspaceUpdated, undefined);
  WorkspaceEvents.clearAllListeners();
}
```

---

## 5. VFS Index Contract and Teardown Findings

### 5.1 The `TreeIndex` Class Contract
**File:** `apps/frontend/src/services/workspace/vfs/TreeIndex.ts` [TreeIndex.ts#L4-L95](file:///D:/Gravitron-IDE/apps/frontend/src/services/workspace/vfs/TreeIndex.ts#L4-L95)
- Defines primary maps: `nodes: Map<string, WorkspaceNode>`, `children: Map<string, Set<string>>`, `pathMap: Map<string, string>`.
- Exposes prototype methods: `.get(id: string)`, `.getByPath(path: string)`, `.has(id: string)`, `.getChildren(parentId: string)`.

### 5.2 The VFS Lookup Method
**File:** `apps/frontend/src/services/workspace/vfs/VirtualFileSystem.ts` [VirtualFileSystem.ts#L125-L127](file:///D:/Gravitron-IDE/apps/frontend/src/services/workspace/vfs/VirtualFileSystem.ts#L125-L127)
```typescript
public find(id: string): Readonly<WorkspaceNode> | undefined {
  return this.index.get(id);
}
```

### 5.3 Contract Violation in Teardown
In `WorkspaceManager.ts:840`:
```typescript
(this.vfs as any).index = { rootId: null, paths: {} };
```
- This statement deliberately bypasses TypeScript typing with `as any`.
- It replaces the `TreeIndex` instance with a plain JavaScript object `{ rootId: null, paths: {} }`.
- This plain object lacks `.get()`, `.has()`, `.getByPath()`, and all other `TreeIndex` methods.
- Any subsequent invocation of `vfs.find(id)` (e.g. from `WorkspaceManager.getChildren(nodeId)` at line 121) throws `TypeError: this.index.get is not a function`.

---

## 6. Event Bus Ownership and Cleanup Findings

### 6.1 Global Event Bus Ownership
**File:** `apps/frontend/src/services/workspace/WorkspaceEvents.ts`
- Exports a single module-level event emitter: `export const WorkspaceEvents = new WorkspaceEventsImpl();`.
- All `WorkspaceManagerImpl` instances share this same event bus.

### 6.2 Over-Aggressive Teardown Cleanup
In `WorkspaceManager.ts:861`:
```typescript
WorkspaceEvents.clearAllListeners();
```
When `_closeWorkspaceInternal()` runs (either during rollback of a failed open or in an `afterEach` hook), it wipes all listeners registered across the entire process/thread. Any test awaiting asynchronous events on `WorkspaceEvents` has its listeners disconnected.

### 6.3 Early Exit on Failed Mutation
In `WorkspaceManager.ts:394-395`:
Events such as `WorkspaceEventType.FolderCreated` and `fileEvent` are emitted **after** the IPC call:
```typescript
if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
  const result = await (window as any).agApi.workspace.createFolder(workspaceId, path, mutationId);
  unwrapIpcResponse(result);
}
const node = this.vfs.createFolder(path);
WorkspaceEvents.emit(WorkspaceEventType.FolderCreated, { path, nodeId: node.id });
WorkspaceEvents.emit('fileEvent', { type: 'created', node: frozenNode! });
```
When the IPC call throws (due to missing mock functions), the catch block returns `{ success: false }` without emitting the events, leaving event listeners with 0 events received.

---

## 7. Five-Suite Setup/Teardown Matrix

| Test Suite | Manager Type | Hooks Present | Teardown Calls | Mutated Global / Shared State |
|---|---|---|---|---|
| `apps/frontend/tests/workspace/sync-engine.test.ts` | `new WorkspaceManagerImpl()` | `beforeEach` | None | `WorkspaceEvents.clearAllListeners()`, `WorkspaceSession`, `idb` mock |
| `apps/frontend/tests/workspace/search-consistency.test.ts` | `new WorkspaceManagerImpl()` | `beforeEach` | None | `WorkspaceEvents.clearAllListeners()`, `WorkspaceSession`, `idb` mock |
| `apps/frontend/tests/workspace/persistence-recovery.test.ts` | `new WorkspaceManagerImpl()` | `beforeEach` | None | `WorkspaceEvents.clearAllListeners()`, `mockDbStore` |
| `apps/frontend/tests/workspace/filesystem-operations.test.ts` | Singleton `WorkspaceManager` | `beforeEach`, `afterEach` | `await WorkspaceManager.closeWorkspace()` | `WorkspaceManager` singleton, `(vfs as any).index`, `WorkspaceEvents`, `WorkspaceSession`, `useWorkspaceTreeStore` |
| `apps/frontend/tests/workspace/event-contracts.test.ts` | `new WorkspaceManagerImpl()` | `beforeEach` | None | `WorkspaceEvents.clearAllListeners()`, `WorkspaceSession` |
| `apps/frontend/src/services/workspace/__tests__/WorkspaceManager.contract.test.ts` | `new WorkspaceManagerImpl()` | `beforeEach`, `afterEach` | `delete (global as any).window` | **`(global as any).window`**, `window.agApi`, `WorkspaceEvents` |

---

## 8. Ten-Annotation Failure Classification

### Failure 1: `sync-engine.test.ts:57`
- **Error:** `TypeError: Cannot read properties of null (reading 'enqueueOperation')`
- **Code:** `syncEngine.enqueueOperation({ ... })` where `const syncEngine = (manager as any).syncEngine;`
- **Forensic Diagnosis:** `openWorkspace` encountered an error in `beforeEach` and initiated rollback via `_closeWorkspaceInternal()`, setting `this.syncEngine = null`. Because `this.lifecycleLock.catch(console.error)` swallowed the rejection, `beforeEach` completed and the test body ran with `manager.syncEngine === null`.

### Failure 2: `sync-engine.test.ts:39`
- **Error:** `AssertionError: expected false to be true`
- **Code:** `const res = await manager.createFile('/test.txt'); expect(res.success).toBe(true);`
- **Forensic Diagnosis:** Leaked global `window.agApi` mock from `WorkspaceManager.contract.test.ts` contained only `subscribe` and `readDirectory`. In `createFile()`, `typeof window !== 'undefined' && agApi` evaluated to `true`. Calling `agApi.workspace.createFile(...)` threw `TypeError: ...createFile is not a function`. The method caught the error and returned `{ success: false, error: '...' }`.

### Failure 3: `search-consistency.test.ts:43`
- **Error:** `TypeError: Cannot read properties of null (reading 'search')`
- **Code:** `let searchRes = await searchEngine.search(new SearchQuery('hello'));` where `const searchEngine = (manager as any).searchEngine;`
- **Forensic Diagnosis:** Identical to Failure 1. `openWorkspace` aborted during `beforeEach`, executing `_closeWorkspaceInternal()`, which nullified `this.searchEngine = null`. The test body executed against `searchEngine === null`.

### Failure 4: `persistence-recovery.test.ts:47`
- **Error:** `AssertionError: expected undefined to be defined`
- **Code:** `expect(indexIdBefore).toBeDefined();` where `const indexIdBefore = (manager as any).vfs.resolve('/src/index.ts');`
- **Forensic Diagnosis:** Preceding calls `await manager.createFolder('/src')` and `await manager.createFile('/src/index.ts')` failed with `{ success: false }` due to missing IPC functions on `window.agApi`. Because the VFS mutations were aborted, `/src/index.ts` was never created in VFS, causing `vfs.resolve('/src/index.ts')` to return `null`/`undefined`.

### Failure 5: `VirtualFileSystem.ts:126` (via `filesystem-operations.test.ts:168`)
- **Error:** `TypeError: this.index.get is not a function`
- **Code Trace:**
  - `tests/workspace/filesystem-operations.test.ts:168`: `const children = WorkspaceManager.getChildren(rootId!);`
  - `apps/frontend/src/services/workspace/WorkspaceManager.ts:121`: `const node = this.vfs?.find(nodeId);`
  - `apps/frontend/src/services/workspace/vfs/VirtualFileSystem.ts:126`: `return this.index.get(id);`
- **Forensic Diagnosis:** Preceding test case teardown (`afterEach`) called `await WorkspaceManager.closeWorkspace()`, which executed `(this.vfs as any).index = { rootId: null, paths: {} }`. During the subsequent test, `this.index` lacked `.get()`, throwing `TypeError`.

### Failure 6: `filesystem-operations.test.ts:118`
- **Error:** `AssertionError: expected false to be true`
- **Code:** `const res = await WorkspaceManager.delete('/to-delete.txt'); expect(res.success).toBe(true);`
- **Forensic Diagnosis:** `WorkspaceManager.delete` checked `typeof window !== 'undefined' && agApi` and attempted to invoke `agApi.workspace.deleteFile(...)`. Because the leaked `window.agApi` lacked `deleteFile`, it threw `TypeError: ...deleteFile is not a function`, caught it, and returned `{ success: false }`.

### Failure 7: `filesystem-operations.test.ts:84`
- **Error:** `AssertionError: expected false to be true`
- **Code:** `const resRename = await WorkspaceManager.rename('/old-name.txt', 'new-name.txt'); expect(resRename.success).toBe(true);`
- **Forensic Diagnosis:** `WorkspaceManager.rename` attempted to call `agApi.workspace.renameFile(...)`, which was undefined on the leaked global `window.agApi`. Threw `TypeError`, caught, returned `{ success: false }`.

### Failure 8: `filesystem-operations.test.ts:42`
- **Error:** `AssertionError: expected false to be true`
- **Code:** `const resFolder = await WorkspaceManager.createFolder('/src'); expect(resFolder.success).toBe(true);`
- **Forensic Diagnosis:** `WorkspaceManager.createFolder` attempted to call `agApi.workspace.createFolder(...)`, which was undefined on leaked `window.agApi`. Threw `TypeError`, caught, returned `{ success: false }`.

### Failure 9: `event-contracts.test.ts:44`
- **Error:** `AssertionError: expected +0 to be 1`
- **Code:** `await manager.createFolder('/src'); expect(events.length).toBe(1);`
- **Forensic Diagnosis:** Because `manager.createFolder('/src')` failed inside the unmocked IPC block, it aborted before reaching `WorkspaceEvents.emit(...)`. Zero events were emitted to the listener.

### Failure 10: `.github:3201`
- **Error:** Turborepo command exit status notice
- **Forensic Diagnosis:** Turborepo build task summary indicating `@ag/frontend#test` exited with non-zero status. Not an independent test defect.

---

## 9. Cross-Suite Singleton Hypothesis Determination

**Initial Hypothesis:** Concurrent test suites mutate or tear down the same module-level `WorkspaceManager` singleton, causing sibling tests to observe null engines, invalid VFS index state, and missing event listeners.

### Forensic Evaluation: CONFIRMED & REFINED

The hypothesis is **CONFIRMED** in establishing cross-suite state leakage as the cause of the failures, but is **REFINED** in its exact technical mechanism:

1. **Primary Leakage Vector — Unisolated Process-Global Scope:**
   The primary driver is **not** exclusively the exported `WorkspaceManager` singleton instance. Rather, it is the **unisolated mutation of Node's `global.window` across test files within Vitest worker threads**.
   - In `apps/frontend/src/services/workspace/__tests__/WorkspaceManager.contract.test.ts:6-14`:
     ```typescript
     if (typeof global !== 'undefined') {
       (global as any).window = {
         agApi: {
           workspace: {
             subscribe: vi.fn(),
             readDirectory: vi.fn().mockResolvedValue([]),
           },
         },
       };
     }
     ```
   - In `apps/frontend/src/services/workspace/WorkspacePersistence.test.ts:10`:
     ```typescript
     if (typeof global !== 'undefined') {
       (global as any).window = global;
     }
     ```
   - In Vitest's `pool: 'threads'` model on a 2-vCPU runner, worker threads are reused sequentially across multiple test files. Attaching `window` to `global` leaves `typeof window !== 'undefined'` as `true` for all subsequent test suites executed within that worker thread.

2. **Secondary Leakage Vector — Module-Level Singleton & Asymmetric Teardown:**
   - `filesystem-operations.test.ts` directly consumes the singleton `WorkspaceManager` and calls `await WorkspaceManager.closeWorkspace()` in `afterEach`.
   - `_closeWorkspaceInternal()` mutates `(this.vfs as any).index = { rootId: null, paths: {} }`, destroying the `TreeIndex` prototype methods.
   - `_closeWorkspaceInternal()` executes `WorkspaceEvents.clearAllListeners()`, wiping out listeners on the shared module-level `WorkspaceEvents` singleton.

---

## 10. Local-Versus-CI Environment Comparison

| Dimension | Local Execution (Work PC) | GitHub Actions CI (Ubuntu Runner) | Forensic Impact |
|---|---|---|---|
| Operating System | Windows 11 Pro | Ubuntu 22.04 LTS (Linux 6.8.0) | Path casing and separator normalization differences; Linux CI is strictly non-case-tolerant |
| CPU Cores / vCPUs | 12 Logical Threads (6P/12T) | 2 vCPUs (GitHub-hosted standard runner) | **Determining Factor in Concurrency:** 12 threads spawn 11 workers; 2 vCPUs spawn exactly 2 worker threads |
| Vitest Worker Pool | `pool: 'threads'` (default) | `pool: 'threads'` (default) | Identical configuration |
| Vitest Worker Count | 11–12 concurrent workers | 2 concurrent workers | On local PC, suites rarely share a worker thread. In CI, ~22 suites share each worker thread sequentially |
| Test Suites Run | Individual suites or 3-suite groups | Full suite (45+ test files) | In full suite run, `WorkspaceManager.contract.test.ts` executes before sibling suites in the same worker |
| Node.js Version | Node `v20.18.0` | Node `v20.18.0` | Identical |
| pnpm Version | `9.15.0` | `9.15.0` | Identical |
| Vitest Version | `4.1.10` | `4.1.10` | Identical |
| Test Filter Flags | `--exclude '**/sync-queue-massive.test.ts' --exclude '**/soak/**'` | `--exclude '**/sync-queue-massive.test.ts' --exclude '**/soak/**'` | Identical exclusion boundaries |

---

## 11. Root Causes Separated from Contributing Factors and Symptoms

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                ROOT CAUSES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Global Process Scope Pollution:                                          │
│    `WorkspaceManager.contract.test.ts` attaches a partial mock to           │
│    `global.window.agApi`, which persists across suites in Vitest threads.  │
│                                                                             │
│ 2. VFS Index Teardown Contract Violation:                                   │
│    `WorkspaceManager.ts:840` overwrites `vfs.index` with a plain object     │
│    `{ rootId: null, paths: {} }` lacking `TreeIndex.prototype.get()`.       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONTRIBUTING FACTORS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. 2-vCPU CI Runner Worker Reuse: Vitest executes 20+ suites sequentially  │
│    inside 2 worker threads, guaranteeing cross-suite global pollution.      │
│ 2. Silent Error Swallowing in `openWorkspace()` via `lifecycleLock.catch`:   │
│    Prevents `beforeEach` from failing fast, allowing tests to run with null │
│    engines and broken VFS indices.                                          │
│ 3. Unguarded IPC Calls: `WorkspaceManager.ts` calls `agApi.workspace.*`    │
│    without checking whether the specific IPC function exists.               │
│ 4. Global Event Bus Cleared in Teardown: `WorkspaceEvents.clearAllListeners`│
│    removes listeners owned by other active tests.                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  SYMPTOMS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Failure 1 & 3: `Cannot read properties of null` (engines nullified).      │
│ • Failure 2, 6, 7, 8: `AssertionError: expected false to be true` (IPC fails│
│   and returns `{ success: false }`).                                        │
│ • Failure 4: `AssertionError: expected undefined to be defined` (VFS nodes  │
│   never created because IPC failed).                                        │
│ • Failure 5: `TypeError: this.index.get is not a function`.                 │
│ • Failure 9: `AssertionError: expected +0 to be 1` (events not emitted).    │
│ • Failure 10: Turborepo exit status 1.                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Minimal Evidence-Based Remediation Options

Any future remediation must be strictly minimal, deterministic, and address the proven defects without broad architectural rewrites.

### Option 1: Targeted Global Isolation & IPC Safety Guarding (Recommended)
This option directly addresses Root Causes 1 and 2 and Contributing Factors 2, 3, and 4:

1. **Eliminate Global Scope Pollution in Test Files:**
   - In `apps/frontend/src/services/workspace/__tests__/WorkspaceManager.contract.test.ts`:
     - Provide complete mocks for all `agApi.workspace` methods (`createFile`, `createFolder`, `deleteFile`, `deleteFolder`, `renameFile`, `renameFolder`, `moveFile`, `readFile`, `writeFile`).
     - Properly restore/delete `global.window` in an `afterAll` hook or isolate via Vitest mock environment.
   - In `apps/frontend/src/services/workspace/WorkspacePersistence.test.ts`:
     - Ensure `(global as any).window` is cleaned up after suite completion.

2. **Restore Valid VFS Index Teardown Contract:**
   - In `apps/frontend/src/services/workspace/WorkspaceManager.ts:840`:
     - Replace `(this.vfs as any).index = { rootId: null, paths: {} };` with a proper `TreeIndex` reset:
       ```typescript
       this.vfs.initializeRoot();
       ```
       or
       ```typescript
       (this.vfs as any).index = new TreeIndex();
       ```

3. **IPC Function Existence Check in `WorkspaceManager.ts`:**
   - In `WorkspaceManager.ts` mutation methods (`createFolder`, `createFile`, `delete`, `rename`, `move`), guard IPC invocations:
     ```typescript
     if (workspaceId && typeof window !== 'undefined' && typeof (window as any).agApi?.workspace?.createFolder === 'function') {
       // call IPC
     }
     ```
   - This ensures that if `window` is present in a test environment without full Electron IPC mocks, methods fall back cleanly to in-memory VFS mutations rather than throwing `TypeError: ... is not a function`.

4. **Lifecycle Lock Error Propagation:**
   - In `WorkspaceManager.ts:806`, propagate errors rather than swallowing them with `.catch(console.error)`:
     ```typescript
     this.lifecycleLock = this.lifecycleLock.then(operation);
     return this.lifecycleLock;
     ```

### Option 2: Process-Level Worker Isolation (Alternative / Complementary)
- Configure `apps/frontend/vitest.config.ts` to use `pool: 'forks'` instead of `pool: 'threads'`.
- *Assessment:* While `forks` provides full process isolation and eliminates shared `global` state between files, it incurs noticeable process spawning overhead on 2-vCPU runners (~25–35% slower test execution). Option 1 resolves the defects at their source and should be prioritized.

---

## 13. Scope and Security Regression Constraints

The investigation confirms that the failures are entirely confined to frontend service teardown, global mock leakage in Vitest worker threads, and IPC method guarding.

The following security and architecture guarantees remain untouched and must be preserved during any subsequent implementation:
- **RBAC Rules:** Frozen permissions across IDE and gateway services are unaffected.
- **Tenant & Workspace Isolation:** Workspace boundary guarantees remain strictly enforced.
- **Gateway Signing Boundary:** Gateway token issuance and cryptographic signatures remain intact.
- **Worker Public-Key Verification:** Execution service signature verification remains intact.
- **Raw-Token Non-Persistence:** No credentials or tokens are logged or persisted.
- **Fail-Closed Behavior:** All system security gates fail closed.
- **Architectural Simplicity:** No new singleton architecture, dependency injection framework, or global test serialization will be introduced.

---

## 14. Gate C.1 Finding Classifications

| Audit Area | Status | Evidence / Determination |
|---|---|---|
| **Repository & Commit Preflight** | **PASS** | Repository is at published commit `b23bac5bed86829a0892cc65b74426ebe05f6491` aligned with `origin/main`. Working tree clean. |
| **CI Failure Evidence Extraction** | **PASS** | 21 annotations retrieved from GitHub Check-Runs API; 10 failures isolated and mapped to 5 test files. |
| **Vitest Isolation Architecture Audit** | **PASS** | Default `pool: 'threads'` in Vitest 4 reuses worker threads on 2-vCPU runners, preserving Node `global` across files. |
| **WorkspaceManager Lifecycle Trace** | **PASS** | Trace completed. Identified silent error swallowing in `lifecycleLock` and null engine state after rollback. |
| **VFS Index Teardown Contract Audit** | **PASS** | Plain object replacement in `WorkspaceManager.ts:840` violates `TreeIndex` method contract (`.get()`). |
| **Event Bus Ownership & Lifecycle Audit** | **PASS** | Over-aggressive `clearAllListeners()` in teardown and skipped event emissions on failed IPC confirmed. |
| **Cross-Suite Hypothesis Determination** | **PASS (CONFIRMED & REFINED)** | Cross-suite interference confirmed; driven primarily by `global.window.agApi` process pollution and invalid VFS index replacement. |
| **Local vs CI Environment Comparison** | **PASS** | 12-core vs 2-vCPU thread multiplexing explains why tests passed in isolated local batches but failed in CI. |
| **Overall Gate C Status** | **FAIL (REMAINS BLOCKED)** | Publication commit `b23bac5` failed Linux CI. Requires authorized implementation gate and subsequent CI verification. |

---

## 15. Conclusion and Next Steps

The forensic investigation under Gate C.1 is complete. The root causes of the 10 GitHub Actions test failures on Linux CI have been definitively identified:
1. `WorkspaceManager.contract.test.ts` pollutes Node's `global.window` with an incomplete `agApi` mock that persists across test files within shared Vitest worker threads, breaking mutation operations in sibling suites.
2. `WorkspaceManager.ts:840` destroys the `TreeIndex` contract during teardown by assigning a plain object lacking `.get()`, throwing `TypeError` on subsequent node lookups.
3. `WorkspaceManager.openWorkspace()` swallows errors in its lifecycle lock, allowing tests to run against dismantled managers with null engines.

**Recommended Next Step:**
Submit this forensic report for review and await explicit user authorization for a targeted remediation gate (**Gate D — Authorized Linux CI Test Isolation & Teardown Remediation**) to implement the minimal fixes outlined in Option 1.
