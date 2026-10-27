import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/**
 * "Create landing table" with its name field. The field is always on screen but blurred and
 * inert until the box is ticked, so the form does not change shape when it is. Not disabled
 * but read-only while off, so the form library keeps it out of the way of validation (the
 * caller only applies the "required" rule while it is ticked).
 */
export function LandingTableField({
  checked,
  onCheckedChange,
  error,
  placeholder = "landing_customer_master",
  inputProps,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
  placeholder?: string;
  inputProps: ComponentProps<"input">;
}) {
  return (
    <div className="flex w-fit max-w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-muted/30 px-4 py-3">
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={value => onCheckedChange(Boolean(value))} className="border border-blue-500" />
        <span className="text-sm font-medium text-foreground">Create landing table</span>
      </label>

      <div
        aria-hidden={!checked}
        className={cn(
          "w-64 transition-all duration-200",
          !checked && "pointer-events-none select-none opacity-60 blur-[1.5px]"
        )}>
        <Input
          aria-label="Landing table name"
          label="Landing table"
          required={checked}
          readOnly={!checked}
          tabIndex={checked ? 0 : -1}
          error={checked ? error : undefined}
          className="font-mono"
          placeholder={placeholder}
          {...inputProps}
        />
      </div>
    </div>
  );
}
