import { create } from 'zustand';

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  id: string;
  uri: string;
  severity: DiagnosticSeverity;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  source?: string;
  code?: string | number;
}

interface DiagnosticsState {
  diagnostics: Diagnostic[];
  publishDiagnostics: (uri: string, diagnostics: Diagnostic[]) => void;
  clearDiagnostics: (uri?: string) => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  diagnostics: [],
  publishDiagnostics: (uri, newDiagnostics) => set((state) => {
    const filtered = state.diagnostics.filter(d => d.uri !== uri);
    return { diagnostics: [...filtered, ...newDiagnostics] };
  }),
  clearDiagnostics: (uri) => set((state) => {
    if (uri) {
      return { diagnostics: state.diagnostics.filter(d => d.uri !== uri) };
    }
    return { diagnostics: [] };
  }),
}));
