import React, { useEffect, useState, useRef } from 'react';
import { useAgentStore } from '../../../stores/useAgentStore';
import { AgentManager } from '../../../services/ai/AgentManager';
import { AgentProtocol } from '@ag/protocol';
import { useWorkspaceStore } from '../../../stores/workspace';
import './AIChatPanel.css'; // Assume basic CSS

const agentManager = new AgentManager();

export function AIChatPanel() {
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId);
  const { agentId, state, processEvent, applySnapshot, clear } = useAgentStore();

  useEffect(() => {
    agentManager.onEvent((event) => {
      processEvent(event);
    });

    // Reattachment logic
    if (activeWorkspaceId && agentId) {
      agentManager.snapshot(agentId).then(snapshot => {
        if (snapshot) {
          applySnapshot(snapshot);
        }
      });
    }

    return () => {
      agentManager.onEvent(() => {});
    };
  }, [agentId, activeWorkspaceId, processEvent, applySnapshot]);

  const handleStart = async (prompt: string) => {
    if (!activeWorkspaceId) return;
    try {
      const newAgentId = await agentManager.startAgent(
        activeWorkspaceId,
        crypto.randomUUID(), // New conversation
        prompt,
        'anthropic',
        {}
      );
      // Wait for events to populate it
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancel = () => {
    if (agentId) {
      agentManager.cancelAgent(agentId);
    }
  };

  const handleApproveTool = (approvalId: string, toolCallId: string, approved: boolean) => {
    if (agentId) {
      agentManager.approveTool(agentId, approvalId, toolCallId, approved);
    }
  };

  return (
    <div className="ai-chat-panel flex flex-col h-full bg-[var(--background-secondary)] text-[var(--text-primary)]">
      <div className="flex-1 overflow-auto p-4">
        <ConversationList />
        {state === AgentProtocol.AgentState.AwaitingApproval && (
          <ApprovalBanner onApprove={handleApproveTool} />
        )}
        <AgentStatus state={state} onCancel={handleCancel} />
      </div>
      <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--background-primary)]">
        <MessageInput onSend={handleStart} disabled={state !== AgentProtocol.AgentState.Idle && state !== AgentProtocol.AgentState.Completed && state !== AgentProtocol.AgentState.Failed && state !== AgentProtocol.AgentState.Cancelled} />
      </div>
    </div>
  );
}

export function ConversationList() {
  const displayMessages = useAgentStore(s => s.displayMessages);
  
  return (
    <div className="flex flex-col space-y-4 mb-4">
      {displayMessages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}

export function MessageBubble({ message }: { message: AgentProtocol.DisplayMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex flex-col max-w-[85%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}>
      <div className={`p-3 rounded-lg text-sm ${
        isUser 
          ? 'bg-[var(--accent-primary)] text-white rounded-br-none' 
          : message.role === 'tool' 
            ? 'bg-[var(--background-tertiary)] font-mono text-xs' 
            : 'bg-[var(--background-primary)] border border-[var(--border-primary)] rounded-bl-none'
      }`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.toolCalls && message.toolCalls.map(tc => (
          <div key={tc.id} className="mt-2 p-2 bg-[var(--background-tertiary)] rounded text-xs font-mono">
            <strong>Tool Call:</strong> {tc.name}
            <pre className="mt-1 overflow-auto max-h-32 text-gray-400">{JSON.stringify(tc.arguments, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApprovalBanner({ onApprove }: { onApprove: (approvalId: string, toolCallId: string, approved: boolean) => void }) {
  const pendingApproval = useAgentStore(s => s.pendingApproval);
  if (!pendingApproval) return null;

  return (
    <div className="bg-[var(--warning-background)] border border-[var(--warning-border)] p-4 rounded-md mt-4 shadow-lg">
      <h3 className="font-semibold text-[var(--warning-text)] mb-2 flex items-center">
        <span className="mr-2">⚠️</span> Tool Approval Required
      </h3>
      <div className="text-sm mb-4">
        <p className="mb-2">The agent wants to execute a potentially destructive tool:</p>
        <div className="bg-[var(--background-primary)] p-2 rounded font-mono text-xs overflow-auto max-h-40 border border-[var(--border-primary)]">
          <div className="font-bold text-[var(--accent-primary)] mb-1">{pendingApproval.toolName}</div>
          <pre>{JSON.stringify(pendingApproval.arguments, null, 2)}</pre>
        </div>
      </div>
      <div className="flex space-x-2">
        <button 
          className="px-4 py-2 bg-[var(--background-tertiary)] hover:bg-[var(--background-secondary)] rounded transition-colors text-sm font-medium"
          onClick={() => onApprove(pendingApproval.approvalId, pendingApproval.toolCallId, false)}
        >
          Reject
        </button>
        <button 
          className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-blue-600 text-white rounded transition-colors text-sm font-medium"
          onClick={() => onApprove(pendingApproval.approvalId, pendingApproval.toolCallId, true)}
        >
          Approve
        </button>
      </div>
    </div>
  );
}

export function AgentStatus({ state, onCancel }: { state: AgentProtocol.AgentState, onCancel: () => void }) {
  if (state === AgentProtocol.AgentState.Idle || state === AgentProtocol.AgentState.Completed || state === AgentProtocol.AgentState.Cancelled || state === AgentProtocol.AgentState.Failed) {
    return null;
  }

  return (
    <div className="flex items-center space-x-3 text-sm text-[var(--text-secondary)] mt-4 p-2 bg-[var(--background-primary)] rounded border border-[var(--border-primary)] inline-block">
      <div className="animate-spin h-4 w-4 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
      <span>{state}...</span>
      <button 
        onClick={onCancel}
        className="ml-auto text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-[var(--background-tertiary)] text-xs transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

export function MessageInput({ onSend, disabled }: { onSend: (val: string) => void, disabled: boolean }) {
  const [val, setVal] = useState('');
  const addUserMessage = useAgentStore(s => s.addUserMessage);

  const handleSend = () => {
    if (val.trim() && !disabled) {
      addUserMessage(val);
      onSend(val);
      setVal('');
    }
  };

  return (
    <div className="flex flex-col relative group">
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Ask the agent to build something..."
        className="w-full bg-[var(--background-tertiary)] text-[var(--text-primary)] rounded-lg p-3 pr-12 min-h-[60px] max-h-[200px] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] border border-transparent transition-all shadow-inner disabled:opacity-50"
        disabled={disabled}
      />
      <button 
        onClick={handleSend}
        disabled={disabled || !val.trim()}
        className="absolute right-2 bottom-2 p-1.5 text-white bg-[var(--accent-primary)] rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:bg-gray-600 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    </div>
  );
}
