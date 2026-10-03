import React from 'react';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbsProps {
  path: string;
}

export function Breadcrumbs({ path }: BreadcrumbsProps) {
  if (!path) return null;
  const segments = path.split('/').filter(Boolean);

  return (
    <div className="flex items-center h-6 px-4 bg-background text-xs text-muted-foreground border-b border-border overflow-hidden shrink-0">
      <span className="cursor-pointer hover:text-foreground">Workspace</span>
      {segments.map((segment, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
          <span className="cursor-pointer hover:text-foreground truncate max-w-[150px]">
            {segment}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
