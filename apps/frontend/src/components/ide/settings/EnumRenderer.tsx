import React from 'react';
import { ISettingRendererProps } from '../../../lib/registries/SettingRendererRegistry';

export const EnumRenderer: React.FC<ISettingRendererProps> = ({ schema, value, onChange }) => {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 text-sm bg-ide-background border border-ide-border rounded focus:outline-none focus:border-ide-accent text-ide-foreground"
    >
      {schema.enum?.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
};
