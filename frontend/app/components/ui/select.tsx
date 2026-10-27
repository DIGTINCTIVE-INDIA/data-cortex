import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ArrowDown01Icon, ArrowUp01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { InfoHint } from "@/components/ui/hint";
import { useAuthStore } from "@/contexts/AuthContext";

import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn("p-1.5", className)} {...props} />;
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 items-center text-left truncate", className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  label,
  error,
  required = false,
  isLoading = false,
  onlyAdmin,
  requires,
  hint,
  empty = false,
  emptyText = "Nothing to choose from yet",
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
  label?: string;
  error?: string;
  required?: boolean;
  isLoading?: boolean;
  onlyAdmin?: boolean;
  requires?: Permission;
  /** Explanation shown on hover of a small "i" in the label. */
  hint?: string;
  /**
   * The list has no options. The field is shown disabled with `emptyText` as its placeholder,
   * instead of opening a menu with nothing in it.
   */
  empty?: boolean;
  emptyText?: string;
}) {
  const triggerId = props.id ?? React.useId();

  const role = useAuthStore(state => state?.auth?.session?.role);
  const needed: Permission | undefined = requires ?? (onlyAdmin ? "admin" : undefined);
  const isDisabled = needed !== undefined && !can(role, needed);

  return (
    <div className="w-full space-y-1.5">
      <div className="relative">
        {label && (
          <label
            htmlFor={triggerId}
            className={cn(
              "absolute -top-2 left-3 z-10 px-1.5",
              "rounded-md bg-background text-[11px] font-medium",
              "text-foreground/70",
              error && "text-destructive"
            )}>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
            {hint && <InfoHint text={hint} />}
          </label>
        )}

        <SelectPrimitive.Trigger
          id={triggerId}
          data-slot="select-trigger"
          data-size={size}
          aria-invalid={!!error || props["aria-invalid"]}
          disabled={isLoading || props.disabled || isDisabled || (empty && !isLoading)}
          className={cn(
            "group/select flex w-full min-w-0 items-center justify-between gap-3",
            "rounded-xl bg-muted/50 px-3.5 text-sm text-foreground",
            "border border-border shadow-none outline-none select-none",
            "transition-all duration-200 ease-out",
            "hover:bg-muted",
            "focus-visible:bg-background focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_14%,transparent)]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            "aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_14%,transparent)]",
            "data-placeholder:text-muted-foreground",
            "data-[size=default]:h-11 data-[size=sm]:h-9 data-[size=sm]:rounded-lg",
            "*:data-[slot=select-value]:line-clamp-1",
            "[&_svg]:shrink-0",
            label && "pt-0",
            className
          )}
          {...props}>
          {isLoading ? (
            <div></div>
          ) : empty ? (
            <span className="flex-1 truncate text-left text-muted-foreground">{emptyText}</span>
          ) : (
            children
          )}

          {isLoading ? (
            <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
              <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </span>
          ) : (
            <SelectPrimitive.Icon
              render={
                <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition group-data-open/select:rotate-180 group-hover/select:text-foreground">
                  <HugeiconsIcon icon={ArrowDown01Icon} size={18} />
                </span>
              }
            />
          )}
        </SelectPrimitive.Trigger>
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 8,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative isolate z-50 w-(--anchor-width) min-w-48 max-h-[280px]",
            "overflow-hidden rounded-2xl bg-popover text-popover-foreground",
            "shadow-[0_18px_50px_-18px_rgba(0,0,0,0.35)] ring-1 ring-border/70",
            "p-1.5",
            "origin-(--transform-origin) duration-150",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:slide-in-from-top-1",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}>
          <SelectScrollUpButton />
          <SelectPrimitive.List className="max-h-[260px] overflow-y-auto pr-1">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "group/item relative flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 pr-9",
        "text-sm text-muted-foreground outline-none select-none transition-all",
        "hover:bg-muted hover:text-foreground",
        "focus:bg-muted focus:text-foreground",
        "data-selected:bg-primary/10 data-selected:text-primary",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}>
      <SelectPrimitive.ItemText className="flex flex-1 items-center gap-2 truncate whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>

      <SelectPrimitive.ItemIndicator
        render={
          <span className="absolute right-3 flex size-5 items-center justify-center rounded-full text-primary" />
        }>
        <HugeiconsIcon icon={Tick02Icon} size={16} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none my-1 h-px bg-border/70", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "flex w-full cursor-default items-center justify-center rounded-lg bg-popover py-1 text-muted-foreground",
        className
      )}
      {...props}>
      <HugeiconsIcon icon={ArrowUp01Icon} size={16} />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "flex w-full cursor-default items-center justify-center rounded-lg bg-popover py-1 text-muted-foreground",
        className
      )}
      {...props}>
      <HugeiconsIcon icon={ArrowDown01Icon} size={16} />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
