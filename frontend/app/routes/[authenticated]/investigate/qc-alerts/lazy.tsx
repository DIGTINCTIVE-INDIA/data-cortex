"use client";

import PageHeader from "@/components/layout/PageHeader";
import { useUrlParamsValue } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import type { QcAlertsQuery } from "@/lib/useApi/types/qcAlerts.types";
import { useMemo } from "react";
import QcAlertsFiltersSection, { defaultQcAlertsUrlParams } from "./components/QcAlertsFiltersSection";
import QcAlertsList from "./components/QcAlertsList";
import QcAlertsSummaryCard from "./components/QcAlertsSummaryCard";

const QCAlertsPage = () => {
  const params = useUrlParamsValue(defaultQcAlertsUrlParams);
  const { category, criticality, impacted_downstream, time_period, workstream, tab, search } = params;

 const query: QcAlertsQuery = useMemo(() => {
    return {
      search: search !== "" ? search : undefined,
      criticality: criticality === "all" ? undefined : criticality,
      status: tab,
      category: category === "all" ? undefined : Number(category),
      period: time_period as any,
      workstream: workstream === "all" ? undefined : Number(workstream),
      impactedDownstream: impacted_downstream === "all" ? undefined : Number(impacted_downstream),
    };
  }, [search, category, criticality, impacted_downstream, time_period, workstream, tab]);

  const qcAlertsApi = useApi("GET /api/reports/qc-alerts", { query });
  const summaryApi = useApi("GET /api/reports/qc-alerts/summary", { query });

  return (
    <>
      <PageHeader
        title="QC Alerts"
        description="Detailed view of active QC alerts, RCA investigations, and downstream impact."
      />

      <QcAlertsFiltersSection />
      <QcAlertsSummaryCard summaryApi={summaryApi} />
      <QcAlertsList qcAlertsApi={qcAlertsApi} summary={summaryApi.data?.data.summary} />
    </>
  );
};

export default QCAlertsPage;
