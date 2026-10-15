export const SkeletonList = ({ title }: { title: string }) => {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-2xl bg-background p-4 ring-1 ring-border/60">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="size-11 shrink-0 rounded-2xl bg-muted animate-pulse" />

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="h-4 w-36 rounded bg-muted animate-pulse" />
                  <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                  <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <div className="h-9 w-20 rounded-xl bg-muted animate-pulse" />
              <div className="h-9 w-9 rounded-xl bg-muted animate-pulse" />
              <div className="h-9 w-9 rounded-xl bg-muted animate-pulse" />
              <div className="h-6 w-11 rounded-full bg-muted animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};