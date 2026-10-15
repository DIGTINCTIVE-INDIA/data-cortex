import ReactECharts from "echarts-for-react";
import type { ExpandPanelId } from "../constants";
import type { useChartTheme } from "../hooks/useChartTheme";

export function downloadEChartAsReportPng(
  chartRef: React.RefObject<ReactECharts | null>,
  fileName: string,
  c: ReturnType<typeof useChartTheme>,
  meta: { title: string; subtitle: string; footer: string }
) {
  const instance = chartRef.current?.getEchartsInstance?.();
  if (!instance) return;

  const chartUrl = instance.getDataURL({
    type: "png",
    pixelRatio: 3,
    backgroundColor: c.card,
  });

  const img = new Image();

  img.onload = () => {
    const padding = 64;
    const headerHeight = 150;
    const footerHeight = 64;
    const width = Math.max(img.width, 1400);
    const chartWidth = width - padding * 2;
    const chartHeight = Math.round((img.height / img.width) * chartWidth);
    const height = headerHeight + chartHeight + footerHeight + padding;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = c.card;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = c.foreground;
    ctx.font = "700 34px Poppins, Inter, ui-sans-serif, system-ui";
    ctx.fillText(meta.title, padding, 58);

    ctx.fillStyle = c.mutedForeground;
    ctx.font = "500 18px Poppins, Inter, ui-sans-serif, system-ui";
    drawWrappedText(ctx, meta.subtitle, padding, 94, width - padding * 2, 26);

    ctx.drawImage(img, padding, headerHeight, chartWidth, chartHeight);

    ctx.fillStyle = c.mutedForeground;
    ctx.font = "500 16px Poppins, Inter, ui-sans-serif, system-ui";
    ctx.fillText(meta.footer, padding, headerHeight + chartHeight + 42);

    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${sanitizeFileName(fileName)}.png`);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  img.src = chartUrl;
}

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;

    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) ctx.fillText(line, x, currentY);
}

export function downloadQualityIssuesCsv(rows: any[], fileName: string) {
  const headers = ["Workstream", "Total Checks", "Total Issues", "High", "Medium", "Low"];
  const body = rows.map(row => [row.workstream, row.totalChecks, row.totalIssues, row.high, row.medium, row.low]);

  const csv = [headers, ...body]
    .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  triggerDownload(url, `${sanitizeFileName(fileName)}.csv`);
  URL.revokeObjectURL(url);
}

export function triggerDownload(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function buildExportFileName(panel: ExpandPanelId, period: string) {
  const panelName = {
    status: "issues-status",
    source: "quality-issues-by-source",
    issues: "quality-issues",
  }[panel];

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${panelName}-${period}-${stamp}`;
}

export function sanitizeFileName(value: string) {
  return value
    .replace(/[^a-z0-9-_]/gi, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function formatExportDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getExpandedTitle(panel: ExpandPanelId | null) {
  if (panel === "status") return "Issues & Status";
  if (panel === "source") return "Quality Issues by Source";
  if (panel === "issues") return "Quality Issues";
  return "";
}
