"use client";

import PageHeader from "@/components/layout/PageHeader";
import ReactECharts from "echarts-for-react";
import { useRef } from "react";
import { useNavigate } from "react-router";
import AlertsPanel from "./components/AlertsPanel";
import DashboardFilter from "./components/DashboardFilter";
import QualityIssuesSection from "./components/QualityIssuesSection";
import SourceChartSection from "./components/SourceChartSection";
import StatusChartSection from "./components/StatusChartSection";
import SummarySection from "./components/SummarySection";

const DataQualityDashboard = () => {
  const navigate = useNavigate();

  const sourceChartRef = useRef<ReactECharts>(null);
  const issuesChartRef = useRef<ReactECharts>(null);

  return (
    <>
      <PageHeader title="Data Quality Monitoring" description="Overview of your data quality management system" />

      <DashboardFilter />
      <SummarySection />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-2">
            <StatusChartSection />
            <SourceChartSection chartRef={sourceChartRef} />
          </div>

          <QualityIssuesSection chartRef={issuesChartRef} />
        </div>

        <aside className="sticky top-6 self-start">
          <AlertsPanel onOpen={() => navigate("/investigate/qc-alerts")} />
        </aside>
      </div>
    </>
  );
};

export default DataQualityDashboard;
