import { Card } from "@/components/ui/card";

export const ListSkeleton = () => {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );
};
export const SkeletonList = ({ title }: { title: string }) => {
  return (
    <Card className="p-5 rounded-2xl">
      <div className="h-4 w-40 bg-muted rounded mb-4 animate-pulse" />

      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </Card>
  );
};
