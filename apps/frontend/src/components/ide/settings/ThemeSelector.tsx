import React from 'react';
import { ThemeRegistry } from '../../../lib/registries/ThemeRegistry';
import { useThemeStore } from '../../../stores/ide/themeStore';
import { ThemeManager } from '../../../services/config/ThemeManager';

export const ThemeSelector: React.FC = () => {
  const themes = ThemeRegistry.getAllThemes();
  const { workbenchThemeId } = useThemeStore();

  const handleSwitch = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const manager = new ThemeManager();
    await manager.setTheme(e.target.value, 'workbench');
  };

  return (
    <div className="flex items-center space-x-2">
      <label className="text-sm font-medium">Theme:</label>
      <select
        value={workbenchThemeId}
        onChange={handleSwitch}
        className="px-2 py-1 text-sm bg-ide-background border border-ide-border rounded focus:outline-none focus:border-ide-accent text-ide-foreground"
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
};
