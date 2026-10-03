import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface OrganizationState {
  organizations: Organization[];
  activeOrganizationId: string | null;
  isLoading: boolean;
  error: string | null;
  
  fetchOrganizations: () => Promise<void>;
  setActiveOrganization: (id: string) => void;
  clearOrganizations: () => void;
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      organizations: [],
      activeOrganizationId: null,
      isLoading: false,
      error: null,

      fetchOrganizations: async () => {
        set({ isLoading: true, error: null });
        try {
          // This relies on the organization proxy route we just added to the gateway
          // Wait, we need a connect client for organization. 
          // For now, let's mock it if the client isn't fully generated.
          // const res = await rpc.organization.listOrganizations({});
          
          // Using a mock fetch for now to represent the RPC call
          const res = await fetch('/api/v1/organization/list', {
             headers: {
               'Authorization': `Bearer ${localStorage.getItem('ag_access_token')}`
             }
          });
          
          if (!res.ok) throw new Error("Failed to fetch organizations");
          const data = await res.json();

          const orgs = data.organizations || [];
          
          set({ 
            organizations: orgs, 
            isLoading: false,
            // Automatically select the first org if none is selected
            activeOrganizationId: get().activeOrganizationId || (orgs.length > 0 ? orgs[0].id : null)
          });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
        }
      },

      setActiveOrganization: (id: string) => {
        set({ activeOrganizationId: id });
      },
      
      clearOrganizations: () => {
         set({ organizations: [], activeOrganizationId: null, error: null });
      }
    }),
    {
      name: 'ag-organization-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeOrganizationId: state.activeOrganizationId }), // Only persist the active ID
    }
  )
);
