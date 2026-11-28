import { create } from 'zustand';
import type {
  AccountEntitlements,
  DownloadProgressInfo,
  LocalModelsSnapshot,
  LocalRuntimeStatus,
} from '@ag/protocol';
import { AgentManager } from '../services/ai/AgentManager';
import { modelManager } from '../services/models/ModelManager';

const agentManager = new AgentManager();

interface ModelStoreState {
  entitlements: AccountEntitlements | null;
  entitlementsLoading: boolean;
  entitlementsError: string | null;
  localSnapshot: LocalModelsSnapshot | null;
  localLoading: boolean;
  localError: string | null;
  isMarketplaceOpen: boolean;
  isSetupWizardOpen: boolean;
  setMarketplaceOpen: (open: boolean) => void;
  setSetupWizardOpen: (open: boolean) => void;
  fetchEntitlements: (accessToken: string | null) => Promise<AccountEntitlements | null>;
  clearEntitlements: () => Promise<void>;
  refreshLocalModels: () => Promise<LocalModelsSnapshot | null>;
  applyDownloadProgress: (info: DownloadProgressInfo) => void;
  applyRuntimeStatus: (status: LocalRuntimeStatus) => void;
}

export const useModelStore = create<ModelStoreState>((set, get) => ({
  entitlements: null,
  entitlementsLoading: false,
  entitlementsError: null,
  localSnapshot: null,
  localLoading: false,
  localError: null,
  isMarketplaceOpen: false,
  isSetupWizardOpen: false,

  setMarketplaceOpen: (open) => set({ isMarketplaceOpen: open }),
  setSetupWizardOpen: (open) => set({ isSetupWizardOpen: open }),

  fetchEntitlements: async (accessToken) => {
    if (!accessToken || !agentManager.isAvailable()) {
      set({ entitlements: null, entitlementsError: null });
      return null;
    }
    set({ entitlementsLoading: true, entitlementsError: null });
    try {
      const data = await agentManager.getEntitlements(accessToken);
      set({ entitlements: data, entitlementsLoading: false });
      return data;
    } catch (err: any) {
      set({
        entitlementsLoading: false,
        entitlementsError: err?.message || 'Unable to load account subscription entitlements.',
      });
      return null;
    }
  },

  clearEntitlements: async () => {
    set({ entitlements: null, entitlementsError: null });
    if (agentManager.isAvailable()) {
      await agentManager.clearEntitlements().catch(() => {});
    }
  },

  refreshLocalModels: async () => {
    if (!modelManager.isAvailable()) return null;
    set({ localLoading: true, localError: null });
    try {
      const snapshot = await modelManager.getCatalogSnapshot();
      set({ localSnapshot: snapshot, localLoading: false });
      return snapshot;
    } catch (err: any) {
      set({
        localLoading: false,
        localError: err?.message || 'Failed to inspect local models.',
      });
      return null;
    }
  },

  applyDownloadProgress: (info) => {
    const snap = get().localSnapshot;
    if (!snap) return;
    const updatedModels = snap.models.map((m) =>
      m.entry.id === info.modelId
        ? {
            ...m,
            installState: info.state,
            downloadProgress: info,
          }
        : m
    );
    set({ localSnapshot: { ...snap, models: updatedModels } });
    if (info.state === 'installed' || info.state === 'not_installed') {
      void get().refreshLocalModels();
    }
  },

  applyRuntimeStatus: (status) => {
    const snap = get().localSnapshot;
    if (!snap) return;
    const updatedModels = snap.models.map((m) => ({
      ...m,
      isLoaded: status.status === 'running' && status.loadedModelId === m.entry.id,
    }));
    set({ localSnapshot: { ...snap, runtime: status, models: updatedModels } });
  },
}));
