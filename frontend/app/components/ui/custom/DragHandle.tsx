import { createPortal } from "react-dom";

import type { DragGhostState } from "@/lib/reorder";
import { cn } from "@/lib/utils";

/**
 * The six-dot grip. It is the one affordance people already read as "pick this up and move
 * it". It has a visible outline at rest, so it is findable in a wide table, and the cursor
 * becomes a grabbing hand once the drag starts.
 */
export const DragHandle = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span
    {...props}
    className={cn(
      "inline-flex cursor-grab select-none items-center justify-center rounded-md border border-border bg-background p-1.5 text-muted-foreground shadow-sm",
      "transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary active:cursor-grabbing active:bg-primary active:text-primary-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      className
    )}>
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="3" r="1.4" />
      <circle cx="8" cy="3" r="1.4" />
      <circle cx="2" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="2" cy="13" r="1.4" />
      <circle cx="8" cy="13" r="1.4" />
    </svg>
  </span>
);

/** A label that follows the pointer while a row is being dragged, naming what is being carried. */
export const DragGhost = ({ ghost }: { ghost: DragGhostState | null }) => {
  if (!ghost || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden="true"
      style={{ position: "fixed", left: ghost.x + 14, top: ghost.y + 14 }}
      className="pointer-events-none z-[100] flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-2xl ring-2 ring-primary-foreground/30">
      <span aria-hidden>⠿</span>
      {ghost.label}
    </div>,
    document.body
  );
};
