import { InfoHint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

type Item = { id: number; tagTitle: string };

/**
 * Pick the downstream systems a check affects.
 *
 * Every option stays where it is. Choosing one only highlights it, and the ones not
 * chosen are dimmed -- nothing moves between groups, so the list never reshuffles under
 * the pointer. Built like the text fields around it: the label sits on the border and the
 * box takes the same fill, radius and focus ring, so it reads as one of them.
 */
export function DownstreamPicker<T extends Item>({
  items,
  selected,
  onToggle,
  isLoading,
  required,
  error,
  hint,
}: {
  items: T[];
  selected: number[];
  onToggle: (item: T) => void;
  isLoading?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="w-full space-y-1.5">
      <div
        className={cn(
          "relative flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2 py-1.5",
          "transition-all duration-200 ease-out hover:bg-muted focus-within:border-primary focus-within:bg-background",
          "dark:bg-muted/40 dark:hover:bg-muted/60",
          error && "border-destructive shadow-[0_0_0_2px_color-mix(in_oklab,var(--destructive)_14%,transparent)]"
        )}>
        <span
          className={cn(
            "absolute -top-2 left-3 z-10 rounded-md bg-background px-1.5 text-[11px] font-medium text-foreground/70",
            error && "text-destructive"
          )}>
          Impacted Downstream
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-destructive">
              *
            </span>
          )}
          {hint && <InfoHint text={hint} />}
        </span>

        {isLoading ? (
          [0, 1, 2].map(i => <div key={i} className="h-7 w-20 animate-pulse rounded-lg bg-muted" />)
        ) : items.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground/70">None configured yet. An administrator adds them under Libraries.</p>
        ) : (
          items.map(item => {
            const active = selected.includes(item.id);

            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(item)}
                className={cn(
                  "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background/70 text-muted-foreground opacity-70 hover:opacity-100"
                )}>
                {item.tagTitle}
              </button>
            );
          })
        )}
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
