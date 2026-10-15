import { useEffect, useState } from "react";

const normalizeChartColor = (value: string, fallback: string) => {
  const v = value.trim();
  if (!v) return fallback;

  if (
    v.startsWith("#") ||
    v.startsWith("rgb") ||
    v.startsWith("hsl") ||
    v.startsWith("oklch") ||
    v.startsWith("oklab") ||
    v.startsWith("color(")
  ) {
    return v;
  }

  if (v.includes("%") && !v.includes("(")) return `hsl(${v})`;

  return v;
};

export const useChartTheme = () => {
  const read = () => {
    const s = getComputedStyle(document.documentElement);
    const get = (key: string, fallback: string) => normalizeChartColor(s.getPropertyValue(key), fallback);

    return {
      background: get("--background", "#ffffff"),
      card: get("--card", "#ffffff"),
      foreground: get("--foreground", "#171717"),
      muted: get("--muted", "#f5f5f5"),
      mutedForeground: get("--muted-foreground", "#737373"),
      border: get("--border", "#e5e5e5"),
      primary: get("--primary", "#5b8bff"),
      primaryForeground: get("--primary-foreground", "#ffffff"),
      success: get("--success", "#22c55e"),
      warning: get("--warning", "#f59e0b"),
      destructive: get("--destructive", "#ef4444"),
      info: get("--info", "#3b82f6"),
      purple: get("--purple", "#8b5cf6"),
      teal: get("--teal", "#14b8a6"),
      indigo: get("--indigo", "#6366f1"),
      pink: get("--pink", "#ec4899"),
      amber: get("--amber", "#f97316"),
    };
  };

  const [theme, setTheme] = useState(read);

  useEffect(() => {
    const update = () => setTheme(read());
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
};
