import type { ReactNode } from "react";

export const ChartEmpty = ({ isEmpty, children }: { isEmpty: boolean; children: ReactNode }) => {
  if (isEmpty) return <EmptyState message="No chart data found for selected filters." />;
  return <>{children}</>;
};

export const EmptyState = ({ message }: { message: string }) => {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
};
