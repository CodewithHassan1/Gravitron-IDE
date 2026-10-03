import React from 'react';
import { AlertTriangle, LucideIcon } from 'lucide-react';
import { Button } from './button';

export interface ErrorStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ 
  icon: Icon = AlertTriangle, 
  title, 
  description, 
  onRetry,
  retryLabel = 'Retry'
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
        <Icon className="w-6 h-6 text-destructive" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground max-w-[250px] mb-4">
          {description}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
