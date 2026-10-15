import { cn } from "@/lib/utils";
import React from "react";

const Panel = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  return (
    <div className="rounded-3xl bg-muted/40 p-2">
      <div className={cn("rounded-[22px] bg-background shadow-soft ring-1 ring-border/60", className)}>{children}</div>
    </div>
  );
};

export default Panel;
