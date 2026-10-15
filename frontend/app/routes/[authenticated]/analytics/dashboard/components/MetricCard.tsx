import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "framer-motion";
import { memo } from "react";
import Panel from "./Panel";
import StatusPill from "./StatusPill";

const MetricCard = memo(function MetricCard({
  title,
  value,
  stats,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: any;
  tone: "success" | "warning";
  stats: { label: string; value: string | number; tone: "success" | "warning" | "error" | "info" | "muted" }[];
}) {
  const color = tone === "success" ? "var(--success)" : "var(--warning)";

  return (
    <motion.div whileHover={{ y: -3 }}>
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <h3 className="mt-3 text-3xl font-semibold text-foreground">{Number(value).toLocaleString()}</h3>

            <div className="mt-5 flex flex-wrap gap-2">
              {stats.map(item => (
                <StatusPill key={item.label} {...item} />
              ))}
            </div>
          </div>

          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}>
            <HugeiconsIcon icon={icon} size={20} />
          </div>
        </div>
      </Panel>
    </motion.div>
  );
});

export default MetricCard;
