import { Database01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "./EmptyState";
import SectionBlock from "./SectionBlock";

type Props = {
  workstream: string;
};

export const KpiCheckList = ({ workstream }: Props) => {
  const kpiList = [] as any[];
  return (
    <SectionBlock
      title="KPI Variance Checks"
      description="Monitor KPI variance and threshold breaches."
      icon={Database01Icon}>
      {kpiList.length === 0 ? (
        <EmptyState title="No KPI Checks Yet" description="Create a KPI variance configuration." />
      ) : (
        <div className="space-y-3">
          {kpiList.map(item => (
            <KpiCheckCard key={item.configId} item={item} />
          ))}
        </div>
      )}
    </SectionBlock>
  );
};

const KpiCheckCard = (item: any) => {
  return <div>KpiCheckCard</div>;
};
