import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Item = { id: number; tagTitle: string };

/**
 * Pick the downstream systems a check affects.
 *
 * Every option stays where it is. Choosing one only highlights it, and the ones not
 * chosen are dimmed -- nothing moves between groups, so the list never reshuffles under
 * the pointer (the earlier version lifted a chosen option into a separate row above).
 * Sized as a normal form field, so it sits in the grid with the others.
 */
export function DownstreamPicker<T extends Item>({
  items,
  selected,
  onToggle,
  isLoading,
  required,
  error,
}: {
  items: T[];
  selected: number[];
  onToggle: (item: T) => void;
  isLoading?: boolean;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">
        Impacted Downstream {required && <span className="text-destructive">*</span>}
      </Label>

      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-2">
        {isLoading ? (
          [0, 1, 2].map(i => <div key={i} className="h-7 w-20 animate-pulse rounded-lg bg-muted" />)
        ) : items.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">None configured yet. An administrator adds them under Libraries.</p>
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
                    : "bg-muted/60 text-muted-foreground opacity-60 hover:opacity-100"
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
