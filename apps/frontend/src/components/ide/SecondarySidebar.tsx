import React from 'react';
import { ViewRegistry } from '../../lib/registries/ViewRegistry';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { motion, AnimatePresence } from 'framer-motion';

export function SecondarySidebar() {
  const activeSecondaryActivity = useLayoutStore((state) => state.activeSecondaryActivity);
  const view = ViewRegistry.get(activeSecondaryActivity);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-card h-full">
      <div className="h-9 px-4 flex items-center text-xs font-semibold uppercase tracking-wider text-foreground shrink-0 border-b border-border/50">
        {view ? view.title : 'SECONDARY SIDEBAR'}
      </div>
      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          {view ? (
            <motion.div
              key={view.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0"
            >
              <view.component />
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center opacity-50">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M21 3v18M3 3h18M3 21h18" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-foreground">No view available</h3>
                <p className="text-xs text-muted-foreground">Select an activity to display.</p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
