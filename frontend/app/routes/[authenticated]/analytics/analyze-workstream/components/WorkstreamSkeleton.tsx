export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-muted/35 p-2">
      <div className="rounded-xl bg-background p-5 ring-1 ring-border/60">
        <div className="mx-auto h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mx-auto mt-3 h-7 w-20 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function TableSkeletonRow() {
  return (
    <tr className="border-t border-border/60">
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </td>
      ))}
    </tr>
  );
}
