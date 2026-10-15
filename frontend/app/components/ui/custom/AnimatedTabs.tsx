"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useState } from "react";

type TabItem = {
  value: string;
  label: ReactNode;
};

type Props = {
  tabs: TabItem[];
  value: string;
  onValueChange: (val: string) => void;
  className?: string;
  btnClassName?: string;
};

export function AnimatedTabs({ tabs, value, onValueChange, className, btnClassName }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  const activeIndex = Math.max(
    0,
    tabs.findIndex(t => t.value === value)
  );
  const width = 100 / tabs.length;

  const isHoveringDifferent = hovered !== null && hovered !== activeIndex;
  const direction = isHoveringDifferent ? (hovered! > activeIndex ? 1 : -1) : 0;

  const bulge = 18; // px

  let left = `${activeIndex * width}%`;
  let finalWidth = `${width}%`;

  if (isHoveringDifferent) {
    finalWidth = `calc(${width}% + ${bulge}px)`;

    if (direction < 0) {
      left = `calc(${activeIndex * width}% - ${bulge}px)`;
    }
  }

  return (
    <div
      className={cn(
        // tight container (NO GAP)
        "relative flex w-fit overflow-hidden rounded-xl",

        // subtle surface
        "bg-muted/60",
        "border border-border/60",

        className
      )}
      onMouseLeave={() => setHovered(null)}>
      {/* ACTIVE / BULGE INDICATOR */}
      <motion.div
        className="absolute top-0 bottom-0 z-0 rounded-xl bg-primary"
        animate={{
          left,
          width: finalWidth,
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 40,
        }}
      />

      {tabs.map((tab, i) => {
        const isActive = tab.value === value;

        return (
          <button
            key={tab.value}
            onClick={() => onValueChange(tab.value)}
            onMouseEnter={() => setHovered(i)}
            className={cn(
              "relative z-10 flex items-center text-center justify-center gap-2",

              // tighter sizing (mobile feel)
              "h-10 px-5",

              "text-sm font-medium whitespace-nowrap",

              isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",

              "transition-colors",
              btnClassName
            )}>
            <span className="[&_svg]:size-4 flex items-center gap-2">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
