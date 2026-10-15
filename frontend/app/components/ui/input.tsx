import { cn } from "@/lib/utils";
import { Input as InputPrimitive } from "@base-ui/react/input";
import * as React from "react";

import { useAuthStore } from "@/contexts/AuthContext";
import { can, type Permission } from "@/lib/permissions";
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type InputProps = React.ComponentProps<"input"> & {
  label?: string;
  error?: string;
  onlyAdmin?: boolean;
  requires?: Permission;
  /** Shows a * beside the label. Marking only -- validation stays with the form. */
  required?: boolean;
};

function Input({ onlyAdmin, requires, className, type, label, error, id, required, ...props }: InputProps) {
  const role = useAuthStore(state => state.auth.session?.role);
  const needed: Permission | undefined = requires ?? (onlyAdmin ? "admin" : undefined);
  const isDisabled = needed !== undefined && !can(role, needed);

  const inputId = id ?? React.useId();

  const isPassword = type === "password";
  const [showPassword, setShowPassword] = React.useState(false);

  const resolvedType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className="w-full space-y-1.5">
      <div
        className={cn(
          "relative w-full rounded-xl border bg-muted/50 backdrop-blur-sm",
          "border-border transition-all duration-200 ease-out",
          "hover:bg-muted",
          "focus-within:border-primary focus-within:bg-background",
          "focus-within:shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_14%,transparent)]",
          "has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed",
          error && "border-destructive shadow-[0_0_0_2px_color-mix(in_oklab,var(--destructive)_14%,transparent)]",
          "dark:bg-muted/40 dark:hover:bg-muted/60"
        )}>
        {/* LABEL */}
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "absolute -top-2 left-3 z-10 px-1.5",
              "rounded-md bg-background text-[11px] font-medium",
              "text-foreground/70",
              "transition-colors duration-200",
              "peer-focus:text-primary",
              error && "text-destructive"
            )}>
            {label}
            {required && (
              <span aria-hidden="true" className="ml-0.5 text-destructive">
                *
              </span>
            )}
          </label>
        )}

        {/* INPUT */}
        <InputPrimitive
          aria-required={required || undefined}
          disabled={props.disabled || isDisabled}
          id={inputId}
          type={resolvedType}
          data-slot="input"
          aria-invalid={!!error}
          className={cn(
            "peer w-full min-w-0 bg-transparent",
            "h-11 px-3 text-sm",
            "text-foreground placeholder:text-muted-foreground/55",
            "outline-none transition-all duration-200 ease-out",
            "active:scale-[0.995]",
            "disabled:cursor-not-allowed",

            // 👇 space for eye icon
            isPassword && "pr-10",

            className
          )}
          {...props}
        />

        {/* 👁 PASSWORD TOGGLE */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2",
              "flex items-center justify-center size-7 rounded-md",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-muted/60 transition"
            )}
            tabIndex={-1}>
            <HugeiconsIcon icon={showPassword ? ViewOffSlashIcon : ViewIcon} size={18} />
          </button>
        )}
      </div>

      {/* ERROR */}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export { Input };
