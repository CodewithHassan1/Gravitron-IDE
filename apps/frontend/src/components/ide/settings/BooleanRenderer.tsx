import React from 'react';
import { ISettingRendererProps } from '../../../lib/registries/SettingRendererRegistry';

export const BooleanRenderer: React.FC<ISettingRendererProps> = ({ value, onChange }) => {
  return (
    <input
      type="checkbox"
      checked={!!value}
      onChange={(e) => onChange(e.target.checked)}
      className="form-checkbox h-4 w-4 text-ide-accent rounded border-ide-border focus:ring-ide-accent"
    />
  );
};
