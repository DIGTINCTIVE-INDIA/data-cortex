import { Link } from "react-router";

import { cn } from "@/lib/utils";

export type FlowStep = { label: string; to?: string };

/**
 * A slim progress bar for a two-step flow: where you are, and the way back.
 *
 * Earlier steps are links to exactly that step; the current one is filled; later ones are
 * plain. Connected by a line that fills as steps complete, so "step 1 of 2" is a picture
 * rather than a sentence.
 */
export function FlowSteps({ steps, current }: { steps: FlowStep[]; current: number }) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;

          const inner = (
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  active && "bg-primary text-primary-foreground shadow-sm",
                  done && "bg-primary/15 text-primary",
                  !active && !done && "bg-muted text-muted-foreground"
                )}>
                {done ? "✓" : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  active ? "text-foreground" : done ? "text-primary hover:underline" : "text-muted-foreground"
                )}>
                {step.label}
              </span>
            </span>
          );

          return (
            <li key={step.label} className="flex items-center" aria-current={active ? "step" : undefined}>
              {done && step.to ? <Link to={step.to}>{inner}</Link> : inner}

              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn("mx-4 h-0.5 w-14 rounded-full", index < current ? "bg-primary/40" : "bg-border")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
