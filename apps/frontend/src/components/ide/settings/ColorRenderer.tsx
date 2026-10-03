import React from 'react';
import { ISettingRendererProps } from '../../../lib/registries/SettingRendererRegistry';

export const ColorRenderer: React.FC<ISettingRendererProps> = ({ value, onChange }) => {
  return (
    <div className="flex items-center space-x-2">
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border-none p-0"
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-sm bg-ide-background border border-ide-border rounded focus:outline-none focus:border-ide-accent text-ide-foreground"
      />
    </div>
  );
};
