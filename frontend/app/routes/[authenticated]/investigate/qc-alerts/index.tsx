import SuspenseFallback from "@/components/layout/SuspenseFallback";
import { lazy, Suspense } from "react";

const QCAlertsPage = lazy(() => import("./lazy"));

const Index = () => {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <QCAlertsPage />
    </Suspense>
  );
};

export default Index;
