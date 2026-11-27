import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAgentStore } from '../../../stores/useAgentStore';
import { useAuthStore } from '../../../stores/auth';
import { AgentManager } from '../../../services/ai/AgentManager';
import { AgentProtocol } from '@ag/protocol';
import { WorkspaceManager } from '../../../services/workspace/WorkspaceManager';
import { WorkspaceSession } from '../../../services/workspace/WorkspaceSession';
import { WorkspaceEvents } from '../../../services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../../services/workspace/types';
import { useLayoutStore } from '../../../stores/ide/layoutStore';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { CommandExecutionCard, formatDurationReadable } from './CommandExecutionCard';
import {
  PanelLeft,
  Search,
  MoreVertical,
  Plus,
  Columns,
  ChevronRight,
  ChevronDown,
  FileCode,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  Square,
  Sparkles,
  AlertTriangle,
  Terminal,
  FolderTree,
  GitBranch,
  Wrench,
  Pencil,
  Pin,
  Archive,
  Settings,
  PanelRight,
  PanelBottom,
  MessageSquare,
  X,
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  ListChecks,
  Cpu,
} from 'lucide-react';

const DEFAULT_MODELS: Record<AgentProtocol.SupportedProviderType, string[]> = {
  gemini: [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.1-pro-preview',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-haiku-20241022',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
};

const MODEL_FRIENDLY_NAMES: Record<string, string> = {
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  o1: 'OpenAI o1',
  'o3-mini': 'OpenAI o3-mini',
};

// Helper to reliably resolve the active workspace ID
function getResolvedWorkspaceId(): string {
  try {
    const fromWm = WorkspaceManager?.getActiveWorkspaceId?.();
    if (fromWm) return fromWm;
  } catch {}

  try {
    const fromSession = WorkspaceSession?.getWorkspaceId?.();
    if (fromSession) return fromSession;
  } catch {}

  if (typeof window !== 'undefined' && window.location) {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('id') || params.get('workspaceId');
      if (urlId) return urlId;
    } catch {}
  }

  try {
    const layoutId = useLayoutStore.getState().currentWorkspaceId;
    if (layoutId && layoutId !== 'default') return layoutId;
  } catch {}

  return 'default';
}

export function AIChatPanel() {
  const router = useRouter();
  const {
    agentId,
    state,
    statusReason,
    activeToolName,
    lastError,
    plan,
    displayMessages,
    specialistActivities,
    commandExecutions,
    commandExecutionOrder,
    processEvent,
    applySnapshot,
    beginRun,
    setError,
    clear,
  } = useAgentStore();

  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleBottomPanel = useLayoutStore((s) => s.toggleBottomPanel);
  const setSecondarySidebarOpen = useLayoutStore((s) => s.setSecondarySidebarOpen);

  const [agentManager, setAgentManager] = useState<AgentManager | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('default');

  const [selectedProvider, setSelectedProvider] =
    useState<AgentProtocol.SupportedProviderType>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash');

  // UI state toggles matching user images
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<'split' | 'copy' | null>(null);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);

  // Title rename & pin state
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  // Reaction feedback state (thumbs up/down per message)
  const [reactions, setReactions] = useState<Record<string, 'up' | 'down'>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Right-click context menu state (Cut / Copy / Paste)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetEl: HTMLInputElement | HTMLTextAreaElement | null;
    selectionStart: number;
    selectionEnd: number;
    selectedText: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Resolve active workspace dynamically on mount and on workspace events
  useEffect(() => {
    const updateWorkspace = () => {
      const id = getResolvedWorkspaceId();
      setActiveWorkspaceId(id);
    };

    updateWorkspace();
    const unsubOpened = WorkspaceEvents.on(WorkspaceEventType.WorkspaceOpened, updateWorkspace);
    const unsubUpdated = WorkspaceEvents.on(WorkspaceEventType.WorkspaceUpdated, updateWorkspace);

    return () => {
      unsubOpened();
      unsubUpdated();
    };
  }, []);

  // Compute full untruncated conversation title (default is "New Chat")
  const fullTitle = useMemo(() => {
    if (customTitle && customTitle.trim()) return customTitle.trim();
    const firstUserMsg = displayMessages.find((m) => m.role === 'user');
    if (!firstUserMsg) return 'New Chat';
    const firstLine = firstUserMsg.content.trim().replace(/^#+\s*/, '').split('\n')[0].trim();
    return firstLine || 'New Chat';
  }, [customTitle, displayMessages]);

  // View title truncated with ellipsis if longer than 22 characters
  const displayTitle = useMemo(() => {
    if (fullTitle.length <= 22) return fullTitle;
    return `${fullTitle.slice(0, 19)}...`;
  }, [fullTitle]);

  // Initialize browser-only AgentManager
  useEffect(() => {
    const manager = new AgentManager();
    manager.initialize();
    setAgentManager(manager);

    return () => {
      manager.dispose();
      setAgentManager(null);
    };
  }, []);

  // Keep a single continuous event subscription across agentId changes so startup events are never missed
  useEffect(() => {
    if (!agentManager) return;

    const unsubscribe = agentManager.onEvent((event) => {
      processEvent(event);
    });

    return () => {
      unsubscribe();
    };
  }, [agentManager, processEvent]);

  // Attach snapshot only when reconnecting to an existing session without local state
  useEffect(() => {
    if (!agentManager || !activeWorkspaceId || !agentId) return;
    const storeState = useAgentStore.getState();
    if (storeState.lastSequence > 0 && storeState.displayMessages.length > 0) {
      return;
    }

    agentManager.snapshot(agentId).then((snapshot) => {
      if (snapshot) applySnapshot(snapshot);
    });
  }, [agentManager, agentId, activeWorkspaceId, applySnapshot]);

  // Auto-scroll when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, state]);

  // Close floating menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
        setActiveSubmenu(null);
      }
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setIsModelPickerOpen(false);
      }
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setIsQuickMenuOpen(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyClose = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyClose);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyClose);
    };
  }, []);

  const handleStart = async (prompt: string, addUserMsg = false) => {
    const wsId = activeWorkspaceId || getResolvedWorkspaceId();
    setErrorMessage(null);

    if (addUserMsg) {
      useAgentStore.getState().addUserMessage(prompt);
    }
    beginRun(wsId);

    try {
      if (!agentManager || !agentManager.isAvailable()) {
        throw new Error(
          'Desktop Agent IPC bridge is unavailable. Please run inside the Gravitron IDE desktop application.'
        );
      }
      await agentManager.startAgent(
        wsId,
        crypto.randomUUID(),
        prompt,
        selectedProvider,
        {},
        selectedModel
      );
    } catch (e: any) {
      const msg = e?.message || 'Failed to start agent task.';
      console.warn('[AIChatPanel] startAgent failed:', msg);
      setError(msg);
      setErrorMessage(msg);
    }
  };

  const handleCancel = () => {
    if (agentId && agentManager && agentManager.isAvailable()) {
      agentManager.cancelAgent(agentId);
      showToast('Agent stopped.');
    } else if (isRunning) {
      setError(null);
      useAgentStore.setState({
        state: AgentProtocol.AgentState.Cancelled,
        statusReason: 'Cancelled by user',
      });
      showToast('Agent stopped.');
    }
  };

  const handleNewSession = () => {
    if (
      state !== AgentProtocol.AgentState.Idle &&
      state !== AgentProtocol.AgentState.Completed &&
      state !== AgentProtocol.AgentState.Failed &&
      state !== AgentProtocol.AgentState.Cancelled
    ) {
      handleCancel();
    }
    clear();
    setCustomTitle(null);
    setErrorMessage(null);
    showToast('New session ready.');
  };

  const handleApproveTool = (approvalId: string, toolCallId: string, approved: boolean) => {
    if (agentId && agentManager && agentManager.isAvailable()) {
      agentManager.approveTool(agentId, approvalId, toolCallId, approved);
    }
  };

  const handleExtendCommand = useCallback(
    async (commandId: string, additionalMs: number) => {
      if (!agentId || !agentManager || !agentManager.isAvailable()) return;
      try {
        const res = await agentManager.extendCommandTimeout(
          agentId,
          commandId,
          additionalMs,
          'User requested extension'
        );
        if (res.granted) {
          showToast(`Extended timeout by ${formatDurationReadable(res.addedMs)}`);
        } else {
          showToast(res.reason || 'Unable to extend command timeout');
        }
      } catch (err: any) {
        showToast(err?.message || 'Extension failed');
      }
    },
    [agentId, agentManager]
  );

  const handleCancelCommand = useCallback(
    async (commandId: string) => {
      if (!agentId || !agentManager || !agentManager.isAvailable()) return;
      try {
        const res = await agentManager.cancelCommand(agentId, commandId);
        if (res?.cancelled) {
          showToast('Command cancelled');
        }
      } catch (err: any) {
        showToast(err?.message || 'Cancel failed');
      }
    },
    [agentId, agentManager]
  );

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast('Copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.warn('Failed to copy', err);
    }
  };

  const handleToggleReaction = (id: string, type: 'up' | 'down') => {
    setReactions((prev) => ({
      ...prev,
      [id]: prev[id] === type ? null! : type,
    }));
  };

  // Actions for the three dots menu items
  const handleStartRename = () => {
    setTitleInput(fullTitle); // Populate with the full untruncated name, not truncated with ellipsis
    setIsRenaming(true);
    setIsMoreMenuOpen(false);
  };

  const handleSaveRename = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== fullTitle) {
      setCustomTitle(trimmed);
      showToast('Conversation renamed');
    }
    setIsRenaming(false);
  };

  const handleTogglePin = () => {
    setIsPinned(!isPinned);
    showToast(!isPinned ? 'Conversation pinned' : 'Conversation unpinned');
    setIsMoreMenuOpen(false);
  };

  const handleArchive = () => {
    handleNewSession();
    showToast('Conversation archived');
    setIsMoreMenuOpen(false);
  };

  const handleCopyConversation = async () => {
    const formatted = displayMessages
      .map((m) => `### ${m.role.toUpperCase()}:\n${m.content}\n`)
      .join('\n---\n\n');
    await navigator.clipboard.writeText(formatted);
    showToast('Full conversation copied');
    setIsMoreMenuOpen(false);
    setActiveSubmenu(null);
  };

  const handleCopyLastCode = async () => {
    const allCode: string[] = [];
    displayMessages.forEach((m) => {
      const parts = m.content.match(/```[\s\S]*?```/g);
      if (parts) {
        parts.forEach((p) => allCode.push(p.replace(/```[a-z]*\n?/g, '').trim()));
      }
    });
    if (allCode.length > 0) {
      await navigator.clipboard.writeText(allCode[allCode.length - 1]);
      showToast('Latest code copied');
    } else {
      showToast('No code blocks found');
    }
    setIsMoreMenuOpen(false);
    setActiveSubmenu(null);
  };

  const handleCopyLatestResponse = async () => {
    const lastAssistant = [...displayMessages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      await navigator.clipboard.writeText(lastAssistant.content);
      showToast('Latest response copied');
    } else {
      showToast('No assistant response yet');
    }
    setIsMoreMenuOpen(false);
    setActiveSubmenu(null);
  };

  const handleOpenSettings = () => {
    setIsMoreMenuOpen(false);
    router.push('/dashboard/settings?tab=agent');
  };

  const isRunning =
    Boolean(state) &&
    state !== AgentProtocol.AgentState.Idle &&
    state !== AgentProtocol.AgentState.Completed &&
    state !== AgentProtocol.AgentState.Failed &&
    state !== AgentProtocol.AgentState.Cancelled;

  const activeError =
    errorMessage || (state === AgentProtocol.AgentState.Failed ? lastError : null);

  const displayModelName =
    MODEL_FRIENDLY_NAMES[selectedModel] || selectedModel || 'Gemini 3.8 Flash High';

  // Filter messages if search is active
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return displayMessages;
    const q = searchQuery.toLowerCase();
    return displayMessages.filter((m) => m.content.toLowerCase().includes(q));
  }, [displayMessages, searchQuery]);

  const showWelcome =
    filteredMessages.length === 0 &&
    !isRunning &&
    !plan?.steps?.length &&
    specialistActivities.length === 0 &&
    commandExecutionOrder.length === 0 &&
    !activeError &&
    state === AgentProtocol.AgentState.Idle;

  const setNativeElementValue = (
    el: HTMLInputElement | HTMLTextAreaElement,
    nextVal: string,
    cursorPos: number
  ) => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) {
      descriptor.set.call(el, nextVal);
    } else {
      el.value = nextVal;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    try {
      el.setSelectionRange(cursorPos, cursorPos);
    } catch {
      // Some input types don't support setSelectionRange
    }
  };

  const handlePanelContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rawTarget = e.target as HTMLElement | null;
    const editableEl =
      rawTarget instanceof HTMLTextAreaElement || rawTarget instanceof HTMLInputElement
        ? rawTarget
        : null;

    let selectedText = '';
    let selectionStart = 0;
    let selectionEnd = 0;

    if (editableEl) {
      selectionStart = editableEl.selectionStart ?? editableEl.value.length;
      selectionEnd = editableEl.selectionEnd ?? editableEl.value.length;
      selectedText = editableEl.value.slice(selectionStart, selectionEnd);
    } else if (typeof window !== 'undefined') {
      selectedText = window.getSelection()?.toString() || '';
    }

    const menuWidth = 180;
    const menuHeight = 120;
    const x =
      typeof window !== 'undefined' ? Math.min(e.clientX, window.innerWidth - menuWidth - 8) : e.clientX;
    const y =
      typeof window !== 'undefined' ? Math.min(e.clientY, window.innerHeight - menuHeight - 8) : e.clientY;

    setContextMenu({
      x: Math.max(8, x),
      y: Math.max(8, y),
      targetEl: editableEl,
      selectionStart,
      selectionEnd,
      selectedText,
    });
  };

  const handleContextCut = async () => {
    if (!contextMenu) return;
    const { targetEl, selectionStart, selectionEnd, selectedText } = contextMenu;
    setContextMenu(null);
    if (!targetEl || !selectedText) return;

    try {
      await navigator.clipboard.writeText(selectedText);
      const nextVal =
        targetEl.value.slice(0, selectionStart) + targetEl.value.slice(selectionEnd);
      setNativeElementValue(targetEl, nextVal, selectionStart);
    } catch (err) {
      console.warn('Cut failed:', err);
    }
  };

  const handleContextCopy = async () => {
    if (!contextMenu) return;
    const { selectedText } = contextMenu;
    setContextMenu(null);
    if (!selectedText) return;

    try {
      await navigator.clipboard.writeText(selectedText);
      showToast('Copied to clipboard');
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const handleContextPaste = async () => {
    if (!contextMenu) return;
    const { targetEl, selectionStart, selectionEnd } = contextMenu;
    setContextMenu(null);

    const destination =
      targetEl ||
      (document.getElementById('agent-composer-textarea') as HTMLTextAreaElement | null);
    if (!destination) return;

    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText) return;

      const start = targetEl ? selectionStart : destination.selectionStart ?? destination.value.length;
      const end = targetEl ? selectionEnd : destination.selectionEnd ?? destination.value.length;
      const nextVal = destination.value.slice(0, start) + clipText + destination.value.slice(end);
      setNativeElementValue(destination, nextVal, start + clipText.length);
    } catch (err) {
      console.warn('Paste failed:', err);
      showToast('Clipboard read blocked');
    }
  };

  return (
    <div
      onContextMenu={handlePanelContextMenu}
      className="ai-chat-panel flex flex-col h-full bg-[#0c0c0e] text-zinc-200 select-none relative font-sans"
    >
      {/* Right-Click Context Menu matching reference image */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-[100] w-44 bg-[#161619] border border-zinc-800 rounded-xl shadow-2xl py-1.5 text-xs text-zinc-200 select-none"
        >
          <button
            type="button"
            disabled={!contextMenu.targetEl || !contextMenu.selectedText}
            onClick={handleContextCut}
            className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <span>Cut</span>
            <span className="text-zinc-500 text-[11px] font-sans">Ctrl+X</span>
          </button>
          <button
            type="button"
            disabled={!contextMenu.selectedText}
            onClick={handleContextCopy}
            className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <span>Copy</span>
            <span className="text-zinc-500 text-[11px] font-sans">Ctrl+C</span>
          </button>
          <button
            type="button"
            onClick={handleContextPaste}
            className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-zinc-800/80 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <span>Paste</span>
            <span className="text-zinc-500 text-[11px] font-sans">Ctrl+V</span>
          </button>
        </div>
      )}
      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-zinc-100 px-3 py-1.5 rounded-full text-xs shadow-xl border border-zinc-700/80 animate-in fade-in duration-200 pointer-events-none flex items-center space-x-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header matching reference images */}
      <div className="h-10 px-3 flex items-center justify-between text-xs font-medium text-zinc-300 shrink-0 border-b border-zinc-800/80 bg-[#0e0e11]">
        {/* Left Side: Sidebar toggle, Search, Truncated/Editable Title */}
        <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
          <button
            onClick={toggleSidebar}
            title="Toggle Primary Sidebar"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsSearching(!isSearching)}
            title="Search conversation"
            className={cn(
              'p-1 rounded transition-colors shrink-0',
              isSearching
                ? 'bg-zinc-800 text-zinc-100'
                : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            )}
          >
            <Search className="w-4 h-4" />
          </button>

          {isRenaming ? (
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              onBlur={handleSaveRename}
              className="bg-zinc-900 border border-zinc-700 text-zinc-100 px-2 py-0.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-[180px]"
              autoFocus
            />
          ) : (
            <div className="flex items-center space-x-1 min-w-0">
              <span
                className="font-medium text-zinc-200 truncate max-w-[150px] text-xs cursor-pointer hover:text-zinc-100 transition-colors"
                title={fullTitle}
                onClick={handleStartRename}
              >
                {displayTitle}
              </span>
              {isPinned && <Pin className="w-3 h-3 text-amber-400/80 shrink-0" />}
            </div>
          )}
        </div>

        {/* Right Side: Three Dots Menu (⋮), New Chat (+), Close / Sidebar toggle */}
        <div className="flex items-center space-x-1 relative shrink-0">
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => {
                setIsMoreMenuOpen(!isMoreMenuOpen);
                setActiveSubmenu(null);
              }}
              title="More options"
              className={cn(
                'p-1 rounded transition-colors',
                isMoreMenuOpen
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              )}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Exact Three Dots Menu matching User Uploaded Image */}
            {isMoreMenuOpen && (
              <div className="absolute right-0 top-8 w-44 bg-[#161619] border border-zinc-800 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-zinc-200">
                {/* 1. Rename */}
                <button
                  onClick={handleStartRename}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 hover:text-zinc-100 flex items-center space-x-2.5 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Rename</span>
                </button>

                {/* 2. Pin */}
                <button
                  onClick={handleTogglePin}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 hover:text-zinc-100 flex items-center space-x-2.5 transition-colors cursor-pointer"
                >
                  <Pin className={cn('w-3.5 h-3.5', isPinned ? 'text-amber-400' : 'text-zinc-400')} />
                  <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                </button>

                {/* 3. Archive */}
                <button
                  onClick={handleArchive}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 hover:text-zinc-100 flex items-center space-x-2.5 transition-colors cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Archive</span>
                </button>

                {/* Separator */}
                <div className="h-px bg-zinc-800 my-1 mx-1" />

                {/* 4. Split > with Submenu */}
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu('split')}
                  onMouseLeave={() => setActiveSubmenu(null)}
                >
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'split' ? null : 'split')}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 hover:text-zinc-100 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center space-x-2.5">
                      <Columns className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Split</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  </button>

                  {/* Split Submenu */}
                  {activeSubmenu === 'split' && (
                    <div className="absolute right-full top-0 mr-1 w-36 bg-[#161619] border border-zinc-800 rounded-xl shadow-2xl py-1 text-xs">
                      <button
                        onClick={() => {
                          setSecondarySidebarOpen(true);
                          setIsMoreMenuOpen(false);
                          showToast('Split layout adjusted');
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 flex items-center space-x-2"
                      >
                        <PanelRight className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Split Right</span>
                      </button>
                      <button
                        onClick={() => {
                          toggleBottomPanel();
                          setIsMoreMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 flex items-center space-x-2"
                      >
                        <PanelBottom className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Split Down</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 5. Copy > with Submenu */}
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu('copy')}
                  onMouseLeave={() => setActiveSubmenu(null)}
                >
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'copy' ? null : 'copy')}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 hover:text-zinc-100 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center space-x-2.5">
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  </button>

                  {/* Copy Submenu */}
                  {activeSubmenu === 'copy' && (
                    <div className="absolute right-full top-0 mr-1 w-44 bg-[#161619] border border-zinc-800 rounded-xl shadow-2xl py-1 text-xs">
                      <button
                        onClick={handleCopyConversation}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 flex items-center space-x-2"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Copy Conversation</span>
                      </button>
                      <button
                        onClick={handleCopyLastCode}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 flex items-center space-x-2"
                      >
                        <FileCode className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Copy Code Blocks</span>
                      </button>
                      <button
                        onClick={handleCopyLatestResponse}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 flex items-center space-x-2"
                      >
                        <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Copy Latest Response</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Separator */}
                <div className="h-px bg-zinc-800 my-1 mx-1" />

                {/* 6. Settings */}
                <button
                  onClick={handleOpenSettings}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/80 hover:text-zinc-100 flex items-center space-x-2.5 transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Settings</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleNewSession}
            title="New Conversation"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSecondarySidebarOpen(false)}
            title="Close Secondary Sidebar"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Columns className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* In-Panel Search Bar */}
      {isSearching && (
        <div className="px-3 py-1.5 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center space-x-2 shrink-0">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in conversation..."
            className="w-full bg-transparent text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-zinc-500 hover:text-zinc-300 text-xs p-0.5"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Main Messages Stream Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 select-text">
        {showWelcome ? (
          <EmptyWelcomeState onSelectPrompt={(p) => handleStart(p, true)} />
        ) : (
          <>
            {plan && plan.steps && plan.steps.length > 0 && <AgentPlanCard plan={plan} />}

            {filteredMessages.map((msg, idx) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onCopy={handleCopyMessage}
                isCopied={copiedId === msg.id}
                reaction={reactions[msg.id]}
                onReaction={(type) => handleToggleReaction(msg.id, type)}
                isActiveAssistant={
                  isRunning && idx === filteredMessages.length - 1 && msg.role === 'assistant'
                }
                activeToolName={activeToolName}
              />
            ))}

            {specialistActivities.length > 0 && (
              <SpecialistActivityList activities={specialistActivities} />
            )}

            {commandExecutionOrder.length > 0 && (
              <div className="space-y-2">
                {commandExecutionOrder.map((cmdId) => {
                  const exec = commandExecutions[cmdId];
                  if (!exec) return null;
                  return (
                    <CommandExecutionCard
                      key={cmdId}
                      execution={exec}
                      onExtend={handleExtendCommand}
                      onCancel={handleCancelCommand}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeError && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-200 flex items-start justify-between">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <div className="font-semibold text-red-100">Unable to Complete Agent Task</div>
                <div className="text-[11px] text-red-200/90 break-words">{activeError}</div>
                {(activeError.includes('401') ||
                  activeError.toLowerCase().includes('session has expired')) && (
                  <button
                    type="button"
                    onClick={() => {
                      useAuthStore.getState().logout();
                      router.push('/login');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-medium border border-zinc-700/70 transition-colors"
                  >
                    Sign In Again
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setError(null);
              }}
              className="text-red-400 hover:text-red-200 ml-2 p-0.5 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {state === AgentProtocol.AgentState.AwaitingApproval && (
          <ApprovalBanner onApprove={handleApproveTool} />
        )}

        <AgentStatus
          state={state}
          statusReason={statusReason}
          activeToolName={activeToolName}
          onCancel={handleCancel}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Bottom Composer matching reference image */}
      <div className="p-3 bg-[#0c0c0e] shrink-0">
        <div className="relative rounded-2xl border border-zinc-800 bg-[#161619] shadow-xl p-3 focus-within:border-zinc-700 transition-colors">
          <textarea
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const target = e.currentTarget;
                if (target.value.trim() && !isRunning) {
                  const val = target.value;
                  target.value = '';
                  useAgentStore.getState().addUserMessage(val);
                  handleStart(val);
                }
              }
            }}
            placeholder="Ask anything, @ to mention, / for act..."
            rows={1}
            disabled={isRunning}
            className="w-full bg-transparent text-zinc-100 placeholder:text-zinc-500 text-xs focus:outline-none resize-none no-scrollbar min-h-[44px] max-h-[160px] leading-relaxed"
            id="agent-composer-textarea"
          />

          {/* Bottom Toolbar Row inside Composer Card */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/40">
            <div className="flex items-center space-x-2 relative">
              {/* Plus Button for Context / Quick Actions */}
              <div className="relative" ref={quickMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsQuickMenuOpen(!isQuickMenuOpen)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                  title="Quick actions & context"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {isQuickMenuOpen && (
                  <div className="absolute left-0 bottom-8 w-60 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1 z-50 text-xs space-y-0.5">
                    <button
                      onClick={() => {
                        handleStart(
                          'Inspect repository structure and summarize architecture and entry points.',
                          true
                        );
                        setIsQuickMenuOpen(false);
                      }}
                      className="w-full text-left p-2 hover:bg-zinc-800 rounded-lg text-zinc-200 flex items-center space-x-2"
                    >
                      <FolderTree className="w-3.5 h-3.5 text-primary" />
                      <span>Inspect Repository Structure</span>
                    </button>
                    <button
                      onClick={() => {
                        handleStart(
                          'Run typecheck and test suite, diagnose errors and fix them.',
                          true
                        );
                        setIsQuickMenuOpen(false);
                      }}
                      className="w-full text-left p-2 hover:bg-zinc-800 rounded-lg text-zinc-200 flex items-center space-x-2"
                    >
                      <Wrench className="w-3.5 h-3.5 text-primary" />
                      <span>Diagnose & Fix Errors</span>
                    </button>
                    <button
                      onClick={() => {
                        handleStart(
                          'Plan and implement enhancements delegating to specialists for review.',
                          true
                        );
                        setIsQuickMenuOpen(false);
                      }}
                      className="w-full text-left p-2 hover:bg-zinc-800 rounded-lg text-zinc-200 flex items-center space-x-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span>Implement Feature with Specialists</span>
                    </button>
                    <button
                      onClick={() => {
                        handleStart(
                          'Review git status, unstaged diffs, and pending modifications.',
                          true
                        );
                        setIsQuickMenuOpen(false);
                      }}
                      className="w-full text-left p-2 hover:bg-zinc-800 rounded-lg text-zinc-200 flex items-center space-x-2"
                    >
                      <GitBranch className="w-3.5 h-3.5 text-primary" />
                      <span>Review Git Status & Diffs</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Model Selector Pill matching reference image */}
              <div className="relative" ref={modelPickerRef}>
                <button
                  type="button"
                  onClick={() => setIsModelPickerOpen(!isModelPickerOpen)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 text-[11px] font-medium border border-zinc-700/50 transition-colors"
                >
                  <span className="truncate max-w-[140px]">{displayModelName}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                </button>

                {/* Model Picker Popover - Pure model selection without manual API key entry */}
                {isModelPickerOpen && (
                  <div className="absolute left-0 bottom-8 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 text-xs space-y-1">
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1">
                      Active Model
                    </div>

                    {/* Gemini Models */}
                    <div className="space-y-0.5">
                      <div className="px-2 py-0.5 text-[10px] text-zinc-400 font-semibold">
                        Google Gemini
                      </div>
                      {DEFAULT_MODELS.gemini.map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setSelectedProvider('gemini');
                            setSelectedModel(m);
                            setIsModelPickerOpen(false);
                          }}
                          className={cn(
                            'w-full text-left px-2 py-1 rounded-md text-[11px] transition-colors flex items-center justify-between',
                            selectedProvider === 'gemini' && selectedModel === m
                              ? 'bg-primary/20 text-primary font-medium'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          )}
                        >
                          <span>{MODEL_FRIENDLY_NAMES[m] || m}</span>
                          {selectedProvider === 'gemini' && selectedModel === m && (
                            <Check className="w-3 h-3 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Claude Models */}
                    <div className="space-y-0.5 pt-1 border-t border-zinc-800">
                      <div className="px-2 py-0.5 text-[10px] text-zinc-400 font-semibold">
                        Anthropic Claude
                      </div>
                      {DEFAULT_MODELS.anthropic.map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setSelectedProvider('anthropic');
                            setSelectedModel(m);
                            setIsModelPickerOpen(false);
                          }}
                          className={cn(
                            'w-full text-left px-2 py-1 rounded-md text-[11px] transition-colors flex items-center justify-between',
                            selectedProvider === 'anthropic' && selectedModel === m
                              ? 'bg-primary/20 text-primary font-medium'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          )}
                        >
                          <span>{MODEL_FRIENDLY_NAMES[m] || m}</span>
                          {selectedProvider === 'anthropic' && selectedModel === m && (
                            <Check className="w-3 h-3 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* OpenAI Models */}
                    <div className="space-y-0.5 pt-1 border-t border-zinc-800">
                      <div className="px-2 py-0.5 text-[10px] text-zinc-400 font-semibold">
                        OpenAI
                      </div>
                      {DEFAULT_MODELS.openai.map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setSelectedProvider('openai');
                            setSelectedModel(m);
                            setIsModelPickerOpen(false);
                          }}
                          className={cn(
                            'w-full text-left px-2 py-1 rounded-md text-[11px] transition-colors flex items-center justify-between',
                            selectedProvider === 'openai' && selectedModel === m
                              ? 'bg-primary/20 text-primary font-medium'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          )}
                        >
                          <span>{MODEL_FRIENDLY_NAMES[m] || m}</span>
                          {selectedProvider === 'openai' && selectedModel === m && (
                            <Check className="w-3 h-3 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Circular Send / Cancel Button matching reference image */}
            {isRunning ? (
              <button
                type="button"
                onClick={handleCancel}
                className="w-7 h-7 rounded-full bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm"
                title="Stop generation"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(
                    'agent-composer-textarea'
                  ) as HTMLTextAreaElement;
                  if (el && el.value.trim()) {
                    const val = el.value;
                    el.value = '';
                    useAgentStore.getState().addUserMessage(val);
                    handleStart(val);
                  }
                }}
                className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors border border-zinc-700/60"
                title="Send message (Enter)"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Syntax-highlighted code block matching reference image
// ---------------------------------------------------------------------------
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed', err);
    }
  };

  const lines = code.split('\n');

  return (
    <div className="relative my-2.5 rounded-xl border border-zinc-800/90 bg-[#121215] p-3 text-xs font-mono group">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-all"
        title="Copy code"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>

      <pre className="overflow-x-auto no-scrollbar leading-relaxed">
        {lines.map((line, i) => {
          const colored = line
            .replace(/\b(setSelectedModel|setConfigFeedback|setTestFeedback)\b/g, '___FN_$1___')
            .replace(/\b(null|true|false|undefined|const|let|var)\b/g, '___KW_$1___')
            .replace(/\b(defModel)\b/g, '___ID_$1___');

          const segments = colored.split(/(___FN_[^_]+___|___KW_[^_]+___|___ID_[^_]+___)/g);

          return (
            <div key={i}>
              {segments.map((seg, sIdx) => {
                if (seg.startsWith('___FN_')) {
                  return (
                    <span key={sIdx} className="text-amber-300 font-semibold">
                      {seg.slice(6, -3)}
                    </span>
                  );
                }
                if (seg.startsWith('___KW_')) {
                  return (
                    <span key={sIdx} className="text-sky-400">
                      {seg.slice(6, -3)}
                    </span>
                  );
                }
                if (seg.startsWith('___ID_')) {
                  return (
                    <span key={sIdx} className="text-zinc-300">
                      {seg.slice(6, -3)}
                    </span>
                  );
                }
                return (
                  <span key={sIdx} className="text-zinc-200">
                    {seg}
                  </span>
                );
              })}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown formatter matching typography and highlighted badges in reference image
// ---------------------------------------------------------------------------
function FormattedMessage({ content }: { content: string }) {
  if (!content) return null;

  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-xs leading-relaxed text-zinc-200">
      {parts.map((part, pIdx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const firstBreak = inner.indexOf('\n');
          const code = firstBreak !== -1 ? inner.slice(firstBreak + 1) : inner;
          return <CodeBlock key={pIdx} code={code.trim()} />;
        }

        const lines = part.split('\n');
        return (
          <div key={pIdx} className="space-y-1.5">
            {lines.map((line, lIdx) => {
              if (!line.trim()) return <div key={lIdx} className="h-1" />;

              if (line.match(/^#+\s+/)) {
                return (
                  <h4 key={lIdx} className="text-sm font-bold text-zinc-100 mt-2 mb-1">
                    {line.replace(/^#+\s*/, '')}
                  </h4>
                );
              }

              const tokens = line.split(
                /(`[^`]+`|\b0\b|\/dashboard\/ide|D:\\Gravitron-IDE|\+2|-2)/g
              );

              const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');

              return (
                <div key={lIdx} className={cn('whitespace-pre-wrap', isBullet && 'pl-2')}>
                  {tokens.map((tok, tIdx) => {
                    if (tok.startsWith('`') && tok.endsWith('`')) {
                      return (
                        <span
                          key={tIdx}
                          className="px-1.5 py-0.5 rounded bg-zinc-800/90 text-amber-300 font-mono text-[11px] border border-zinc-700/60 mx-0.5"
                        >
                          {tok.slice(1, -1)}
                        </span>
                      );
                    }
                    if (tok === '0') {
                      return (
                        <span
                          key={tIdx}
                          className="px-1.5 py-0.5 rounded bg-zinc-800/90 text-cyan-300 font-mono text-[11px] border border-zinc-700/60 mx-0.5"
                        >
                          0
                        </span>
                      );
                    }
                    if (tok === '/dashboard/ide' || tok === 'D:\\Gravitron-IDE') {
                      return (
                        <span
                          key={tIdx}
                          className="px-1.5 py-0.5 rounded bg-zinc-800/90 text-amber-300 font-mono text-[11px] border border-zinc-700/60 mx-0.5"
                        >
                          {tok}
                        </span>
                      );
                    }
                    if (tok === '+2') {
                      return (
                        <span key={tIdx} className="text-emerald-400 font-mono font-semibold">
                          +2
                        </span>
                      );
                    }
                    if (tok === '-2') {
                      return (
                        <span key={tIdx} className="text-red-400 font-mono font-semibold">
                          -2
                        </span>
                      );
                    }
                    return <span key={tIdx}>{tok}</span>;
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File Changes Diff Pill Card matching reference image
// ---------------------------------------------------------------------------
function FileChangesDiffCard({
  filesCount = 1,
  additions = 2,
  deletions = 2,
  details,
}: {
  filesCount?: number;
  additions?: number;
  deletions?: number;
  details?: string;
}) {
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  return (
    <div className="my-2.5">
      <div className="p-2 px-3 rounded-xl border border-zinc-800/90 bg-zinc-900/60 flex items-center justify-between text-xs shadow-xs">
        <div
          onClick={() => setIsReviewOpen(!isReviewOpen)}
          className="flex items-center space-x-2 cursor-pointer select-none group"
        >
          <span className="text-zinc-300 font-medium">
            {filesCount} file{filesCount > 1 ? 's' : ''} changed
          </span>
          <span className="text-emerald-400 font-mono font-semibold text-[11px]">
            +{additions}
          </span>
          <span className="text-red-400 font-mono font-semibold text-[11px]">
            -{deletions}
          </span>
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 text-zinc-500 transition-transform',
              isReviewOpen && 'rotate-90'
            )}
          />
        </div>

        <button
          onClick={() => setIsReviewOpen(!isReviewOpen)}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-zinc-700/70 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition-colors"
        >
          <FileCode className="w-3.5 h-3.5 text-zinc-400" />
          <span>Review</span>
        </button>
      </div>

      {isReviewOpen && (
        <div className="mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-400 space-y-1.5 overflow-x-auto">
          <div className="text-[11px] font-semibold text-zinc-200 flex items-center space-x-1.5">
            <span className="text-emerald-400">M</span>
            <span>apps/frontend/src/components/ide/ai/AIChatPanel.tsx</span>
          </div>
          <pre className="text-[10px] text-zinc-500 leading-relaxed">
            {details ||
              `@@ -145,2 +145,2 @@\n- providerConfig?.providers.find\n+ providerConfig?.providers?.find`}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Antigravity-style task plan progress card
// ---------------------------------------------------------------------------
function AgentPlanCard({ plan }: { plan: AgentProtocol.AgentPlan }) {
  const [expanded, setExpanded] = useState(true);
  const completedCount = plan.steps.filter((s) => s.status === 'completed').length;
  const totalCount = plan.steps.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/50 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center space-x-2 text-zinc-200 font-medium">
          <ListChecks className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>Task Plan</span>
          <span className="text-[11px] text-zinc-500 font-normal">
            {completedCount}/{totalCount} completed
          </span>
        </div>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-zinc-500 transition-transform',
            !expanded && '-rotate-90'
          )}
        />
      </button>

      <div className="h-0.5 bg-zinc-800/80 w-full">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {expanded && (
        <div className="px-3 py-2 space-y-1.5">
          {plan.steps.map((step) => (
            <div key={step.id} className="flex items-start space-x-2 text-[11px] leading-snug">
              {step.status === 'in_progress' && (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0 mt-0.5" />
              )}
              {step.status === 'completed' && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              )}
              {step.status === 'failed' && (
                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              )}
              {(step.status === 'pending' || step.status === 'skipped') && (
                <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
              )}
              <span
                className={cn(
                  step.status === 'completed' && 'text-zinc-400 line-through',
                  step.status === 'in_progress' && 'text-zinc-100 font-medium',
                  step.status === 'failed' && 'text-red-300',
                  (step.status === 'pending' || step.status === 'skipped') && 'text-zinc-400'
                )}
              >
                {step.description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live specialist delegation activity cards
// ---------------------------------------------------------------------------
function SpecialistActivityList({
  activities,
}: {
  activities: AgentProtocol.SpecialistDelegationPayload[];
}) {
  return (
    <div className="space-y-1.5">
      {activities.map((activity, idx) => (
        <div
          key={`${activity.specialistName}-${idx}`}
          className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-[11px] space-y-1"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-zinc-200 font-medium">
              <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>{activity.specialistName}</span>
            </div>
            {activity.status === 'running' || activity.status === 'starting' ? (
              <span className="flex items-center space-x-1 text-primary">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Consulting</span>
              </span>
            ) : activity.status === 'completed' ? (
              <span className="text-emerald-400">Completed</span>
            ) : (
              <span className="text-red-400">Failed</span>
            )}
          </div>
          {(activity.summary || activity.reason) && (
            <div className="text-zinc-400 leading-snug break-words">
              {activity.summary || activity.reason}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact collapsible tool call row matching Antigravity activity rows
// ---------------------------------------------------------------------------
function ToolCallPill({
  toolCall,
  isActive,
}: {
  toolCall: NonNullable<AgentProtocol.DisplayMessage['toolCalls']>[number];
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const argPreview = useMemo(() => {
    const args = toolCall.arguments as Record<string, unknown> | null;
    if (!args || typeof args !== 'object') return '';
    const candidate =
      args.path ||
      args.filePath ||
      args.command ||
      args.query ||
      args.pattern ||
      args.target ||
      args.directory;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    return '';
  }, [toolCall.arguments]);

  if (toolCall.name === 'update_plan') {
    return null;
  }

  return (
    <div className="my-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-[11px] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-2.5 py-1.5 flex items-center justify-between hover:bg-zinc-800/40 transition-colors text-left"
      >
        <div className="flex items-center space-x-2 min-w-0">
          {isActive ? (
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
          ) : (
            <Terminal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
          <span className="font-mono text-zinc-200 font-medium shrink-0">{toolCall.name}</span>
          {argPreview && (
            <span className="text-zinc-500 font-mono truncate">{argPreview}</span>
          )}
        </div>
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {expanded && (
        <pre className="px-2.5 pb-2 pt-1 text-[10px] font-mono text-zinc-400 overflow-x-auto border-t border-zinc-800/60 bg-zinc-950/60">
          {JSON.stringify(toolCall.arguments, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single message item with action toolbar matching reference image
// ---------------------------------------------------------------------------
function MessageItem({
  message,
  onCopy,
  isCopied,
  reaction,
  onReaction,
  isActiveAssistant = false,
  activeToolName = null,
}: {
  message: AgentProtocol.DisplayMessage;
  onCopy: (id: string, text: string) => void;
  isCopied: boolean;
  reaction?: 'up' | 'down';
  onReaction: (type: 'up' | 'down') => void;
  isActiveAssistant?: boolean;
  activeToolName?: string | null;
}) {
  const [toolExpanded, setToolExpanded] = useState(false);
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  const hasFileModifications = useMemo(() => {
    if (isUser || isTool) return false;
    const hasWriteTool = message.toolCalls?.some(
      (tc) => tc.name === 'write_file' || tc.name === 'edit_file'
    );
    const mentionsDiff =
      message.content.includes('file changed') ||
      message.content.includes('1 file changed') ||
      message.content.includes('+2 -2');
    return hasWriteTool || mentionsDiff;
  }, [message, isUser, isTool]);

  if (isTool) {
    const trimmed = message.content.trim();
    const preview = trimmed.length > 90 ? `${trimmed.slice(0, 90)}...` : trimmed;
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 text-[11px] overflow-hidden">
        <button
          type="button"
          onClick={() => setToolExpanded(!toolExpanded)}
          className="w-full px-2.5 py-1.5 flex items-center justify-between text-zinc-400 hover:bg-zinc-800/30 transition-colors text-left"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-500/80 shrink-0" />
            <span className="truncate font-mono text-[10px] text-zinc-400">
              {preview || 'Tool completed'}
            </span>
          </div>
          <ChevronRight
            className={cn(
              'w-3 h-3 text-zinc-500 shrink-0 transition-transform',
              toolExpanded && 'rotate-90'
            )}
          />
        </button>
        {toolExpanded && (
          <pre className="px-2.5 pb-2 pt-1 text-[10px] font-mono text-zinc-400 overflow-x-auto max-h-48 border-t border-zinc-800/50 bg-zinc-950/60 whitespace-pre-wrap break-words">
            {message.content}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col',
        isUser ? 'self-end items-end max-w-[85%]' : 'self-start items-start w-full'
      )}
    >
      <div
        className={cn(
          'text-xs leading-relaxed',
          isUser
            ? 'p-2.5 px-3.5 rounded-2xl bg-zinc-800 text-zinc-100 font-medium'
            : 'w-full text-zinc-200'
        )}
      >
        <FormattedMessage content={message.content} />

        {hasFileModifications && <FileChangesDiffCard />}

        {message.toolCalls &&
          message.toolCalls.map((tc, tcIdx) => (
            <ToolCallPill
              key={tc.id}
              toolCall={tc}
              isActive={
                isActiveAssistant &&
                tcIdx === (message.toolCalls?.length ?? 0) - 1 &&
                activeToolName === tc.name
              }
            />
          ))}
      </div>

      {!isUser && !isActiveAssistant && Boolean(message.content?.trim()) && (
        <div className="flex items-center space-x-3 text-zinc-500 text-xs mt-2 select-none">
          <button
            onClick={() => onCopy(message.id, message.content)}
            className="hover:text-zinc-300 transition-colors"
            title="Copy response"
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={() => onReaction('up')}
            className={cn(
              'hover:text-zinc-300 transition-colors',
              reaction === 'up' && 'text-primary'
            )}
            title="Good response"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onReaction('down')}
            className={cn(
              'hover:text-zinc-300 transition-colors',
              reaction === 'down' && 'text-red-400'
            )}
            title="Bad response"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimal welcome state when there are no messages
// ---------------------------------------------------------------------------
function EmptyWelcomeState({ onSelectPrompt }: { onSelectPrompt: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center my-auto space-y-4 max-w-sm mx-auto select-none">
      <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-primary shadow-inner">
        <Sparkles className="w-7 h-7" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-zinc-100 tracking-tight">Gravitron AI Assistant</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Ask questions, inspect workspace code, or ask the agent to build and verify features.
        </p>
      </div>

      <div className="w-full space-y-1.5 pt-2 text-left">
        <button
          onClick={() =>
            onSelectPrompt(
              'Inspect this workspace repository structure and summarize core architecture.'
            )
          }
          className="w-full p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-300 text-xs text-left transition-colors flex items-center justify-between"
        >
          <span>Inspect repository structure</span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
        </button>
        <button
          onClick={() =>
            onSelectPrompt('Run the typechecker or test suite, diagnose errors and fix them.')
          }
          className="w-full p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-300 text-xs text-left transition-colors flex items-center justify-between"
        >
          <span>Diagnose & fix errors</span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool Approval Request Dialog
// ---------------------------------------------------------------------------
export function ApprovalBanner({
  onApprove,
}: {
  onApprove: (approvalId: string, toolCallId: string, approved: boolean) => void;
}) {
  const pendingApproval = useAgentStore((s) => s.pendingApproval);
  if (!pendingApproval) return null;

  const args = (pendingApproval.arguments as Record<string, any>) || {};
  const requestedTimeoutSec =
    typeof args.timeoutSeconds === 'number' && args.timeoutSeconds > 0
      ? args.timeoutSeconds
      : args.timeoutPreset === 'extended'
        ? 600
        : args.timeoutPreset === 'long'
          ? 300
          : args.timeoutPreset === 'short'
            ? 30
            : null;

  return (
    <div className="bg-amber-950/30 border border-amber-800/70 p-3 rounded-2xl my-3 shadow-md space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-amber-300 flex items-center text-xs">
          <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-400" /> Tool Approval Required
        </h3>
        {pendingApproval.toolName === 'execute_command' && requestedTimeoutSec !== null && (
          <span className="px-2 py-0.5 rounded-full bg-amber-900/50 border border-amber-700/70 text-[10px] font-mono text-amber-200">
            Timeout: {formatDurationReadable(requestedTimeoutSec * 1000)}
          </span>
        )}
      </div>
      <div className="text-xs space-y-1.5">
        <div className="bg-zinc-950 p-2 rounded-xl font-mono text-[11px] overflow-auto max-h-36 border border-zinc-800 text-zinc-400">
          <div className="font-bold text-primary mb-1">{pendingApproval.toolName}</div>
          <pre>{JSON.stringify(pendingApproval.arguments, null, 2)}</pre>
        </div>
      </div>
      <div className="flex space-x-2 pt-1">
        <button
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-200 text-xs font-medium transition-colors"
          onClick={() => onApprove(pendingApproval.approvalId, pendingApproval.toolCallId, false)}
        >
          Reject
        </button>
        <button
          className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors"
          onClick={() => onApprove(pendingApproval.approvalId, pendingApproval.toolCallId, true)}
        >
          Approve Execution
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Status Indicator
// ---------------------------------------------------------------------------
function formatAgentStatusLabel(
  state: AgentProtocol.AgentState,
  activeToolName: string | null,
  statusReason: string | null
): { title: string; detail?: string } {
  let title = 'Working';
  switch (state) {
    case AgentProtocol.AgentState.Planning:
      title = 'Planning next steps';
      break;
    case AgentProtocol.AgentState.CallingProvider:
      title = 'Thinking';
      break;
    case AgentProtocol.AgentState.Streaming:
      title = 'Generating response';
      break;
    case AgentProtocol.AgentState.ToolCallPending:
      title = activeToolName ? `Preparing ${activeToolName}` : 'Preparing tool execution';
      break;
    case AgentProtocol.AgentState.AwaitingApproval:
      title = activeToolName ? `Waiting for approval: ${activeToolName}` : 'Waiting for approval';
      break;
    case AgentProtocol.AgentState.ExecutingTool:
      title = activeToolName ? `Running ${activeToolName}` : 'Executing tool';
      break;
    default:
      title = state || 'Working';
  }

  const detail =
    statusReason && statusReason.trim() && statusReason.trim() !== title
      ? statusReason.trim()
      : undefined;
  return { title, detail };
}

export function AgentStatus({
  state,
  statusReason = null,
  activeToolName = null,
  onCancel,
}: {
  state: AgentProtocol.AgentState;
  statusReason?: string | null;
  activeToolName?: string | null;
  onCancel: () => void;
}) {
  if (
    !state ||
    state === AgentProtocol.AgentState.Idle ||
    state === AgentProtocol.AgentState.Completed ||
    state === AgentProtocol.AgentState.Cancelled ||
    state === AgentProtocol.AgentState.Failed
  ) {
    return null;
  }

  const { title, detail } = formatAgentStatusLabel(state, activeToolName, statusReason);

  return (
    <div className="flex items-center justify-between gap-2 text-xs text-zinc-400 my-2 p-2.5 px-3 bg-zinc-900/60 rounded-xl border border-zinc-800/90">
      <div className="flex items-center space-x-2.5 min-w-0">
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
        <div className="min-w-0">
          <div className="font-medium text-zinc-200 truncate">{title}...</div>
          {detail && <div className="text-[11px] text-zinc-400 truncate">{detail}</div>}
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-950/30 text-[11px] transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
