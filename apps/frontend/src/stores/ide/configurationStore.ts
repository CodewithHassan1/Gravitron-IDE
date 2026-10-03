import { create } from 'zustand';
import { IConfigurationPropertySchema } from '../../lib/config/ConfigurationSchema';

interface ConfigurationState {
  searchQuery: string;
  activeCategory: string | null;
  filteredProperties: IConfigurationPropertySchema[];
  setSearchQuery: (query: string) => void;
  setActiveCategory: (categoryId: string) => void;
  setFilteredProperties: (properties: IConfigurationPropertySchema[]) => void;
}

export const useConfigurationStore = create<ConfigurationState>((set) => ({
  searchQuery: '',
  activeCategory: null,
  filteredProperties: [],
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveCategory: (categoryId) => set({ activeCategory: categoryId }),
  setFilteredProperties: (properties) => set({ filteredProperties: properties }),
}));
