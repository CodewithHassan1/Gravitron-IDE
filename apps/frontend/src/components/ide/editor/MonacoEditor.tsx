import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../../stores/ide/editorStore';
import { useEditorLayoutStore } from '../../../stores/ide/editorLayoutStore';
import { EditorManager } from '../../../services/editor/EditorManager';
import { ModelManager } from '../../../services/editor/ModelManager';
import { ViewStateManager } from '../../../services/editor/ViewStateManager';
import { LanguageRegistry } from '../../../lib/editor/LanguageRegistry';
import { WorkspaceManager } from '../../../services/workspace/WorkspaceManager';
import { EditorPerformance } from '../../../services/editor/EditorPerformance';

interface MonacoEditorProps {
  uri: string;
  tabId: string;
  groupId: string;
}

export function MonacoEditor({ uri, tabId, groupId }: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const currentUriRef = useRef<string | null>(null);
  const config = useEditorStore((state) => state.config);
  const updateTabDirtyState = useEditorLayoutStore((state) => state.updateTabDirtyState);
  const changeDisposableRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;

    const initEditor = async () => {
      EditorPerformance.markStart('editorInitialization');
      await EditorManager.initialize();
      if (!mounted) return;

      const languageId = LanguageRegistry.getLanguageByExtension(uri);
      
      let content = '';
      const nodeId = WorkspaceManager.resolvePath(uri);
      try {
        if (nodeId) {
          const buffer = await WorkspaceManager.contentManager.openFile(nodeId);
          content = buffer.content;
        } else {
          content = await WorkspaceManager.readFile(uri);
        }
      } catch (err) {
        content = '// File content not found';
      }
      
      if (!mounted) return;

      const editorOptions = {
        theme: config.theme,
        wordWrap: config.wordWrap,
        minimap: { enabled: config.minimap },
        fontSize: config.fontSize,
        tabSize: config.tabSize,
        renderWhitespace: config.renderWhitespace,
        bracketPairColorization: { enabled: config.bracketPairColorization },
        smoothScrolling: config.smoothScrolling,
        fontLigatures: config.fontLigatures,
        formatOnSave: config.formatOnSave,
        cursorBlinking: config.cursorBlinking || 'blink',
        cursorStyle: config.cursorStyle || 'line',
        lineNumbers: config.lineNumbers || 'on',
        guides: config.guides || { indentation: true },
        scrollBeyondLastLine: config.scrollBeyondLastLine !== undefined ? config.scrollBeyondLastLine : true,
        autoClosingBrackets: config.autoClosingBrackets || 'languageDefined',
        autoIndent: config.autoIndent || 'full',
        stickyScroll: { enabled: config.stickyScrollEnabled || false },
        automaticLayout: true,
      };

      const editor = EditorManager.getOrCreateEditor(groupId, containerRef.current!, editorOptions);
      editorRef.current = editor;

      const model = ModelManager.getModel(uri, languageId, content);

      // Setup dirty state listener
      if (changeDisposableRef.current) {
        changeDisposableRef.current.dispose();
      }
      
      let initialVersionId = model.getAlternativeVersionId();
      changeDisposableRef.current = model.onDidChangeContent(() => {
        const isDirty = initialVersionId !== model.getAlternativeVersionId();
        updateTabDirtyState(groupId, tabId, isDirty);
        
        if (nodeId) {
          WorkspaceManager.contentManager.updateContent(nodeId, model.getValue());
        }
      });

      // Listen for save events to reset dirty tracking
      const onSaveListener = WorkspaceManager.onEvent('FileSaved' as any, (event: any) => {
        if (event.payload?.path === uri) {
          initialVersionId = model.getAlternativeVersionId();
          updateTabDirtyState(groupId, tabId, false);
        }
      });

      // Save view state of previous model if swapping
      if (currentUriRef.current && currentUriRef.current !== uri) {
        ViewStateManager.saveViewState(currentUriRef.current, editor);
      }

      EditorPerformance.markStart('editorSetModel');
      editor.setModel(model);
      ViewStateManager.restoreViewState(uri, editor);
      editor.focus();
      currentUriRef.current = uri;
      EditorPerformance.markEnd('editorSetModel');
      EditorPerformance.markEnd('editorInitialization', true);

      return () => {
        if (onSaveListener) {
          onSaveListener();
        }
      };
    };

    let cleanup: any;
    initEditor().then(res => cleanup = res);

    return () => {
      mounted = false;
      if (changeDisposableRef.current) {
        changeDisposableRef.current.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, groupId, tabId, updateTabDirtyState]); // We explicitly don't include config dependencies here

  // Sync config changes dynamically without recreating editor
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        theme: config.theme,
        wordWrap: config.wordWrap,
        minimap: { enabled: config.minimap },
        fontSize: config.fontSize,
        tabSize: config.tabSize,
        renderWhitespace: config.renderWhitespace,
        bracketPairColorization: { enabled: config.bracketPairColorization },
        smoothScrolling: config.smoothScrolling,
        fontLigatures: config.fontLigatures,
        formatOnSave: config.formatOnSave,
        cursorBlinking: config.cursorBlinking || 'blink',
        cursorStyle: config.cursorStyle || 'line',
        lineNumbers: config.lineNumbers || 'on',
        guides: config.guides || { indentation: true },
        scrollBeyondLastLine: config.scrollBeyondLastLine !== undefined ? config.scrollBeyondLastLine : true,
        autoClosingBrackets: config.autoClosingBrackets || 'languageDefined',
        autoIndent: config.autoIndent || 'full',
        stickyScroll: { enabled: config.stickyScrollEnabled || false },
      });
    }
  }, [config]);

  // Handle group unmount completely
  useEffect(() => {
    return () => {
      // When the component representing the editor unmounts (e.g. group closed), we destroy it.
      if (editorRef.current && currentUriRef.current) {
        ViewStateManager.saveViewState(currentUriRef.current, editorRef.current);
      }
      EditorManager.disposeEditorGroup(groupId);
    };
  }, [groupId]);

  return <div ref={containerRef} className="w-full h-full" />;
}
