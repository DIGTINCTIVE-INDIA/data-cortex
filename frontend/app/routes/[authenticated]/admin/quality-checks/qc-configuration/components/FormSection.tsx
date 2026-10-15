import type { ReactNode } from "react";

/**
 * A titled group inside a long configuration form.
 *
 * These forms used to be one unbroken run of fields -- name, workstream, category,
 * source, description, downstream, connections -- so nothing said which fields belonged
 * together or what each block was for. A heading and a one-line purpose per group is
 * all it takes; the fields themselves are unchanged.
 */
export function FormSection({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 border-t border-border/60 pt-7 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {step}
        </span>

        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="space-y-5 md:pl-10">{children}</div>
    </section>
  );
}
