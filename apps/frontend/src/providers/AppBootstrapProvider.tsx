"use client";

import { useEffect, useState } from 'react';
import { bootstrapCore, bootstrapWorkbench } from '../runtime/IDEBootstrap';
import { ShortcutManager } from '../services/keyboard/ShortcutManager';

console.log("[BOOT TRACE] AppBootstrapProvider module loaded");

export function AppBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        await bootstrapCore();
        await bootstrapWorkbench();
        ShortcutManager.attach(document);
        setIsReady(true);
      } catch (e) {
        console.error('Failed to bootstrap application', e);
      }
    }
    init();
  }, []);

  if (!isReady) {
    return null; // Or a minimal loading state
  }

  return <>{children}</>;
}
