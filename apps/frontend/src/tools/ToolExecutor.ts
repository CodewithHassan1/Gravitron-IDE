import { ToolRegistry } from './ToolRegistry';
import { ToolContext } from './ToolContext';
import { GlobalAIEvents, AIEventType } from '../lib/ai/AIEvents';

export class ToolExecutor {
  static async execute(toolId: string, context: ToolContext, args: any): Promise<any> {
    const tool = ToolRegistry.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);

    // Verify permissions
    for (const perm of tool.requiredPermissions) {
      if (!context.permissionsGranted.has(perm)) {
        throw new Error(`Permission Denied: Missing ${perm}`);
      }
    }

    if (!tool.validate(args)) {
      throw new Error(`Invalid arguments for tool ${toolId}`);
    }

    GlobalAIEvents.emit(AIEventType.ToolStarted, { toolId, args });

    try {
      const result = await tool.execute(context, args);
      GlobalAIEvents.emit(AIEventType.ToolFinished, { toolId, result });
      return result;
    } catch (err: any) {
      GlobalAIEvents.emit(AIEventType.ToolFailed, { toolId, error: err.message });
      throw err;
    }
  }
}
