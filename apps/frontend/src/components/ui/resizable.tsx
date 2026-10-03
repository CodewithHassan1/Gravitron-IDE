"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

type ResizablePanelGroupProps =
  Omit<React.ComponentPropsWithoutRef<typeof Group>, "orientation"> & {
    direction: "horizontal" | "vertical";
  };

export function ResizablePanelGroup({
  className,
  direction,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <Group
      orientation={direction}
      className={cn(
        "flex h-full w-full",
        direction === "vertical" && "flex-col",
        className
      )}
      {...props}
    />
  );
}

import type {
  PanelImperativeHandle,
  PanelProps,
} from "react-resizable-panels";


export const ResizablePanel = React.forwardRef<
  PanelImperativeHandle,
  PanelProps
>((props, ref) => {
  return <Panel panelRef={ref} {...props} />;
});

ResizablePanel.displayName = "ResizablePanel";

type ResizableHandleProps =
  React.ComponentPropsWithoutRef<typeof Separator> & {
    withHandle?: boolean;
  };

export function ResizableHandle({
  className,
  withHandle = false,
  ...props
}: ResizableHandleProps) {
  return (
    <Separator
      className={cn(
        "relative flex items-center justify-center bg-border",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="absolute inset-0 flex items-center justify-center">
          <GripVertical className="h-3 w-3" />
        </div>
      )}
    </Separator>
  );
}