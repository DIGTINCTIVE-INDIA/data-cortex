import SuspenseFallback from "@/components/layout/SuspenseFallback";
import { lazy, Suspense } from "react";

const DashboardPage = lazy(() => import("./lazy"));

// Bar = Trend , Pie = Distribution
const Index = () => {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <DashboardPage />
    </Suspense>
  );
};

export default Index;
