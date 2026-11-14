import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import os from "node:os";
import type { HealthBriefing, HealthLine } from "./types";

type Sample = {
  startKey: string;
  startMin: number;
  endKey: string;
  endMin: number;
  source: string;
  value: string;
};

const ASLEEP = /SleepAnalysisAsleep|Asleep/i;

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12));
  return utc.toISOString().slice(0, 10);
}

function dayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Wall-clock fields as written (Apple export, no zone). */
function clock(raw: string): { key: string; min: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  return { key: m[1]!, min: Number(m[2]) * 60 + Number(m[3]) };
}

function absMin(key: string, min: number): number {
  return dayIndex(key) * 1440 + min;
}

function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h} h ${String(rem).padStart(2, "0")}`;
}

function formatHm(min: number): string {
  const h = Math.floor((((min % 1440) + 1440) % 1440) / 60);
  const m = ((min % 1440) + 1440) % 1440 - h * 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function sourceKind(source: string): "withings" | "ring" | "watch" | "iphone" | "other" {
  const s = source.toLowerCase();
  if (s.includes("withings")) return "withings";
  if (s.includes("ringconn") || s.includes("ring conn")) return "ring";
  if (s.includes("watch")) return "watch";
  if (s.includes("iphone") || s.includes("ipad")) return "iphone";
  return "other";
}

function sourceLabel(kind: ReturnType<typeof sourceKind>, raw: string): string {
  if (kind === "withings") return "Withings";
  if (kind === "ring") return "RingConn";
  if (kind === "watch") return "Watch";
  if (kind === "iphone") return "iPhone";
  return raw.split(" ").slice(0, 2).join(" ") || raw;
}

type Interval = { start: number; end: number };

function mergeMinutes(parts: Interval[]): number {
  const sorted = [...parts].filter((p) => p.end > p.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let cur: Interval | null = null;
  for (const next of sorted) {
    if (!cur || next.start > cur.end) {
      if (cur) total += cur.end - cur.start;
      cur = { ...next };
    } else {
      cur.end = Math.max(cur.end, next.end);
    }
  }
  if (cur) total += cur.end - cur.start;
  return total;
}

async function readCsv(file: string): Promise<string[][]> {
  try {
    await access(file);
  } catch {
    return [];
  }
  const rows: string[][] = [];
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) {
      header = false;
      continue;
    }
    if (!line.trim()) continue;
    rows.push(line.split(","));
  }
  return rows;
}

function toSample(row: string[]): Sample | null {
  if (row.length < 5) return null;
  const start = clock(row[0] ?? "");
  const end = clock(row[1] ?? "");
  if (!start || !end) return null;
  return {
    startKey: start.key,
    startMin: start.min,
    endKey: end.key,
    endMin: end.min,
    source: row[2] ?? "",
    value: row[4] ?? "",
  };
}

/**
 * Previous civil day + the night that ends on the edition morning.
 * Sources stay separate (pad and ring are not averaged).
 */
export async function summarizeHealthDir(
  appleDir: string,
  dateKey: string,
): Promise<HealthBriefing | null> {
  const prev = addDays(dateKey, -1);
  const nightStart = absMin(prev, 18 * 60);
  const nightEnd = absMin(dateKey, 14 * 60);

  const sleepRows = await readCsv(path.join(appleDir, "sleep.csv"));
  const stepRows = await readCsv(path.join(appleDir, "steps.csv"));
  const rhrRows = await readCsv(path.join(appleDir, "resting_hr.csv"));
  const hrvRows = await readCsv(path.join(appleDir, "hrv_sdnn.csv"));

  if (
    sleepRows.length === 0 &&
    stepRows.length === 0 &&
    rhrRows.length === 0 &&
    hrvRows.length === 0
  ) {
    return null;
  }

  const lines: HealthLine[] = [];

  const bySource = new Map<string, { label: string; parts: Interval[]; wake: number }>();
  for (const row of sleepRows) {
    const sample = toSample(row);
    if (!sample || !ASLEEP.test(sample.value) || /InBed|Awake/i.test(sample.value)) {
      continue;
    }
    const start = absMin(sample.startKey, sample.startMin);
    const end = absMin(sample.endKey, sample.endMin);
    const clipStart = Math.max(start, nightStart);
    const clipEnd = Math.min(end, nightEnd);
    if (clipEnd <= clipStart) continue;
    const kind = sourceKind(sample.source);
    if (kind !== "withings" && kind !== "ring") continue;
    const key = kind;
    const bucket = bySource.get(key) ?? {
      label: sourceLabel(kind, sample.source),
      parts: [],
      wake: clipEnd,
    };
    bucket.parts.push({ start: clipStart, end: clipEnd });
    bucket.wake = Math.max(bucket.wake, end <= nightEnd ? end : clipEnd);
    bySource.set(key, bucket);
  }

  const nightBits: string[] = [];
  for (const key of ["withings", "ring"] as const) {
    const bucket = bySource.get(key);
    if (!bucket || bucket.parts.length === 0) continue;
    const minutes = mergeMinutes(bucket.parts);
    if (minutes < 30) continue;
    nightBits.push(
      `${bucket.label} ${formatDuration(minutes)}, sveglia ${formatHm(bucket.wake)}`,
    );
  }
  if (nightBits.length > 0) {
    lines.push({ label: "Notte", text: nightBits.join(" · ") });
  }

  const stepsByKind = new Map<string, number>();
  for (const row of stepRows) {
    const sample = toSample(row);
    if (!sample || sample.startKey !== prev) continue;
    const kind = sourceKind(sample.source);
    if (kind !== "watch" && kind !== "iphone") continue;
    const n = Number(sample.value);
    if (!Number.isFinite(n) || n <= 0) continue;
    stepsByKind.set(kind, (stepsByKind.get(kind) ?? 0) + n);
  }
  const steps = stepsByKind.get("watch") ?? stepsByKind.get("iphone");
  const stepsKind = stepsByKind.has("watch") ? "Watch" : "iPhone";
  if (steps && steps >= 1) {
    lines.push({
      label: "Ieri",
      text: `${Math.round(steps).toLocaleString("it-IT")} passi (${stepsKind})`,
    });
  }

  let resting: { value: number; label: string } | null = null;
  for (const row of rhrRows) {
    const sample = toSample(row);
    if (!sample || (sample.startKey !== prev && sample.startKey !== dateKey)) continue;
    const kind = sourceKind(sample.source);
    if (kind !== "watch") continue;
    const n = Number(sample.value);
    if (!Number.isFinite(n) || n <= 0) continue;
    resting = { value: Math.round(n), label: "Watch" };
  }
  if (resting) {
    const day = lines.find((l) => l.label === "Ieri");
    const bit = `FC a riposo ${resting.value} (${resting.label})`;
    if (day) day.text = `${day.text} · ${bit}`;
    else lines.push({ label: "Ieri", text: bit });
  }

  const hrv: number[] = [];
  for (const row of hrvRows) {
    const sample = toSample(row);
    if (!sample) continue;
    const kind = sourceKind(sample.source);
    if (kind !== "watch") continue;
    const start = absMin(sample.startKey, sample.startMin);
    if (start < nightStart || start > nightEnd) continue;
    const n = Number(sample.value);
    if (!Number.isFinite(n) || n <= 0) continue;
    hrv.push(n);
  }
  if (hrv.length > 0) {
    const mean = hrv.reduce((a, b) => a + b, 0) / hrv.length;
    lines.push({
      label: "HRV",
      text: `${Math.round(mean)} ms (Watch, SDNN)`,
    });
  }

  if (lines.length === 0) return null;

  return {
    lines: lines.slice(0, 4),
    fetchedAt: new Date().toISOString(),
    sourceLabel: "Second brain",
  };
}

export function defaultAppleHealthDir(): string {
  const override = process.env.HEALTH_APPLE_DIR?.trim();
  if (override) return override;
  return path.join(os.homedir(), "Brain", "index", "health", "apple");
}
