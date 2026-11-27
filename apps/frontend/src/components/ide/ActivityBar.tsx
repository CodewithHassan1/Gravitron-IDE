import { Files, Search, GitBranch, Play, Blocks, Settings, Bot } from 'lucide-react';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { cn } from '@/lib/utils';

export function ActivityBar() {
  const activeActivity = useLayoutStore((state) => state.activeActivity);
  const setActiveActivity = useLayoutStore((state) => state.setActiveActivity);
  const isSidebarOpen = useLayoutStore((state) => state.isSidebarOpen);
  const setSidebarOpen = useLayoutStore((state) => state.setSidebarOpen);

  const isSecondarySidebarOpen = useLayoutStore((state) => state.isSecondarySidebarOpen);
  const activeSecondaryActivity = useLayoutStore((state) => state.activeSecondaryActivity);
  const toggleAgentWorkspace = useLayoutStore((state) => state.toggleAgentWorkspace);

  const isAgentActive = isSecondarySidebarOpen && activeSecondaryActivity === 'ai-chat';

  const handleActivityClick = (activity: string) => {
    if (activeActivity === activity && isSidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveActivity(activity);
    }
  };

  const ActivityItem = ({
    icon: Icon,
    id,
    title,
  }: {
    icon: any;
    id: string;
    title?: string;
  }) => {
    const isActive = activeActivity === id && isSidebarOpen;
    return (
      <button
        onClick={() => handleActivityClick(id)}
        title={title}
        aria-label={title || id}
        className={cn(
          'w-full h-12 flex items-center justify-center relative opacity-70 hover:opacity-100 transition-opacity',
          isActive && 'opacity-100 text-foreground'
        )}
      >
        {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />}
        <Icon className="w-6 h-6" />
      </button>
    );
  };

  return (
    <div className="w-12 h-full border-r border-border bg-background flex flex-col justify-between py-2 shrink-0 select-none">
      <div className="flex flex-col w-full">
        <ActivityItem icon={Files} id="explorer" title="Explorer" />
        <ActivityItem icon={Search} id="search" title="Search" />
        <ActivityItem icon={GitBranch} id="source-control" title="Source Control" />
        <ActivityItem icon={Play} id="run-debug" title="Run & Debug" />
        <ActivityItem icon={Blocks} id="extensions" title="Extensions" />

        {/* Separator */}
        <div className="w-6 h-px bg-border/60 mx-auto my-2" />

        {/* Dedicated AI Agent Workspace Item */}
        <button
          onClick={toggleAgentWorkspace}
          title="AI Agent Workspace"
          aria-label="AI Agent Workspace"
          className={cn(
            'w-full h-12 flex items-center justify-center relative transition-all group',
            isAgentActive
              ? 'opacity-100 text-primary'
              : 'opacity-70 hover:opacity-100 text-muted-foreground hover:text-foreground'
          )}
        >
          {isAgentActive && (
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
          )}
          <div
            className={cn(
              'p-1.5 rounded-lg transition-colors flex items-center justify-center',
              isAgentActive ? 'bg-primary/15 text-primary' : 'group-hover:bg-muted'
            )}
          >
            <Bot className="w-5 h-5" />
          </div>
        </button>
      </div>

      <div className="flex flex-col w-full pb-2">
        <ActivityItem icon={Settings} id="settings" title="Settings" />
      </div>
    </div>
  );
}
