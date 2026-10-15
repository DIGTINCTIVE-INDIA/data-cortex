"use client";

import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { motion } from "framer-motion";

/* ===============================
   ROOT
================================ */

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("w-full flex flex-col gap-5", className)} {...props} />;
}

/* ===============================
   LIST
================================ */

export function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // layout
        "relative inline-flex items-center",

        // spacing
        "p-1.5",

        // shape
        "rounded-2xl",

        // bg (clean subtle)
        "bg-muted",

        // prevent overflow bugs
        "isolate",

        className
      )}
      {...props}
    />
  );
}

/* ===============================
   TRIGGER
================================ */

export function TabsTrigger({ className, children, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative flex items-center justify-center gap-2",

        // size (FIXED GOOD SIZE)
        "h-11 px-5",

        // typography
        "text-sm font-medium",

        // default state
        "text-muted-foreground",

        // hover
        "hover:text-foreground",

        // active text
        "data-[selected]:text-primary-foreground",

        // smooth
        "transition-colors duration-200",

        className
      )}
      {...props}>
      {/* ACTIVE INDICATOR */}
      <span className="absolute inset-0 z-0">
        <TabsPrimitive.Indicator>
          <motion.div
            layoutId="tabs-indicator"
            className={cn(
              "w-full h-full",

              // IMPORTANT → perfect rounded inside container
              "rounded-xl",

              // primary bg
              "bg-primary",

              // depth
              "shadow-sm"
            )}
            transition={{
              type: "spring",
              stiffness: 320,
              damping: 30,
            }}
          />
        </TabsPrimitive.Indicator>
      </span>

      {/* CONTENT */}
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </TabsPrimitive.Tab>
  );
}

/* ===============================
   CONTENT
================================ */

export function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("outline-none", "animate-in fade-in-50 duration-200", className)}
      {...props}
    />
  );
}
