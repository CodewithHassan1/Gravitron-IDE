import * as React from "react"
import { cn } from "../lib/utils"

export interface ScrollableAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  horizontal?: boolean
}

export const ScrollableArea = React.forwardRef<HTMLDivElement, ScrollableAreaProps>(
  ({ className, children, horizontal, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-auto",
          horizontal ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto overflow-x-hidden",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ScrollableArea.displayName = "ScrollableArea"
