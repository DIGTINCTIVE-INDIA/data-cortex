import { cn } from "@/lib/utils";

/**
 * The six-dot grip. It is the one affordance people already read as "pick this up
 * and move it", which is why the up/down buttons that used to sit beside it are gone:
 * two controls for one operation, and the arrows were only ever there because HTML5
 * drag-and-drop ignored touch screens. The reorder hook uses Pointer Events now, so
 * the handle works for mouse, touch and pen, and the arrow keys do the same job from
 * the keyboard.
 */
export const DragHandle = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span
    {...props}
    className={cn(
      "inline-flex cursor-grab select-none items-center justify-center rounded-md p-1 text-muted-foreground",
      "transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing",
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
