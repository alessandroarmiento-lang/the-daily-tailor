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

const MONTHS_IT = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];

function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${day} ${MONTHS_IT[(month ?? 1) - 1]}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

function morningOf(endKey: string, endMin: number): string | null {
  if (endMin <= 14 * 60) return endKey;
  if (endMin >= 18 * 60) return addDays(endKey, 1);
  return null;
}

type NightPart = { label: string; parts: Interval[]; wake: number };

/**
 * Two-week picture plus one practical step.
 * Pad and ring stay separate. Not a diagnosis, and no medication advice.
 */
function buildHealthLines(input: {
  dateKey: string;
  prev: string;
  sleepRows: string[][];
  stepRows: string[][];
  rhrRows: string[][];
  hrvRows: string[][];
}): HealthLine[] {
  const { dateKey, prev, sleepRows, stepRows, rhrRows, hrvRows } = input;
  const firstMorning = addDays(dateKey, -13);
  const nights = new Map<string, Map<string, NightPart>>();

  for (const row of sleepRows) {
    const sample = toSample(row);
    if (!sample || !ASLEEP.test(sample.value) || /InBed|Awake/i.test(sample.value)) {
      continue;
    }
    const kind = sourceKind(sample.source);
    if (kind !== "withings" && kind !== "ring") continue;
    const morning = morningOf(sample.endKey, sample.endMin);
    if (!morning || morning < firstMorning || morning > dateKey) continue;
    const windowStart = absMin(addDays(morning, -1), 18 * 60);
    const windowEnd = absMin(morning, 14 * 60);
    const start = absMin(sample.startKey, sample.startMin);
    const end = absMin(sample.endKey, sample.endMin);
    const clipStart = Math.max(start, windowStart);
    const clipEnd = Math.min(end, windowEnd);
    if (clipEnd <= clipStart) continue;
    const bySource = nights.get(morning) ?? new Map<string, NightPart>();
    const bucket = bySource.get(kind) ?? {
      label: sourceLabel(kind, sample.source),
      parts: [],
      wake: clipEnd,
    };
    bucket.parts.push({ start: clipStart, end: clipEnd });
    bucket.wake = Math.max(bucket.wake, end <= windowEnd ? end : clipEnd);
    bySource.set(kind, bucket);
    nights.set(morning, bySource);
  }

  const nightMinutes = (morning: string, kind: string): number => {
    const bucket = nights.get(morning)?.get(kind);
    if (!bucket) return 0;
    return mergeMinutes(bucket.parts);
  };

  const mornings = [...nights.keys()].filter((key) => {
    return nightMinutes(key, "withings") >= 30 || nightMinutes(key, "ring") >= 30;
  }).sort();
  const latest = mornings[mornings.length - 1];

  const lines: HealthLine[] = [];
  if (latest) {
    const bits: string[] = [];
    for (const kind of ["withings", "ring"] as const) {
      const minutes = nightMinutes(latest, kind);
      const bucket = nights.get(latest)?.get(kind);
      if (!bucket || minutes < 30) continue;
      bits.push(
        `${bucket.label} ${formatDuration(minutes)}, sveglia ${formatHm(bucket.wake)}`,
      );
    }
    const when = latest === dateKey ? "Stanotte" : `Ultima notte completa (${shortDate(addDays(latest, -1))})`;
    if (bits.length > 0) lines.push({ label: "Notte", text: `${when}: ${bits.join(" · ")}` });
  } else {
    lines.push({
      label: "Notte",
      text: "Nessuna notte completa da Withings o RingConn nelle ultime due settimane.",
    });
  }

  const stepsByDay = new Map<string, { watch: number; iphone: number }>();
  for (const row of stepRows) {
    const sample = toSample(row);
    if (!sample || sample.startKey < addDays(dateKey, -14) || sample.startKey > prev) continue;
    const kind = sourceKind(sample.source);
    if (kind !== "watch" && kind !== "iphone") continue;
    const n = Number(sample.value);
    if (!Number.isFinite(n) || n <= 0) continue;
    const day = stepsByDay.get(sample.startKey) ?? { watch: 0, iphone: 0 };
    day[kind] += n;
    stepsByDay.set(sample.startKey, day);
  }
  const dailySteps = [...stepsByDay.values()].map((day) => day.watch || day.iphone).filter((n) => n >= 1);
  const stepsMedian = median(dailySteps);
  const yesterdaySteps = stepsByDay.get(prev);
  const steps = yesterdaySteps ? yesterdaySteps.watch || yesterdaySteps.iphone : 0;
  const stepsKind = yesterdaySteps?.watch ? "Watch" : "iPhone";

  const restingByDay = new Map<string, number>();
  for (const row of rhrRows) {
    const sample = toSample(row);
    if (!sample || sample.startKey < addDays(dateKey, -14) || sample.startKey > dateKey) continue;
    if (sourceKind(sample.source) !== "watch") continue;
    const n = Number(sample.value);
    if (!Number.isFinite(n) || n <= 0) continue;
    restingByDay.set(sample.startKey, Math.round(n));
  }
  const restingMedian = median([...restingByDay.values()]);
  const resting = restingByDay.get(prev) ?? restingByDay.get(dateKey) ?? null;

  const hrvValues: number[] = [];
  const hrvStart = absMin(prev, 18 * 60);
  const hrvEnd = absMin(dateKey, 14 * 60);
  for (const row of hrvRows) {
    const sample = toSample(row);
    if (!sample || sourceKind(sample.source) !== "watch") continue;
    const start = absMin(sample.startKey, sample.startMin);
    if (start < hrvStart || start > hrvEnd) continue;
    const n = Number(sample.value);
    if (!Number.isFinite(n) || n <= 0) continue;
    hrvValues.push(n);
  }
  const hrvMean = hrvValues.length
    ? hrvValues.reduce((sum, n) => sum + n, 0) / hrvValues.length
    : null;

  const sleepMedians: string[] = [];
  for (const kind of ["withings", "ring"] as const) {
    const values = mornings
      .map((morning) => nightMinutes(morning, kind))
      .filter((minutes) => minutes >= 30);
    const mid = median(values);
    if (mid == null) continue;
    const label = nights.get(latest ?? "")?.get(kind)?.label ?? (kind === "withings" ? "Withings" : "RingConn");
    sleepMedians.push(`${label} ${formatDuration(mid)}`);
  }

  const quadro: string[] = [];
  if (stepsMedian != null) {
    quadro.push(`passi mediani ${Math.round(stepsMedian).toLocaleString("it-IT")} (${steps && yesterdaySteps?.watch ? "Watch" : stepsKind})`);
  }
  if (restingMedian != null) {
    quadro.push(`FC a riposo intorno a ${Math.round(restingMedian)}`);
  }
  if (sleepMedians.length > 0) {
    quadro.push(`sonno mediano ${sleepMedians.join(", ")}`);
  }
  if (quadro.length > 0) {
    lines.push({ label: "Quadro", text: `Ultime due settimane: ${quadro.join(". ")}.` });
  }

  const lastSleep = latest
    ? Math.max(nightMinutes(latest, "withings"), nightMinutes(latest, "ring"))
    : 0;
  let advice: string;
  if (lastSleep > 0 && lastSleep < 6 * 60) {
    advice = "Notte corta rispetto a un sonno intero: stasera spegni uno schermo prima e tieni lo stesso orario.";
  } else if (steps > 0 && (steps < 5000 || (stepsMedian != null && steps < stepsMedian * 0.6))) {
    advice = "Ieri sei stato sotto il tuo ritmo di passi: una camminata di mezz'ora, senza spingere sull'intensità.";
  } else if (resting != null && restingMedian != null && resting >= restingMedian + 6) {
    advice = "La FC a riposo è più alta del tuo solito: giornata più leggera, niente sforzo intenso.";
  } else if (hrvMean != null && hrvMean < 30) {
    advice = "L'HRV di stanotte è basso per il tuo orologio: recupera, cammina, non aggiungere un allenamento.";
  } else {
    advice = "Niente da spostare: tieni l'orario di sonno e una camminata se il pomeriggio resta fermo.";
  }
  lines.push({ label: "Consiglio", text: advice });

  return lines.filter((line) => line.text.trim());
}

/**
 * Previous civil day + the night that ends on the edition morning,
 * set against the last two weeks.
 * Sources stay separate (pad and ring are not averaged).
 */
export async function summarizeHealthDir(
  appleDir: string,
  dateKey: string,
): Promise<HealthBriefing | null> {
  const prev = addDays(dateKey, -1);

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

  const lines = buildHealthLines({
    dateKey,
    prev,
    sleepRows,
    stepRows,
    rhrRows,
    hrvRows,
  });
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
