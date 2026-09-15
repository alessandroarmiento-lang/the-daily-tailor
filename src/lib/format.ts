import { newspaperConfig } from "@/lib/config";

const dateFormatter = new Intl.DateTimeFormat(newspaperConfig.locale, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: newspaperConfig.timezone,
});

const timeFormatter = new Intl.DateTimeFormat(newspaperConfig.locale, {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: newspaperConfig.timezone,
});

export function formatEditionDate(date = new Date()): string {
  const raw = dateFormatter.format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatClock(date = new Date()): string {
  return timeFormatter.format(date);
}

export function formatSourceLabel(source: "live" | "mock"): string {
  return source === "live" ? "live" : "esempio";
}
