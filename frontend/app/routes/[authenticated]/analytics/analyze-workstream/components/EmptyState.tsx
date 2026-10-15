export function EmptyState({ text }: { text: string }) {
  return (
    <div className="col-span-full rounded-2xl border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
