import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutlineService } from '../OutlineService';
import { OutlineProviderRegistry } from '../OutlineProviderRegistry';
import { useOutlineStore } from '../../../stores/ide/outlineStore';
import { OutlineProvider } from '../types';
import { EditorManager } from '../../editor/EditorManager';

describe('OutlineService', () => {
  beforeEach(() => {
    useOutlineStore.setState({ cache: new Map(), followCursor: true });
    vi.clearAllMocks();
  });

  it('should get symbols from provider and update cache', async () => {
    const mockProvider: OutlineProvider = {
      canHandle: () => true,
      getSymbols: async () => [{ name: 'testSymbol', detail: '', kind: 1, tags: [], range: { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 }, selectionRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 } }]
    };

    OutlineProviderRegistry.register(mockProvider);

    // Mock editor manager adapter
    EditorManager.adapter = {
      getActiveEditorUri: () => 'file:///test.ts',
      getDocumentSymbols: vi.fn(),
      revealSymbol: vi.fn(),
      getCurrentCursor: () => ({ uri: 'file:///test.ts', position: { lineNumber: 1, column: 1 } })
    };

    // Mock EditorManager active editor
    vi.spyOn(EditorManager, 'getActiveEditor').mockReturnValue({
      getModel: () => ({
        uri: { toString: () => 'file:///test.ts' },
        getVersionId: () => 1,
        getLanguageId: () => 'typescript'
      })
    } as any);

    await (OutlineService as any).rebuildOutline('file:///test.ts');

    const state = useOutlineStore.getState();
    const cached = state.cache.get('file:///test.ts');
    
    expect(cached).toBeDefined();
    expect(cached?.versionId).toBe(1);
    expect(cached?.symbols.length).toBe(1);
    expect(cached?.symbols[0].name).toBe('testSymbol');
    
    // Test follow cursor highlight
    expect(cached?.selectedSymbol).toBe('testSymbol:1:1');
    
    OutlineProviderRegistry.unregister(mockProvider);
  });
});
