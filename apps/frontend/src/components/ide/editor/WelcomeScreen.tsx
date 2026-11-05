import React from 'react';

export function WelcomeScreen() {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center bg-background text-muted-foreground select-none">
      <h2 className="text-3xl font-bold mb-6 text-foreground">Gravitron IDE</h2>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-center gap-4">
          <kbd className="px-2 py-1 bg-card rounded border border-border min-w-[60px] text-center">
            Ctrl+P
          </kbd>
          <span>Go to File</span>
        </div>
        <div className="flex items-center gap-4">
          <kbd className="px-2 py-1 bg-card rounded border border-border min-w-[60px] text-center">
            Ctrl+Shift+F
          </kbd>
          <span>Global Search</span>
        </div>
        <div className="flex items-center gap-4">
          <kbd className="px-2 py-1 bg-card rounded border border-border min-w-[60px] text-center">
            Ctrl+Shift+P
          </kbd>
          <span>Command Palette</span>
        </div>
      </div>
    </div>
  );
}
