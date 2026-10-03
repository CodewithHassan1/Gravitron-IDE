import { Files, Search, GitBranch, Play, Blocks, Settings } from "lucide-react"
import { useLayoutStore } from '../../stores/ide/layoutStore'
import { cn } from "@/lib/utils"

export function ActivityBar() {
  const activeActivity = useLayoutStore((state) => state.activeActivity)
  const setActiveActivity = useLayoutStore((state) => state.setActiveActivity)
  const isSidebarOpen = useLayoutStore((state) => state.isSidebarOpen)
  const setSidebarOpen = useLayoutStore((state) => state.setSidebarOpen)

  const handleActivityClick = (activity: string) => {
    if (activeActivity === activity && isSidebarOpen) {
      setSidebarOpen(false)
    } else {
      setActiveActivity(activity)
    }
  }

  const ActivityItem = ({ icon: Icon, id }: { icon: any, id: string }) => {
    const isActive = activeActivity === id && isSidebarOpen
    return (
      <button
        onClick={() => handleActivityClick(id)}
        className={cn(
          "w-full h-12 flex items-center justify-center relative opacity-70 hover:opacity-100 transition-opacity",
          isActive && "opacity-100 text-foreground"
        )}
      >
        {isActive && (
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
        )}
        <Icon className="w-6 h-6" />
      </button>
    )
  }

  return (
    <div className="w-12 h-full border-r border-border bg-background flex flex-col justify-between py-2 shrink-0">
      <div className="flex flex-col w-full">
        <ActivityItem icon={Files} id="explorer" />
        <ActivityItem icon={Search} id="search" />
        <ActivityItem icon={GitBranch} id="source-control" />
        <ActivityItem icon={Play} id="run-debug" />
        <ActivityItem icon={Blocks} id="extensions" />
      </div>
      <div className="flex flex-col w-full pb-2">
        <ActivityItem icon={Settings} id="settings" />
      </div>
    </div>
  )
}
