import React from 'react';
import { Check, Plus, Minus } from 'lucide-react';

export function SourceControlView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <p className="text-sm text-muted-foreground">Source control is currently disabled.</p>
      <p className="text-xs text-muted-foreground mt-2">
        Git integration is not yet implemented natively.
      </p>
    </div>
  );
}
