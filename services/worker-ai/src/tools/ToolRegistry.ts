import { ToolImplementation } from './AgentTool';
import { ToolNotFound, ToolInputValidationFailed } from './errors';
import Ajv from 'ajv';

export class ToolRegistry {
  private tools = new Map<string, ToolImplementation>();
  private ajv = new Ajv();

  public register(tool: ToolImplementation): void {
    this.tools.set(tool.definition.name, tool);
    // Pre-compile schema for performance and early error detection
    this.ajv.addSchema(tool.definition.inputSchema, tool.definition.name);
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
      const errors = validate.errors?.map((err) => `${err.instancePath} ${err.message}`) || ['Unknown validation error'];
      throw new ToolInputValidationFailed(toolName, errors);
    }
    
    return args; // args might be mutated if defaults are applied by ajv
  }

  public getDefinitions() {
    return Array.from(this.tools.values()).map(t => t.definition);
  }
}
