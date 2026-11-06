import { ConfigurationScope } from './ConfigurationScopes';

export type ConfigurationType =
  'boolean' | 'number' | 'string' | 'enum' | 'array' | 'object' | 'color' | 'keybinding';

export interface IConfigurationPropertySchema {
  id: string; // e.g. "editor.fontSize"
  type: ConfigurationType;
  title: string;
  description: string;
  category: string; // e.g. "Editor"
  scope: ConfigurationScope;
  defaultValue: any;
  enum?: string[]; // Allowed values if type is 'enum'
  tags?: string[];
  deprecated?: boolean;
  experimental?: boolean;
  validator?: (value: any) => boolean | string; // Returns true if valid, or string error message
}

export interface IConfigurationNode {
  id: string;
  title: string;
  properties: IConfigurationPropertySchema[];
}

export interface IConfigurationRecord {
  id: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
  scope: ConfigurationScope;
  checksum?: string;
  values: Record<string, any>;
}
