import { ToolContext } from './ToolContext';
import { ToolPermission } from './ToolPermission';

export interface Tool {
  id: string;
  name: string;
  description: string;
  requiredPermissions: ToolPermission[];
  
  schema(): any;
  validate(args: any): boolean;
  describe(args: any): string;
  execute(context: ToolContext, args: any): Promise<any>;
}
