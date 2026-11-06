import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { TerminalManager } from '../../../services/terminal';
import { useTerminalStore } from '../../../stores/ide/terminalStore';
import { TerminalSessionState } from '../../../services/terminal/types';
import { TerminalEvents } from '../../../services/terminal/events/TerminalEvents';
import { TerminalEventType } from '../../../services/terminal/types/events';
import '@xterm/xterm/css/xterm.css';

interface TerminalInstanceProps {
  sessionId: string;
}

export function TerminalInstance({ sessionId }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);

  const fontSize = useTerminalStore((state) => state.fontSize);
  const cursorStyle = useTerminalStore((state) => state.cursorStyle);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontSize,
      cursorStyle,
      theme: {
        background: 'transparent',
      },
      disableStdin: true, // Disable input until session is Running
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    setTerminal(term);

    // CWD tracking via OSC 7
    term.parser.registerOscHandler(7, (data) => {
      let cwd = data;
      if (cwd.startsWith('file://localhost/')) cwd = cwd.substring(17);
      else if (cwd.startsWith('file://')) cwd = cwd.substring(cwd.indexOf('/', 7));

      const groups = useTerminalStore.getState().groups;
      for (const g of groups) {
        if (g.tabs.some((t) => t.id === sessionId)) {
          useTerminalStore.getState().updateTabCwd(g.id, sessionId, cwd);
          break;
        }
      }
      return true;
    });

    // Title tracking via OSC 0
    term.onTitleChange((title) => {
      const groups = useTerminalStore.getState().groups;
      for (const g of groups) {
        if (g.tabs.some((t) => t.id === sessionId)) {
          useTerminalStore.getState().updateTabTitle(g.id, sessionId, title);
          break;
        }
      }
    });

    const session = TerminalManager.getRegistry().getSession(sessionId);
    let sessionDisposable: any;
    let xtermDisposable: any;
    let resizeDisposable: any;

    if (session) {
      // If already running when UI attaches
      if (session.state === TerminalSessionState.Running) {
        term.options.disableStdin = false;
      }

      sessionDisposable = session.onData((data) => {
        term.write(data);
      });
      xtermDisposable = term.onData((data) => {
        if (session.state === TerminalSessionState.Running) {
          session.write(data).catch(console.error);
        }
      });
      resizeDisposable = term.onResize((size) => {
        session.resize(size.cols, size.rows).catch(console.error);
      });

      const stateDisposable = session.onStateChanged((state) => {
        if (state === TerminalSessionState.Running) {
          term.options.disableStdin = false;
        } else {
          term.options.disableStdin = true;
        }
      });

      // Monkey patch cleanup
      const originalDispose = sessionDisposable.dispose;
      sessionDisposable.dispose = () => {
        originalDispose.call(sessionDisposable);
        stateDisposable.dispose();
      };
    }

    const focusDisposable = TerminalEvents.on(TerminalEventType.TerminalFocused, (e) => {
      if (e.terminalId === sessionId && term) {
        term.focus();
      }
    });

    let resizeTimeout: ReturnType<typeof requestAnimationFrame>;
    const doFit = () => {
      cancelAnimationFrame(resizeTimeout);
      resizeTimeout = requestAnimationFrame(() => {
        if (term && term.element && containerRef.current) {
          const cw = containerRef.current.clientWidth;
          const ch = containerRef.current.clientHeight;
          if (cw > 0 && ch > 0) {
            try {
              fitAddon.fit();
            } catch (e) {}
          }
        }
      });
    };

    const resizeObserver = new ResizeObserver(() => doFit());
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', doFit);

    const unsubStore = useTerminalStore.subscribe((state) => {
      doFit();
    });

    // Initial fit
    setTimeout(doFit, 50);

    return () => {
      cancelAnimationFrame(resizeTimeout);
      resizeObserver.disconnect();
      window.removeEventListener('resize', doFit);
      unsubStore();
      if (sessionDisposable) sessionDisposable.dispose();
      if (xtermDisposable) xtermDisposable.dispose();
      if (resizeDisposable) resizeDisposable.dispose();
      if (focusDisposable) focusDisposable.dispose();
      term.dispose();
      // We don't dispose the session, just detach the UI
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Update terminal config if store changes
  useEffect(() => {
    if (terminal) {
      terminal.options.fontSize = fontSize;
      terminal.options.cursorStyle = cursorStyle;
    }
  }, [fontSize, cursorStyle, terminal]);

  return <div ref={containerRef} className="w-full h-full" />;
}
