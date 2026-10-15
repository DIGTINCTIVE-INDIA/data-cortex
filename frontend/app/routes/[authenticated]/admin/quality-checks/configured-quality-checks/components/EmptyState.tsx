import { Button } from "@/components/ui/button";
import { AddCircleIcon, DocumentValidationIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "react-router";

type props = {
  title?: string;
  description?: string;
};

export const EmptyState = ({
  title = "No File Configurations Yet",
  description = "Start by creating a new file-based QC configuration.",
}: props) => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[250px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <HugeiconsIcon icon={DocumentValidationIcon} size={30} />
      </div>

      <h3 className="text-base font-semibold text-foreground">{title}</h3>

      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <Button className="mt-5 h-10 rounded-xl" onClick={() => navigate("/admin/quality-checks/qc-configuration")}>
        <HugeiconsIcon icon={AddCircleIcon} size={16} />
        Create Configuration
      </Button>
    </div>
  );
};
