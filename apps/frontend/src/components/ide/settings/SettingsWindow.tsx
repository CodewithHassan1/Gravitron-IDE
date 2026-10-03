import React, { useEffect } from 'react';
import { SettingsSidebar } from './SettingsSidebar';
import { SettingsContent } from './SettingsContent';
import { SettingsSearch } from './SettingsSearch';
import { useConfigurationStore } from '../../../stores/ide/configurationStore';
import { SettingsRegistry } from '../../../lib/registries/SettingsRegistry';

export const SettingsWindow: React.FC = () => {
  const { setActiveCategory } = useConfigurationStore();

  useEffect(() => {
    // Select the first category by default if none is selected
    const nodes = SettingsRegistry.getNodes();
    if (nodes.length > 0) {
      setActiveCategory(nodes[0].id);
    }
  }, [setActiveCategory]);

  return (
    <div className="flex h-full w-full bg-ide-background text-ide-foreground">
      <div className="w-64 border-r border-ide-border flex flex-col">
        <div className="p-4 border-b border-ide-border">
          <SettingsSearch />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SettingsSidebar />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <SettingsContent />
      </div>
    </div>
  );
};
