"use client";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { useState } from "react";
import ConfiguredChecksHeader from "./components/ConfiguredChecksHeader";
import { DataConformList } from "./components/DataConformList";
import { SqlCheckList } from "./components/SqlCheckList";
import { configuredCheckTabs, type TabValue } from "./constants";

const ConfiguredQualityChecksPage = () => {
  const [tab, setTab] = useState<TabValue>("dataconform");
  const [workstream, setWorkstream] = useState<string>("all");

  return (
    <>
      <ConfiguredChecksHeader workstream={workstream} setWorkstream={setWorkstream} />

      <AnimatedTabs
        value={tab}
        btnClassName="min-w-[200px]"
        onValueChange={value => setTab(value as TabValue)}
        tabs={configuredCheckTabs}
      />

      {tab === "dataconform" && <DataConformList workstream={workstream} />}

      {tab === "sql" && <SqlCheckList workstream={workstream} />}
    </>
  );
};

export default ConfiguredQualityChecksPage;
