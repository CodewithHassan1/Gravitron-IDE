import React from 'react';
import { Loader2, LucideIcon } from 'lucide-react';

export interface LoadingStateProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
}

export function LoadingState({ icon: Icon, title, subtitle }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
      <div className="flex items-center justify-center w-12 h-12 mb-4">
        {Icon ? (
          <Icon className="w-6 h-6 text-muted-foreground animate-pulse" />
        ) : (
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        )}
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      {subtitle && (
        <p className="text-xs text-muted-foreground max-w-[250px]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
