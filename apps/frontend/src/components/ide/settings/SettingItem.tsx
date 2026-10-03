import React, { useState, useEffect } from 'react';
import { IConfigurationPropertySchema } from '../../../lib/config/ConfigurationSchema';
import { SettingRendererRegistry } from '../../../lib/registries/SettingRendererRegistry';
import { ConfigurationManager } from '../../../services/config/ConfigurationManager';
import { systemEventBus } from '../../../lib/events/SystemEvents';
import { ConfigurationEvents } from '../../../lib/config/ConfigurationEvents';

interface SettingItemProps {
  schema: IConfigurationPropertySchema;
}

export const SettingItem: React.FC<SettingItemProps> = ({ schema }) => {
  const [value, setValue] = useState<any>(schema.defaultValue);
  const Renderer = SettingRendererRegistry.getRenderer(schema.type);

  useEffect(() => {
    // Initial fetch
    setValue(ConfigurationManager.get(schema.id, schema.defaultValue));

    // Listen for external updates
    const unsubscribe = systemEventBus.on(ConfigurationEvents.ConfigurationChanged, (payload) => {
      if (payload && payload.key === schema.id) {
        // payload.value might be undefined on reset, fallback to default
        setValue(payload.value !== undefined ? payload.value : schema.defaultValue);
      }
    });

    return () => unsubscribe();
  }, [schema]);

  const handleChange = async (newValue: any) => {
    try {
      await ConfigurationManager.set(schema.id, newValue);
      setValue(newValue); // Optimistic UI update, true source of truth relies on event bus above
    } catch (err) {
      console.error('Failed to set configuration:', err);
      // Revert if failed
      setValue(ConfigurationManager.get(schema.id, schema.defaultValue));
    }
  };

  const handleReset = async () => {
    try {
      await ConfigurationManager.reset(schema.id);
      setValue(schema.defaultValue);
    } catch (err) {
      console.error('Failed to reset configuration:', err);
    }
  };

  if (!Renderer) {
    return <div className="text-red-500">No renderer found for type: {schema.type}</div>;
  }

  return (
    <div className="flex flex-col py-2 border-b border-ide-border border-opacity-30">
      <div className="flex justify-between items-start mb-1">
        <label className="text-sm font-medium">{schema.title || schema.id}</label>
      </div>
      <p className="text-xs text-ide-muted mb-3">{schema.description}</p>
      <div className="w-full max-w-sm">
        <Renderer schema={schema} value={value} onChange={handleChange} onReset={handleReset} />
      </div>
    </div>
  );
};
