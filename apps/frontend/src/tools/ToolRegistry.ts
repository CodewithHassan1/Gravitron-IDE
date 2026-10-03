import { Tool } from './Tool';

class ToolRegistryImpl {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.id, tool);
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }
}

export const ToolRegistry = new ToolRegistryImpl();
