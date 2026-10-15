const StatusPill = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "success" | "warning" | "error" | "info" | "muted";
}) => {
  const style = toneStyles[tone];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        color: style.color,
        backgroundColor: style.background,
        borderColor: style.border,
      }}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
      <span className="font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</span>
    </span>
  );
};

export default StatusPill;

const toneStyles = {
  success: {
    color: "var(--success)",
    background: "color-mix(in oklab, var(--success) 10%, transparent)",
    border: "color-mix(in oklab, var(--success) 25%, transparent)",
  },

  warning: {
    color: "var(--warning)",
    background: "color-mix(in oklab, var(--warning) 10%, transparent)",
    border: "color-mix(in oklab, var(--warning) 25%, transparent)",
  },

  error: {
    color: "var(--destructive)",
    background: "color-mix(in oklab, var(--destructive) 10%, transparent)",
    border: "color-mix(in oklab, var(--destructive) 25%, transparent)",
  },

  info: {
    color: "var(--info)",
    background: "color-mix(in oklab, var(--info) 10%, transparent)",
    border: "color-mix(in oklab, var(--info) 35%, transparent)",
  },

  muted: {
    color: "var(--muted-foreground)",
    background: "var(--muted)",
    border: "var(--border)",
  },
};
