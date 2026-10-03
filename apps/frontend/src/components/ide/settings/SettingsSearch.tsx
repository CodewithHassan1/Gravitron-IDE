import React, { useEffect } from 'react';
import { useConfigurationStore } from '../../../stores/ide/configurationStore';
import { SettingsRegistry } from '../../../lib/registries/SettingsRegistry';

export const SettingsSearch: React.FC = () => {
  const { searchQuery, setSearchQuery, setFilteredProperties } = useConfigurationStore();

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProperties([]);
      return;
    }
    
    // Simple frontend search for now.
    // In the future this should call the NavigationEngine / SettingsSearchProvider
    const query = searchQuery.toLowerCase();
    const allProps = SettingsRegistry.getAllProperties();
    
    const results = allProps.filter((prop) => {
      const matchTitle = prop.title.toLowerCase().includes(query);
      const matchDesc = prop.description?.toLowerCase().includes(query);
      const matchId = prop.id.toLowerCase().includes(query);
      const matchTags = prop.tags?.some((tag) => tag.toLowerCase().includes(query));
      return matchTitle || matchDesc || matchId || matchTags;
    });

    setFilteredProperties(results);
  }, [searchQuery, setFilteredProperties]);

  return (
    <input
      type="text"
      placeholder="Search settings..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="w-full px-3 py-2 bg-ide-background text-sm text-ide-foreground border border-ide-border rounded focus:outline-none focus:border-ide-accent"
    />
  );
};
