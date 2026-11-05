import { IConfigurationNode, IConfigurationPropertySchema } from '../config/ConfigurationSchema';

export class SettingsRegistry {
  private static nodes: Map<string, IConfigurationNode> = new Map();

  static has(id: string): boolean {
    return this.nodes.has(id);
  }

  static get(id: string): IConfigurationNode | undefined {
    return this.nodes.get(id);
  }

  static register(node: IConfigurationNode): void {
    const existing = this.nodes.get(node.id);
    if (existing) {
      if (this.isEqual(existing, node)) {
        return; // Safely ignore identical registrations
      }
      throw new Error(
        `SettingsNode with id ${node.id} is already registered with a different schema.`
      );
    }
    this.nodes.set(node.id, node);
  }

  static replace(node: IConfigurationNode): void {
    this.nodes.set(node.id, node);
  }

  static unregister(id: string): boolean {
    return this.nodes.delete(id);
  }

  static reset(): void {
    if (process.env.NODE_ENV === 'development') {
      this.nodes.clear();
    }
  }

  private static isEqual(a: IConfigurationNode, b: IConfigurationNode): boolean {
    if (a.id !== b.id || a.title !== b.title) return false;
    if (a.properties.length !== b.properties.length) return false;

    // Check if all properties match
    for (let i = 0; i < a.properties.length; i++) {
      const propA = a.properties[i];
      const propB = b.properties[i];

      if (
        propA.id !== propB.id ||
        propA.type !== propB.type ||
        propA.category !== propB.category ||
        propA.scope !== propB.scope ||
        propA.defaultValue !== propB.defaultValue
      ) {
        return false;
      }
    }
    return true;
  }

  static getNodes(): IConfigurationNode[] {
    return Array.from(this.nodes.values());
  }

  static getAllProperties(): IConfigurationPropertySchema[] {
    const properties: IConfigurationPropertySchema[] = [];
    this.nodes.forEach((node) => {
      properties.push(...node.properties);
    });
    return properties;
  }

  static getProperty(id: string): IConfigurationPropertySchema | undefined {
    const nodesArray = Array.from(this.nodes.values());
    for (const node of nodesArray) {
      const prop = node.properties.find((p) => p.id === id);
      if (prop) return prop;
    }
    return undefined;
  }
}
