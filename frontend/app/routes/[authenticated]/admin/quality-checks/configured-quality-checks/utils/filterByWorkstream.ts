export function filterByWorkstream<T extends { workstream: string | number }>(items: T[], workstream: string) {
  if (workstream === "all") {
    return items;
  }

  return items.filter(item => String(item.workstream) === workstream);
}
