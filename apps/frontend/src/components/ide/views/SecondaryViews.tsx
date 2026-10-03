import React from 'react';
import { ViewRegistry } from '../../../lib/registries/ViewRegistry';
import { Bot, MessageSquare, ListTodo, Brain, FileSearch, TerminalSquare } from 'lucide-react';

export function AIChatView() { return <div className="p-4 text-sm text-muted-foreground">AI Chat Context</div>; }
export function AgentTasksView() { return <div className="p-4 text-sm text-muted-foreground">Agent Tasks Context</div>; }
export function MemoryView() { return <div className="p-4 text-sm text-muted-foreground">Memory Context</div>; }
export function PlanningView() { return <div className="p-4 text-sm text-muted-foreground">Planning Context</div>; }
export function ContextView() { return <div className="p-4 text-sm text-muted-foreground">Active Context</div>; }
export function LogsView() { return <div className="p-4 text-sm text-muted-foreground">Agent Logs</div>; }

export function registerSecondaryViews() {
  ViewRegistry.register({
    id: 'ai-chat',
    title: 'AI Chat',
    icon: MessageSquare,
    placement: 'secondary',
    component: AIChatView,
  });

  ViewRegistry.register({
    id: 'agent-tasks',
    title: 'Agent Tasks',
    icon: Bot,
    placement: 'secondary',
    component: AgentTasksView,
  });

  ViewRegistry.register({
    id: 'planning',
    title: 'Planning',
    icon: ListTodo,
    placement: 'secondary',
    component: PlanningView,
  });

  ViewRegistry.register({
    id: 'context',
    title: 'Context',
    icon: FileSearch,
    placement: 'secondary',
    component: ContextView,
  });

  ViewRegistry.register({
    id: 'memory',
    title: 'Memory',
    icon: Brain,
    placement: 'secondary',
    component: MemoryView,
  });

  ViewRegistry.register({
    id: 'logs',
    title: 'Logs',
    icon: TerminalSquare,
    placement: 'secondary',
    component: LogsView,
  });
}
