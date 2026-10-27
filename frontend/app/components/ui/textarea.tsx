import { InfoHint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import * as React from "react";

type TextareaProps = React.ComponentProps<"textarea"> & {
  label?: string;
  error?: string;
  required?: boolean;
  hint?: string;
};

function Textarea({ className, label, error, required = false, hint, id, ...props }: TextareaProps) {
  const textareaId = id ?? React.useId();

  return (
    <div className="w-full space-y-1.5">
      <div
        className={cn(
          "relative w-full rounded-xl border bg-muted/60 backdrop-blur-sm",
          "border-border transition-all duration-200 ease-out",
          "hover:bg-muted",
          "focus-within:border-primary focus-within:bg-background",
          "focus-within:shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_14%,transparent)]",
          "has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed",
          error && "border-destructive shadow-[0_0_0_2px_color-mix(in_oklab,var(--destructive)_14%,transparent)]",
          "dark:bg-muted/40 dark:hover:bg-muted/60"
        )}>
        {label && (
          <label
            htmlFor={textareaId}
            className={cn(
              "absolute -top-2 left-3 z-10 px-1.5",
              "rounded-md bg-background text-[11px] font-medium",
              "text-foreground/70",
              "transition-colors duration-200",
              error && "text-destructive"
            )}>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
            {hint && <InfoHint text={hint} />}
          </label>
        )}

        <textarea
          id={textareaId}
          data-slot="textarea"
          aria-invalid={!!error}
          className={cn(
            "w-full min-w-0 text-sm",
            "min-h-28 px-3 py-3",
            "bg-transparent",
            "text-foreground placeholder:text-muted-foreground",
            "outline-none transition-all duration-200 ease-out",
            "active:scale-[0.995]",
            "resize-y",
            "disabled:cursor-not-allowed",
            className
          )}
          {...props}
        />
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export { Textarea };
