import React from 'react';
import { ISettingRendererProps } from '../../../lib/registries/SettingRendererRegistry';

export const NumberRenderer: React.FC<ISettingRendererProps> = ({ value, onChange }) => {
  return (
    <input
      type="number"
      value={value || 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full px-2 py-1 text-sm bg-ide-background border border-ide-border rounded focus:outline-none focus:border-ide-accent text-ide-foreground"
    />
  );
};
