import React, { useEffect } from 'react';
import { useTimelineStore } from '../../../stores/ide/timelineStore';
import { TimelineService } from '../../../services/timeline/TimelineService';
import { GitCommit, Save, Sparkles, Clock, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { CommandRegistry } from '../../../lib/registries/CommandRegistry';

export function TimelineView() {
  const { items, isLoading, error } = useTimelineStore();

  useEffect(() => {
    TimelineService.setVisibility(true);
    return () => {
      TimelineService.setVisibility(false);
    };
  }, []);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'git-commit':
        return <GitCommit size={14} className="text-blue-500" />;
      case 'save':
        return <Save size={14} className="text-green-500" />;
      case 'sparkles':
        return <Sparkles size={14} className="text-purple-500" />;
      default:
        return <Clock size={14} className="text-muted-foreground" />;
    }
  };

  const handleItemClick = (item: any) => {
    if (item.command) {
      CommandRegistry.executeCommand(item.command, item);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="absolute top-1 right-2 z-10 flex gap-2">
        <button
          onClick={() => TimelineService.refresh()}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          title="Refresh timeline"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pt-6">
        {error ? (
          <div className="p-4 flex flex-col items-center justify-center text-center text-sm text-destructive gap-2 h-full">
            <AlertCircle size={24} />
            <p>{error}</p>
          </div>
        ) : items.length > 0 ? (
          <div className="relative border-l border-border/50 ml-4 pl-4 space-y-4 pb-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative cursor-pointer group"
                onClick={() => handleItemClick(item)}
              >
                <div className="absolute -left-6 top-1 bg-background">{getIcon(item.icon)}</div>
                <div className="text-sm font-medium group-hover:text-primary transition-colors">
                  {item.title}
                </div>
                <div className="text-xs text-muted-foreground flex justify-between items-center pr-2 mt-0.5">
                  <span>{item.description}</span>
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !isLoading && (
            <div className="p-4 text-center text-sm text-muted-foreground">No history found</div>
          )
        )}
      </div>
    </div>
  );
}
