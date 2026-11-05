import * as React from 'react';
import { cn } from '../lib/utils';

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export function Toolbar({
  orientation = 'horizontal',
  className,
  children,
  ...props
}: ToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-orientation={orientation}
      className={cn(
        'flex items-center gap-1 p-1 bg-muted/50 rounded-md',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
