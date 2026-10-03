import React, { useMemo } from 'react';
import { useConfigurationStore } from '../../../stores/ide/configurationStore';
import { SettingsRegistry } from '../../../lib/registries/SettingsRegistry';
import { SettingGroup } from './SettingGroup';

export const SettingsContent: React.FC = () => {
  const { activeCategory, searchQuery, filteredProperties } = useConfigurationStore();

  const content = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      if (filteredProperties.length === 0) {
        return <div className="text-ide-muted">No settings found.</div>;
      }
      return <SettingGroup title="Search Results" properties={filteredProperties} />;
    }

    if (!activeCategory) {
      return null;
    }

    const node = SettingsRegistry.getNodes().find((n) => n.id === activeCategory);
    if (!node) {
      return null;
    }

    return (
      <>
        <h2 className="text-2xl font-semibold mb-6">{node.title}</h2>
        <SettingGroup properties={node.properties} />
      </>
    );
  }, [activeCategory, searchQuery, filteredProperties]);

  return <div className="max-w-4xl mx-auto">{content}</div>;
};
