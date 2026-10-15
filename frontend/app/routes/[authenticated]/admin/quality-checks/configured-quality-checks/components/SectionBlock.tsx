import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import React from "react";

const SectionBlock = ({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: any;
  children: React.ReactNode;
}) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={icon} size={20} />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>

            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      <Panel className="p-5">{children}</Panel>
    </div>
  );
};

export default SectionBlock;

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-muted/40 p-2">
      <div className={cn("rounded-[22px] bg-card ring-1 ring-border/60", className)}>{children}</div>
    </div>
  );
}


