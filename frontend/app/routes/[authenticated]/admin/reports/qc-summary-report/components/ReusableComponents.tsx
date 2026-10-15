import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-muted/25 p-2">
      <div className={cn("rounded-[22px] bg-card shadow-soft ring-1 ring-border/50", className)}>{children}</div>
    </div>
  );
}

export function SectionTitle({ icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <HugeiconsIcon icon={icon} size={20} />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </div>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
      {children}
    </span>
  );
}

export function TableHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 text-left font-semibold", className)}>{children}</th>;
}

export function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-4 text-foreground", className)}>{children}</td>;
}
