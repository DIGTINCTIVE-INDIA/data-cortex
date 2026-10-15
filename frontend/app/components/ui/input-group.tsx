import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type InputState = "default" | "error" | "warning" | "success";

const inputGroupVariants = cva(
  "group/input-group relative flex w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none",
  {
    variants: {
      size: {
        regular: "h-12  ",
        large: "h-14  ",
      },
    },
    defaultVariants: {
      size: "regular",
      // variant: "default",
    },
  }
);

function InputGroup({
  className,
  size,
  "data-state": state,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof inputGroupVariants> & {
    "data-state"?: InputState;
  }) {
  return (
    <div
      data-slot="input-group"
      data-size={size}
      data-state={state}
      role="group"
      className={cn(
        inputGroupVariants({ size }),
        // "group/input-group relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none in-data-[slot=combobox-content]:focus-within:border-inherit in-data-[slot=combobox-content]:focus-within:ring-0 has-disabled:bg-input/50 has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto dark:bg-input/30 dark:has-disabled:bg-input/80 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        

        // =====================
        // DEFAULT
        // =====================

        "data-[state=default]:border-dc-grey-200",
        "data-[state=default]:bg-transparent",

        "data-[state=default]:hover:bg-dc-blue-50",
        "data-[state=default]:hover:border-dc-blue-100",

        "data-[state=default]:active:bg-dc-blue-100",
        "data-[state=default]:active:border-dc-blue-300",

        "data-[state=default]:focus-visible:bg-transparent",
        "data-[state=default]:focus-visible:border-dc-blue-500",

        // =====================
        // ERROR
        // =====================

        "data-[state=error]:border-dc-red-300",
        "data-[state=error]:bg-transparent",

        "data-[state=error]:hover:bg-dc-red-50",
        "data-[state=error]:hover:border-dc-red-100",

        "data-[state=error]:active:bg-dc-red-100",
        "data-[state=error]:active:border-dc-red-300",

        "data-[state=error]:focus-visible:bg-transparent",
        "data-[state=error]:focus-visible:border-dc-red-500",

        // =====================
        // WARNING
        // =====================
        "data-[state=warning]:border-dc-amber-300",
        "data-[state=warning]:bg-transparent",

        "data-[state=warning]:hover:bg-dc-amber-50",
        "data-[state=warning]:hover:border-dc-amber-100",

        "data-[state=warning]:active:bg-dc-amber-100",
        "data-[state=warning]:active:border-dc-amber-300",

        "data-[state=warning]:focus-visible:bg-transparent",
        "data-[state=warning]:focus-visible:border-dc-amber-500",

        // =====================
        // SUCCESS
        // =====================

        "data-[state=success]:border-dc-green-300",
        "data-[state=success]:bg-transparent",

        "data-[state=success]:hover:bg-dc-green-50",
        "data-[state=success]:hover:border-dc-green-100",

        "data-[state=success]:active:bg-dc-green-100",
        "data-[state=success]:active:border-dc-green-300",

        "data-[state=success]:focus-visible:bg-transparent",
        "data-[state=success]:focus-visible:border-dc-green-500",

        "has-[>[data-align=block-end]]:h-auto",
        "has-[>[data-align=block-end]]:flex-col",
        "has-[>[data-align=block-start]]:h-auto",
        "has-[>[data-align=block-start]]:flex-col",
        "has-[>textarea]:h-auto",

        "has-[input:disabled]:bg-input/50 has-[input:disabled]:opacity-50",

        className
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] ",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-3 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
        "inline-end": "order-last pr-3 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
        "block-end": "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        inputGroupAddonVariants({ align }),
        "group-data-[size=regular]/input-group:[&>svg]:size-4",
        "group-data-[size=large]/input-group:[&>svg]:size-5",
        className
      )}
      onClick={e => {
        if ((e.target as HTMLElement).closest("button")) {
          return;
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva("flex items-center gap-2 text-sm shadow-none");

function InputGroupButton({
  className,
  type = "button",
  variant = "tertiary",
  size = "sm",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cn(inputGroupButtonVariants(), className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  "data-state": state,
  ...props
}: React.ComponentProps<"input"> & {
  "data-state"?: InputState;
}) {
  return (
    <Input
      data-slot="input-group-control"
      data-state={state}
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0",
        "group-data-[size=regular]/input-group:text-sm px-4 py-3",
        "group-data-[size=large]/input-group:text-base px-4 py-3",
        className
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea"> & {
  "data-state"?: InputState;
}) {
  return (
    <Textarea
      data-slot="input-group-control"
      data-state={props["data-state"]}
      className={cn(
        "w-full resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea };
