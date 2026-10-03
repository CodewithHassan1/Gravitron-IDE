import React from 'react';
import { IConfigurationPropertySchema } from '../../../lib/config/ConfigurationSchema';
import { SettingItem } from './SettingItem';

interface SettingGroupProps {
  title?: string;
  properties: IConfigurationPropertySchema[];
}

export const SettingGroup: React.FC<SettingGroupProps> = ({ title, properties }) => {
  return (
    <div className="mb-8">
      {title && <h3 className="text-lg font-medium mb-4">{title}</h3>}
      <div className="space-y-6">
        {properties.map((prop) => (
          <SettingItem key={prop.id} schema={prop} />
        ))}
      </div>
    </div>
  );
};
