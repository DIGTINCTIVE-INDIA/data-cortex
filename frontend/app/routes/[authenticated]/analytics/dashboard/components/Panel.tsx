import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-muted/35 p-2">
      <div className={cn("rounded-[22px] bg-card shadow-soft ring-1 ring-border/70", className)}>{children}</div>
    </div>
  );
}

export default Panel;
