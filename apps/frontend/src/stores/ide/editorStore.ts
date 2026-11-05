import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorageAdapter } from '../../services/storage.service';

interface EditorConfig {
  theme: string;
  wordWrap: 'on' | 'off';
  minimap: boolean;
  fontSize: number;
  tabSize: number;
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
  bracketPairColorization: boolean;
  smoothScrolling: boolean;
  fontLigatures: boolean;
  formatOnSave: boolean;

  // Enterprise Extensions
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
  lineNumbers: 'on' | 'off' | 'relative' | 'interval';
  guides: {
    bracketPairs: boolean;
    indentation: boolean;
  };
  scrollBeyondLastLine: boolean;
  autoClosingBrackets: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';
  autoIndent: 'none' | 'keep' | 'brackets' | 'advanced' | 'full';
  stickyScrollEnabled: boolean;
}

interface EditorState {
  config: EditorConfig;
}

interface EditorActions {
  updateConfig: (config: Partial<EditorConfig>) => void;
}

const defaultConfig: EditorConfig = {
  theme: 'vs-dark',
  wordWrap: 'on',
  minimap: true,
  fontSize: 14,
  tabSize: 2,
  renderWhitespace: 'selection',
  bracketPairColorization: true,
  smoothScrolling: true,
  fontLigatures: true,
  formatOnSave: false,

  // Enterprise defaults
  cursorBlinking: 'blink',
  cursorStyle: 'line',
  lineNumbers: 'on',
  guides: { bracketPairs: true, indentation: true },
  scrollBeyondLastLine: true,
  autoClosingBrackets: 'languageDefined',
  autoIndent: 'full',
  stickyScrollEnabled: false,
};

export const useEditorStore = create<EditorState & EditorActions>()(
  persist(
    (set) => ({
      config: defaultConfig,
      updateConfig: (newConfig) => set((state) => ({ config: { ...state.config, ...newConfig } })),
    }),
    {
      name: 'ide-editor-config-storage',
      storage: createJSONStorage(() => zustandStorageAdapter),
    }
  )
);
