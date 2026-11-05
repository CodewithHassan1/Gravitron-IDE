import { ToolRegistry } from '../../tools/ToolRegistry';
import { ToolExecutor } from '../../tools/ToolExecutor';

export class ToolManager {
  getTools() {
    return ToolRegistry.getAll();
  }

  getToolSchemas() {
    return this.getTools().map((t) => t.schema());
  }
}
