import React from 'react';
import { SettingsRegistry } from '../../../lib/registries/SettingsRegistry';
import { useConfigurationStore } from '../../../stores/ide/configurationStore';

export const SettingsSidebar: React.FC = () => {
  const nodes = SettingsRegistry.getNodes();
  const { activeCategory, setActiveCategory } = useConfigurationStore();

  return (
    <nav className="flex flex-col space-y-1 p-2">
      {nodes.map((node) => (
        <button
          key={node.id}
          onClick={() => setActiveCategory(node.id)}
          className={`flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
            activeCategory === node.id
              ? 'bg-ide-accent text-ide-accent-foreground'
              : 'text-ide-foreground hover:bg-ide-accent/50'
          }`}
        >
          {node.title}
        </button>
      ))}
    </nav>
  );
};
