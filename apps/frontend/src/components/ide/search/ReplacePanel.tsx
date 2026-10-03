import React from 'react';
import { useSearchStore } from '../../../stores/ide/searchStore';

export function ReplacePanel() {
  const { replace, setReplace } = useSearchStore();

  return (
    <div className="flex flex-col px-4 pb-2 border-b border-border">
      <input
        type="text"
        placeholder="Replace"
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        className="w-full h-7 px-2 text-xs bg-background border border-border focus:outline-none focus:border-primary transition-colors text-foreground"
      />
    </div>
  );
}
