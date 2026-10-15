"use client";

import PageHeader from "@/components/layout/PageHeader";
import CardCheck from "./components/CheckCard";
import FailedCheckTable from "./components/FailedCheckTable";
import WorkstreamFilter from "./components/WorkstreamFilter";

export default function AnalyzeByWorkstreamPage() {
  return (
    <>
      <PageHeader
        title="Analyze by Workstream"
        description="Monitor and analyze data quality across business workstreams."
      />
      <WorkstreamFilter />
      <CardCheck />
      <FailedCheckTable />
    </>
  );
}
