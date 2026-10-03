export interface WorkspaceExternalEvent {
  id: string;
  type: "created" | "modified" | "deleted" | "renamed" | "reconnected";
  path: string;
  timestamp: number;
  source: "filesystem" | "git" | "agent";
  mutationId?: string;
}
