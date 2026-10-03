import React from 'react';
import { IConfigurationPropertySchema } from '../config/ConfigurationSchema';

export interface ISettingRendererProps {
  schema: IConfigurationPropertySchema;
  value: any;
  onChange: (value: any) => void;
  onReset: () => void;
}

export type SettingRenderer = React.ComponentType<ISettingRendererProps>;

export class SettingRendererRegistry {
  private static renderers: Map<string, SettingRenderer> = new Map();

  static register(type: string, renderer: SettingRenderer): void {
    this.renderers.set(type, renderer);
  }

  static getRenderer(type: string): SettingRenderer | undefined {
    return this.renderers.get(type);
  }
}
