import { cn } from "@/lib/utils";
import Panel from "./Panel";

export const SkeletonBlock = ({ className }: { className?: string }) => {
  return <div className={cn("animate-pulse rounded-2xl bg-muted", className)} />;
};

export const DashboardSkeleton = () => {
  return (
    <div className="min-h-full space-y-7 pb-8">
      <div>
        <SkeletonBlock className="h-8 w-72" />
        <SkeletonBlock className="mt-2 h-4 w-96" />
      </div>

      <Panel className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-11" />
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonBlock className="h-36" />
        <SkeletonBlock className="h-36" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
            <SkeletonBlock className="h-[390px]" />
            <SkeletonBlock className="h-[390px]" />
          </div>
          <SkeletonBlock className="h-[500px]" />
        </div>
        <SkeletonBlock className="h-[620px]" />
      </div>
    </div>
  );
};
