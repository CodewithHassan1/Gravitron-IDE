import { ToolImplementation } from './AgentTool';
import { ToolNotFound, ToolInputValidationFailed } from './errors';
import Ajv from 'ajv';

export class ToolRegistry {
  private tools = new Map<string, ToolImplementation>();
  private ajv = new Ajv();

  public register(tool: ToolImplementation): void {
    this.tools.set(tool.definition.name, tool);
    // Remove previous schema if replacing, then compile for performance
    this.ajv.removeSchema(tool.definition.name);
    this.ajv.addSchema(tool.definition.inputSchema, tool.definition.name);
  }

  public unregister(name: string): boolean {
    const deleted = this.tools.delete(name);
    this.ajv.removeSchema(name);
    return deleted;
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public getTool(name: string): ToolImplementation {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFound(name);
    }
    return tool;
  }

  public validateArguments(toolName: string, args: any): any {
    const validate = this.ajv.getSchema(toolName);
    if (!validate) {
      // Fallback if schema wasn't pre-compiled (shouldn't happen with register)
      const tool = this.getTool(toolName);
      this.ajv.addSchema(tool.definition.inputSchema, toolName);
      return this.validateArguments(toolName, args);
    }

    const isValid = validate(args);
    if (!isValid) {
      const errors = validate.errors?.map((err) => `${err.instancePath} ${err.message}`) || [
        'Unknown validation error',
      ];
      throw new ToolInputValidationFailed(toolName, errors);
    }

    return args; // args might be mutated if defaults are applied by ajv
  }

  public getDefinitions() {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }
}
