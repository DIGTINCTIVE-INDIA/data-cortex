import { useAuthStore } from "@/contexts/AuthContext";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { BaseUIEvent } from "@base-ui/react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

/* ===============================
   🎯 BUTTON VARIANTS
================================ */

const buttonVariants = cva(
  [
    "relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
    "rounded-xl font-medium transition-all duration-200",
    "outline-none select-none",
    "disabled:pointer-events-none disabled:opacity-50",

    // Better sizing
    "h-10 px-4 text-sm",

    // Focus
    "focus-visible:ring-2 focus-visible:ring-primary/30",

    // Icon handling
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: ["bg-primary text-primary-foreground", "hover:bg-primary/90", "active:scale-[0.98]", "shadow-sm"].join(
          " "
        ),

        secondary: ["bg-muted text-foreground", "hover:bg-muted/80"].join(" "),

        outlinePrimary: ["border border-primary text-primary", "hover:bg-primary/10"].join(" "),

        outline: ["border border-border text-foreground", "hover:bg-muted"].join(" "),

        ghost: ["text-muted-foreground", "hover:bg-muted hover:text-foreground"].join(" "),

        error: ["bg-destructive text-destructive-foreground", "hover:bg-destructive/90"].join(" "),

        errorSoft: ["bg-destructive/10 text-destructive", "hover:bg-destructive/20"].join(" "),

        success: ["bg-[var(--success)] text-white", "hover:opacity-90"].join(" "),

        link: ["text-primary underline-offset-4", "hover:underline", "p-0 h-auto"].join(" "),
      },

      size: {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base",
        xl: "h-12 px-6 text-base",

        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },

    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

const buttonLoaderVariants = cva("absolute inset-0 flex items-center justify-center", {
  variants: {
    variant: {
      primary: "text-primary-foreground",
      secondary: "text-foreground",
      outlinePrimary: "text-primary",
      outline: "text-foreground",
      ghost: "text-foreground",
      error: "text-destructive-foreground",
      errorSoft: "text-destructive",
      success: "text-white",
      link: "text-primary",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

function ButtonSpinner() {
  return (
    <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
  );
}

/* ===============================
   🎯 COMPONENT
================================ */

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
    onlyAdmin?: boolean;
    /** Disables the control unless the signed-in role has this permission. */
    requires?: Permission;
  };

function Button({
  onlyAdmin,
  requires,
  className,
  variant,
  size,
  isLoading = false,
  disabled,
  children,
  render,
  onClick,
  ...props
}: ButtonProps) {
  const role = useAuthStore(state => state.auth.session?.role);
  const needed: Permission | undefined = requires ?? (onlyAdmin ? "admin" : undefined);
  const isDisabled = needed !== undefined && !can(role, needed);

  const handleClick = (e: BaseUIEvent<React.MouseEvent<HTMLButtonElement, MouseEvent>>) => {
    if (isDisabled) return;
    onClick?.(e);
  };

  const content = (
    <>
      <span className={cn("inline-flex items-center justify-center gap-2", isLoading && "invisible")}>{children}</span>

      {isLoading && (
        <span className={buttonLoaderVariants({ variant })}>
          <ButtonSpinner />
        </span>
      )}
    </>
  );

  return (
    <ButtonPrimitive
      data-slot="button"
      disabled={disabled || isLoading || isDisabled}
      aria-busy={isLoading}
      className={cn(buttonVariants({ variant, size }), className)}
      render={render}
      onClick={handleClick}
      {...props}>
      {content}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
