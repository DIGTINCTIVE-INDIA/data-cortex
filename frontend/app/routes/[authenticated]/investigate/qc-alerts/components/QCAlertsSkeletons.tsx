import QcPanel from "./QcPanel";

const QCAlertsSkeletons = {
  FilterSection: (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr_1fr_1fr_1fr_1fr]">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  ),
  SummaryCards: (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <QcPanel key={index} className="p-5">
          <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        </QcPanel>
      ))}
    </div>
  ),

  AlertsList: (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-3xl bg-muted/40 p-2">
          <div className="rounded-[22px] bg-card p-5 ring-1 ring-border/60">
            <div className="animate-pulse">
              <div className="mb-4 flex gap-2">
                <div className="h-6 w-16 rounded-full bg-muted" />
                <div className="h-6 w-32 rounded-full bg-muted" />
              </div>

              <div className="h-6 w-56 rounded bg-muted" />

              <div className="mt-3 space-y-2">
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-4 w-4/5 rounded bg-muted" />
              </div>

              <div className="mt-5 flex flex-wrap gap-4">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-muted" />
              </div>

              <div className="mt-5 flex gap-2">
                <div className="h-9 w-28 rounded-xl bg-muted" />
                <div className="h-9 w-40 rounded-xl bg-muted" />
                <div className="h-9 w-32 rounded-xl bg-muted" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  ),
};

export default QCAlertsSkeletons;
