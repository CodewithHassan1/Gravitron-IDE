'use client';

import { useEffect, useState } from 'react';
import { bootstrapCore, bootstrapWorkbench } from '../runtime/IDEBootstrap';
import { ShortcutManager } from '../services/keyboard/ShortcutManager';

console.log('[BOOT TRACE] AppBootstrapProvider module loaded');

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

    // Listen for incoming gravitron:// deep-links from browser authentication redirects
    let unsubscribeDeepLink: (() => void) | undefined;
    if (typeof window !== 'undefined' && (window as any).agApi?.auth?.onDeepLink) {
      const sub = (window as any).agApi.auth.onDeepLink((deepLinkUrl: string) => {
        try {
          const parsed = new URL(deepLinkUrl);
          if (parsed.protocol === 'gravitron:') {
            if (parsed.searchParams.get('verified') === 'true') {
              window.location.href = '/login?verified=true';
            }
          }
        } catch (err) {
          console.warn('[deep-link] Failed to handle incoming deep link:', err);
        }
      });
      unsubscribeDeepLink = () => sub?.dispose?.();
    }

    return () => {
      unsubscribeDeepLink?.();
    };
  }, []);

  if (!isReady) {
    return null; // Or a minimal loading state
  }

  return <>{children}</>;
}
