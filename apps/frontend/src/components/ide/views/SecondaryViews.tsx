import React from 'react';
import { ViewRegistry } from '../../../lib/registries/ViewRegistry';
import {
  Bot,
  MessageSquare,
  ListTodo,
  Brain,
  FileSearch,
  TerminalSquare,
  Sparkles,
  Activity,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { AIChatPanel } from '../ai/AIChatPanel';
import { useAgentStore } from '../../../stores/useAgentStore';
import { useWorkspaceStore } from '../../../stores/workspace';
import { useLayoutStore } from '../../../stores/ide/layoutStore';
import { AgentProtocol } from '@ag/protocol';

export function AIChatView() {
  return <AIChatPanel />;
}

export function AgentTasksView() {
  const { agentId, state, displayMessages } = useAgentStore();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveSecondaryActivity = useLayoutStore((s) => s.setActiveSecondaryActivity);

  const userMessages = displayMessages.filter((m) => m.role === 'user');
  const toolCallsCount = displayMessages.reduce(
    (acc, m) => acc + (m.toolCalls ? m.toolCalls.length : 0),
    0
  );

  return (
    <div className="p-4 space-y-4 text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <h4 className="font-semibold text-foreground flex items-center space-x-1.5">
          <ListTodo className="w-4 h-4 text-primary" />
          <span>Active Agent Task</span>
        </h4>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            state === AgentProtocol.AgentState.Idle
              ? 'bg-muted text-muted-foreground'
              : state === AgentProtocol.AgentState.Completed
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : state === AgentProtocol.AgentState.Failed
                  ? 'bg-red-950 text-red-300 border border-red-800'
                  : 'bg-primary/20 text-primary border border-primary/30 animate-pulse'
          }`}
        >
          {state}
        </span>
      </div>

      <div className="space-y-2 bg-card p-3 rounded-lg border border-border/60">
        <div className="flex justify-between py-1 border-b border-border/30">
          <span className="text-muted-foreground">Session ID:</span>
          <span className="font-mono text-[11px] text-foreground">
            {agentId ? `${agentId.slice(0, 12)}...` : 'None'}
          </span>
        </div>
        <div className="flex justify-between py-1 border-b border-border/30">
          <span className="text-muted-foreground">Workspace ID:</span>
          <span className="font-mono text-[11px] text-foreground truncate max-w-[140px]">
            {activeWorkspaceId || 'No workspace'}
          </span>
        </div>
        <div className="flex justify-between py-1 border-b border-border/30">
          <span className="text-muted-foreground">User Prompts:</span>
          <span className="font-medium text-foreground">{userMessages.length}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-muted-foreground">Tool Executions:</span>
          <span className="font-medium text-foreground">{toolCallsCount}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h5 className="font-semibold text-foreground text-[11px]">Task History</h5>
        {userMessages.length === 0 ? (
          <p className="text-muted-foreground italic">No tasks submitted in current session.</p>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {userMessages.map((m, i) => (
              <div
                key={m.id || i}
                onClick={() => setActiveSecondaryActivity('ai-chat')}
                className="p-2.5 rounded bg-muted/40 hover:bg-muted/70 cursor-pointer border border-border/40 transition-colors"
              >
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Task #{i + 1}</span>
                  <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-foreground line-clamp-2">{m.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setActiveSecondaryActivity('ai-chat')}
        className="w-full py-1.5 px-3 rounded bg-primary/10 hover:bg-primary/20 text-primary font-medium text-center transition-colors border border-primary/20"
      >
        Open AI Chat Panel
      </button>
    </div>
  );
}

export function PlanningView() {
  const { state, specialistActivities, pendingApproval } = useAgentStore();
  const setActiveSecondaryActivity = useLayoutStore((s) => s.setActiveSecondaryActivity);

  return (
    <div className="p-4 space-y-4 text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <h4 className="font-semibold text-foreground flex items-center space-x-1.5">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>Agent Planning & Specialists</span>
        </h4>
      </div>

      {pendingApproval && (
        <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 space-y-2">
          <div className="flex items-center space-x-1.5 text-amber-300 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Pending Tool Approval</span>
          </div>
          <div className="font-mono text-[11px] text-amber-200">{pendingApproval.toolName}</div>
          <button
            onClick={() => setActiveSecondaryActivity('ai-chat')}
            className="text-[11px] font-medium text-amber-400 hover:text-amber-300 underline"
          >
            Review & Approve in Chat &rarr;
          </button>
        </div>
      )}

      <div className="space-y-2">
        <h5 className="font-semibold text-foreground text-[11px]">Specialist Consultations</h5>
        {(!specialistActivities || specialistActivities.length === 0) ? (
          <div className="p-4 rounded-lg bg-card border border-border/60 text-center text-muted-foreground">
            <Brain className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>No specialist consultations requested yet.</p>
            <p className="text-[10px] mt-1 text-muted-foreground/80">
              The agent will dynamically orchestrate AgentRouter specialists as needed.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {specialistActivities.map((act, i) => (
              <div
                key={i}
                className="p-2.5 rounded-lg bg-card border border-border/60 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-foreground">
                    {act.specialistName}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      act.status === 'completed'
                        ? 'bg-emerald-950 text-emerald-300'
                        : act.status === 'running'
                          ? 'bg-blue-950 text-blue-300 animate-pulse'
                          : 'bg-red-950 text-red-300'
                    }`}
                  >
                    {act.status}
                  </span>
                </div>
                {act.reason && <p className="text-muted-foreground">{act.reason}</p>}
                {act.evaluation && (
                  <div className="text-[10px] font-semibold text-emerald-400">
                    Evaluation: {act.evaluation}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ContextView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  return (
    <div className="p-4 space-y-4 text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <h4 className="font-semibold text-foreground flex items-center space-x-1.5">
          <FileSearch className="w-4 h-4 text-primary" />
          <span>Agent Context & Capabilities</span>
        </h4>
      </div>

      <div className="space-y-2 bg-card p-3 rounded-lg border border-border/60">
        <h5 className="font-semibold text-foreground text-[11px] flex items-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Security & Isolation</span>
        </h5>
        <div className="text-muted-foreground space-y-1 text-[11px]">
          <div>• Workspace boundary enforcement (M8)</div>
          <div>• Path traversal protection</div>
          <div>• Ephemeral JWT execution delegation</div>
          <div>• Destructive command approval gating</div>
        </div>
      </div>

      <div className="space-y-2 bg-card p-3 rounded-lg border border-border/60">
        <h5 className="font-semibold text-foreground text-[11px]">Registered Tool Capabilities</h5>
        <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>read_file</span>
            <span className="text-emerald-400 text-[10px]">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span>write_file</span>
            <span className="text-amber-400 text-[10px]">Approval Gated</span>
          </div>
          <div className="flex items-center justify-between">
            <span>execute_command</span>
            <span className="text-amber-400 text-[10px]">Approval Gated</span>
          </div>
          <div className="flex items-center justify-between">
            <span>repository_map</span>
            <span className="text-emerald-400 text-[10px]">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span>agent_router_specialist</span>
            <span className="text-sky-400 text-[10px]">MCP Anonymous</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MemoryView() {
  const { displayMessages, lastSequence, clear } = useAgentStore();

  return (
    <div className="p-4 space-y-4 text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <h4 className="font-semibold text-foreground flex items-center space-x-1.5">
          <Brain className="w-4 h-4 text-primary" />
          <span>Conversation Memory</span>
        </h4>
        <button
          onClick={clear}
          title="Reset conversation memory"
          className="flex items-center space-x-1 text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="text-[10px]">Reset</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-card border border-border/60 text-center">
          <div className="text-lg font-bold text-foreground">{displayMessages.length}</div>
          <div className="text-[10px] text-muted-foreground">Messages in Context</div>
        </div>
        <div className="p-3 rounded-lg bg-card border border-border/60 text-center">
          <div className="text-lg font-bold text-foreground">{lastSequence}</div>
          <div className="text-[10px] text-muted-foreground">Event Sequence</div>
        </div>
      </div>

      <div className="space-y-2">
        <h5 className="font-semibold text-foreground text-[11px]">Recent Context Elements</h5>
        {displayMessages.length === 0 ? (
          <p className="text-muted-foreground italic">Memory is currently empty.</p>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {displayMessages.slice(-8).map((m, i) => (
              <div key={m.id || i} className="p-2 rounded bg-muted/40 border border-border/40 text-[11px]">
                <span className="font-semibold uppercase text-[10px] text-primary mr-1.5">
                  [{m.role}]
                </span>
                <span className="text-foreground line-clamp-1">{m.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LogsView() {
  const { displayMessages, specialistActivities } = useAgentStore();

  return (
    <div className="p-4 space-y-4 text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <h4 className="font-semibold text-foreground flex items-center space-x-1.5">
          <TerminalSquare className="w-4 h-4 text-primary" />
          <span>Agent Activity Logs</span>
        </h4>
      </div>

      <div className="space-y-1.5 font-mono text-[11px] bg-background/80 p-2 rounded-lg border border-border/60 max-h-[420px] overflow-y-auto">
        {displayMessages.length === 0 && (!specialistActivities || specialistActivities.length === 0) ? (
          <div className="text-muted-foreground italic p-2">No activity logged yet.</div>
        ) : (
          <>
            {displayMessages.map((m, i) => (
              <div key={m.id || i} className="py-1 border-b border-border/20 flex items-start space-x-2">
                <span className="text-muted-foreground text-[10px] shrink-0">
                  {new Date(m.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-sky-400 font-semibold shrink-0">[{m.role}]</span>
                <span className="text-foreground truncate">{m.content.slice(0, 80)}...</span>
              </div>
            ))}
            {specialistActivities?.map((s, i) => (
              <div key={`spec-${i}`} className="py-1 border-b border-border/20 flex items-start space-x-2">
                <span className="text-emerald-400 font-semibold shrink-0">[specialist]</span>
                <span className="text-foreground">{s.specialistName}: {s.status}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

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
