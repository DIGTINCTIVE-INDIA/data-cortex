import PageHeader from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/useApi";
import { useMemo } from "react";

type Props = {
  workstream: string;
  setWorkstream: (value: string) => void;
};

const ConfiguredChecksHeader = ({ workstream, setWorkstream }: Props) => {
  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");

  const allWorkstreams = libraries?.data?.workstream || [];
  
  const workstreamOptions = useMemo(() => {
    return [
      {
        label: "All Workstreams",
        value: "all",
      },

      ...allWorkstreams.map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ];
  }, [allWorkstreams]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <PageHeader
        title="Configured Quality Checks"
        description="View, manage, and run configured quality checks across workstreams."
      />

      <div className="w-full lg:w-72">
        <Select
          value={workstream}
          onValueChange={value => {
            if (!value) return;

            setWorkstream(value);
          }}>
          <SelectTrigger label="Filter by Workstream" className="h-11 rounded-2xl bg-card">
            <SelectValue placeholder="Select workstream">
              {workstreamOptions.find(item => item.value === workstream)?.label}
            </SelectValue>
          </SelectTrigger>

          <SelectContent>
            {workstreamOptions.map(item => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default ConfiguredChecksHeader;
