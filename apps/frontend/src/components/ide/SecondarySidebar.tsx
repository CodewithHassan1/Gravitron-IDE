import React from 'react';
import { ViewRegistry } from '../../lib/registries/ViewRegistry';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, ArrowLeft } from 'lucide-react';
import { AIChatPanel } from './ai/AIChatPanel';

export function SecondarySidebar() {
  const activeSecondaryActivity = useLayoutStore((state) => state.activeSecondaryActivity);
  const setActiveSecondaryActivity = useLayoutStore((state) => state.setActiveSecondaryActivity);
  const setSecondarySidebarOpen = useLayoutStore((state) => state.setSecondarySidebarOpen);

  // Safe fallback to 'ai-chat' if view does not exist in registry
  const resolvedActivity = ViewRegistry.get(activeSecondaryActivity)
    ? activeSecondaryActivity
    : 'ai-chat';
  const view = ViewRegistry.get(resolvedActivity) || ViewRegistry.get('ai-chat');

  // When AI Chat is active, AIChatPanel renders the unified modern header from Image 2
  if (resolvedActivity === 'ai-chat') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0c0c0e] h-full border-l border-zinc-800/80">
        <AIChatPanel />
      </div>
    );
  }

  // Supporting header for secondary diagnostic/context views
  const ActiveIcon = view?.icon || Bot;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0c0c0e] h-full border-l border-zinc-800/80 select-none">
      <div className="h-10 px-3 flex items-center justify-between text-xs font-semibold text-zinc-200 shrink-0 border-b border-zinc-800/80 bg-[#0e0e11]">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveSecondaryActivity('ai-chat')}
            title="Back to AI Agent"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <div className="p-1 rounded bg-primary/10 text-primary">
            <ActiveIcon className="w-3.5 h-3.5" />
          </div>
          <span className="uppercase tracking-wider text-[11px] font-bold">
            {view ? view.title : 'Secondary View'}
          </span>
        </div>

        <button
          onClick={() => setSecondarySidebarOpen(false)}
          title="Close Secondary Side Bar"
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto relative bg-[#0c0c0e]">
        <AnimatePresence mode="wait">
          {view && (
            <motion.div
              key={view.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0"
            >
              <view.component />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
