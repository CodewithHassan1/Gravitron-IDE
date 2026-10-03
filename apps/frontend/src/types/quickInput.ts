// src/types/quickInput.ts

export interface QuickInputProviderMetadata {
  id: string;
  title: string;
  prefixes: string[];
  priority: number;
  supportsEmptyQuery: boolean;
  supportsAsync: boolean;
  supportsCancellation: boolean;
  supportsPreview: boolean;
}

export interface QuickInputItem {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  icon?: any; // ReactNode or string
  category?: string;
  metadata?: any;
  shortcut?: string;
  alwaysShow?: boolean;
}

export interface QuickInputProvider {
  metadata: QuickInputProviderMetadata;

  initialize(): Promise<void>;
  dispose(): Promise<void>;
  refresh(): Promise<void>;

  search(query: string, signal: AbortSignal): Promise<QuickInputItem[]>;
  execute(item: QuickInputItem): Promise<void>;
  
  preview?(item: QuickInputItem): Promise<void>;
  clearPreview?(): Promise<void>;
}
