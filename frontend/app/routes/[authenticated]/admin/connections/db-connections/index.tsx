import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { Add01Icon, Cancel01Icon, DatabaseIcon, FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { DatabaseForm } from "./components/DatabaseForm";
import DBConnectionsList from "./components/DBConnectionsList";
import FileStorageConnectionsList from "./components/FileConnectionsList";
import { FileStorageForm } from "./components/FileStorageForm";

export default function ConfigureConnectionsPage() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"db" | "file">("db");
  return (
    <>
      {/* ================= HEADER ================= */}
      <div className="flex items-center justify-between">
        <PageHeader title="Connections" description="Manage database and storage integrations" />

        <Button requires="configure" variant="outlinePrimary" onClick={() => setOpen(v => !v)} className="flex items-center gap-2">
          <HugeiconsIcon icon={open ? Cancel01Icon : Add01Icon} size={18} />
          {open ? "Close" : "New Connection"}
        </Button>
      </div>

      {/* ================= CREATE PANEL ================= */}
      {open && (
        <div className="rounded-3xl bg-muted p-2">
          <div className="rounded-2xl bg-background shadow-sm">
            {/* TOP BAR */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HugeiconsIcon icon={DatabaseIcon} size={18} />
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-foreground">Create Connection</h2>
                  <p className="text-xs text-muted-foreground">Configure your integration</p>
                </div>
              </div>

              {/* TABS INSIDE HEADER */}
              <AnimatedTabs
                value={tab}
                onValueChange={v => setTab(v as "db" | "file")}
                tabs={[
                  {
                    value: "db",
                    label: (
                      <>
                        <HugeiconsIcon icon={DatabaseIcon} size={16} />
                        Database
                      </>
                    ),
                  },
                  {
                    value: "file",
                    label: (
                      <>
                        <HugeiconsIcon icon={FolderIcon} size={16} />
                        Storage
                      </>
                    ),
                  },
                ]}
              />
            </div>

            {/* BODY */}
            <div className="p-6">
              {tab === "db" && <DatabaseForm />}
              {tab === "file" && <FileStorageForm />}
            </div>
          </div>
        </div>
      )}

      {/* ================= LISTS ================= */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DBConnectionsList />
        <FileStorageConnectionsList />
      </div>
    </>
  );
}
