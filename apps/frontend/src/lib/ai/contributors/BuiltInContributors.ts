import { PromptContributor } from '../PromptBuilder';
import { AIMessagePayload } from '../../../platform/ai/AIProvider';

export class WorkspaceContributor implements PromptContributor {
  id = 'workspace_contributor';
  priority = 10;

  async contribute(context: any): Promise<AIMessagePayload[]> {
    // Stub: Would query WorkspaceManager for summary
    return [{ role: 'system', content: 'Workspace Root: /stub/workspace' }];
  }
}

export class EditorSelectionContributor implements PromptContributor {
  id = 'editor_selection_contributor';
  priority = 20;

  async contribute(context: any): Promise<AIMessagePayload[]> {
    // Stub: Would query EditorManager
    return [];
  }
}

export class GitContributor implements PromptContributor {
  id = 'git_contributor';
  priority = 30;

  async contribute(context: any): Promise<AIMessagePayload[]> {
    // Stub: Would query GitManager
    return [];
  }
}

export class DiagnosticsContributor implements PromptContributor {
  id = 'diagnostics_contributor';
  priority = 40;

  async contribute(context: any): Promise<AIMessagePayload[]> {
    // Stub: Would query LanguageService for problems
    return [];
  }
}
