const COLUMNS = ["Column", "Type", "Primary key", "Null", "Duplicate", "Length", "Format", "List of values", "Reference"];

/**
 * The shape of the field table, drawn before there are columns to put in it.
 *
 * Static on purpose -- no shimmer, no spinner, no "loading" wording. Nothing is being
 * waited for here: the page is simply waiting to be told where the columns come from.
 * The outline only shows what the table will look like so the page does not jump when it
 * arrives.
 */
export function FieldRulesPlaceholder({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-2xl border border-border/70 bg-card opacity-60">
      <div className="grid grid-cols-9 gap-3 border-b border-border/70 bg-muted/40 px-4 py-3">
        {COLUMNS.map(name => (
          <span key={name} className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {name}
          </span>
        ))}
      </div>

      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="grid grid-cols-9 items-center gap-3 border-b border-border/40 px-4 py-3.5 last:border-b-0">
          <span className="h-3 w-3/4 rounded bg-muted" />
          <span className="h-3 w-1/2 rounded bg-muted" />
          {Array.from({ length: 7 }).map((__, cell) => (
            <span key={cell} className="size-4 rounded border border-border/80" />
          ))}
        </div>
      ))}
    </div>
  );
}
