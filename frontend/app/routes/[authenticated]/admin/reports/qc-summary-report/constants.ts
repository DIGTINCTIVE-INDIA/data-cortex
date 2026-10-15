export type TabValue = "batch" | "week" | "month";

export const periodMap: Record<TabValue, string> = {
  batch: "current_batch",
  week: "current_week",
  month: "current_month",
};
