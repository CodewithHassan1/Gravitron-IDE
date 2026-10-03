import * as React from "react"
import { cn } from "../lib/utils"

export interface PanelHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode
  actions?: React.ReactNode
}

export function PanelHeader({ title, actions, className, ...props }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex h-9 items-center justify-between px-4 border-b border-border/50 bg-card shrink-0",
        className
      )}
      {...props}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-foreground">
        {title}
      </div>
      {actions && (
        <div className="flex items-center gap-1">
          {actions}
        </div>
      )}
    </div>
  )
}
