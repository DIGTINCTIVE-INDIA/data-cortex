export const toApiNumber = (value: string) => (value === "all" ? undefined : Number(value));

export const toQcAlertPeriod = (period: string) => {
  if (period === "launch_to_date" || period === "current_batch") return "ltd";
  return period;
};
