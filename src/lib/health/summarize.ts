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

type Kind = "withings" | "ring" | "watch" | "iphone" | "other";

type Interval = { start: number; end: number };

const ASLEEP = /SleepAnalysisAsleep|Asleep/i;
const AWAKE = /SleepAnalysisAwake|Awake/i;
const DEEP = /AsleepDeep/i;

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

function sourceKind(source: string): Kind | "skip" {
  const s = source.toLowerCase();
  if (s.includes("shortcut") || s.includes("unattributed")) return "skip";
  if (s.includes("ultrahuman") || s.includes("zepp")) return "skip";
  if (s.includes("withings")) return "withings";
  if (s.includes("ringconn") || s.includes("ring conn")) return "ring";
  if (s.includes("watch")) return "watch";
  if (s.includes("iphone") || s.includes("ipad")) return "iphone";
  if (s.includes("salute")) return "other";
  return "other";
}

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

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index] ?? null;
}

/**
 * Modified z-score against a personal baseline.
 * Null when there are fewer than five comparison points.
 */
function zScore(value: number, baseline: number[]): number | null {
  if (baseline.length < 5) return null;
  const mid = median(baseline);
  if (mid == null) return null;
  const mad = median(baseline.map((n) => Math.abs(n - mid)));
  if (mad == null) return null;
  if (mad === 0) {
    const span = Math.max(Math.abs(mid) * 0.05, 1e-6);
    const gap = (value - mid) / span;
    if (Math.abs(gap) < 1) return 0;
    return Math.sign(gap) * 2;
  }
  return (0.6745 * (value - mid)) / mad;
}

function morningOf(endKey: string, endMin: number): string | null {
  if (endMin <= 14 * 60) return endKey;
  if (endMin >= 18 * 60) return addDays(endKey, 1);
  return null;
}

type Reading = { kind: string; value: number };

/**
 * Average when the readings agree. Otherwise keep the preferred source.
 * The choice stays inside the number; the sentence never names a device.
 */
function mergeReadings(
  readings: Reading[],
  close: (value: number, mid: number) => boolean,
  prefer: string[],
): number | null {
  const usable = readings.filter((r) => Number.isFinite(r.value));
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0]!.value;
  const mid = median(usable.map((r) => r.value));
  if (mid != null && usable.every((r) => close(r.value, mid))) {
    return mean(usable.map((r) => r.value));
  }
  const rank = new Map(prefer.map((kind, index) => [kind, index]));
  usable.sort((a, b) => (rank.get(a.kind) ?? 9) - (rank.get(b.kind) ?? 9));
  return usable[0]!.value;
}

function numberOrNull(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function spo2Fraction(raw: string): number | null {
  const n = numberOrNull(raw);
  if (n == null || n <= 0) return null;
  return n > 1.5 ? n / 100 : n;
}

type KindNight = {
  asleep: Interval[];
  deep: Interval[];
  awake: Interval[];
};

function windowFor(morning: string): { start: number; end: number } {
  return {
    start: absMin(addDays(morning, -1), 18 * 60),
    end: absMin(morning, 14 * 60),
  };
}

function clipInterval(start: number, end: number, from: number, to: number): Interval | null {
  const clipStart = Math.max(start, from);
  const clipEnd = Math.min(end, to);
  if (clipEnd <= clipStart) return null;
  return { start: clipStart, end: clipEnd };
}

function inWindow(sample: Sample, from: number, to: number): boolean {
  const start = absMin(sample.startKey, sample.startMin);
  return start >= from && start <= to;
}

/**
 * Descriptive night and vitals. No counts, no device names, no diagnosis.
 * Similar readings are averaged; when they disagree, the more relevant source is kept.
 */
function buildHealthLines(input: {
  dateKey: string;
  prev: string;
  sleepRows: string[][];
  breathingRows: string[][];
  spo2Rows: string[][];
  restingRows: string[][];
  hrvRows: string[][];
  respiratoryRows: string[][];
  bpSysRows: string[][];
  bpDiaRows: string[][];
}): HealthLine[] {
  const {
    dateKey,
    prev,
    sleepRows,
    breathingRows,
    spo2Rows,
    restingRows,
    hrvRows,
    respiratoryRows,
    bpSysRows,
    bpDiaRows,
  } = input;
  const firstMorning = addDays(dateKey, -13);
  const nights = new Map<string, Map<Kind, KindNight>>();

  const bucketFor = (morning: string, kind: Kind): KindNight => {
    const byKind = nights.get(morning) ?? new Map<Kind, KindNight>();
    const bucket = byKind.get(kind) ?? { asleep: [], deep: [], awake: [] };
    byKind.set(kind, bucket);
    nights.set(morning, byKind);
    return bucket;
  };

  for (const row of sleepRows) {
    const sample = toSample(row);
    if (!sample) continue;
    const kind = sourceKind(sample.source);
    if (kind !== "withings" && kind !== "ring") continue;
    const morning = morningOf(sample.endKey, sample.endMin);
    if (!morning || morning < firstMorning || morning > dateKey) continue;
    const span = windowFor(morning);
    const start = absMin(sample.startKey, sample.startMin);
    const end = absMin(sample.endKey, sample.endMin);
    const clip = clipInterval(start, end, span.start, span.end);
    if (!clip) continue;
    const bucket = bucketFor(morning, kind);
    if (AWAKE.test(sample.value) && !ASLEEP.test(sample.value)) {
      bucket.awake.push(clip);
    } else if (ASLEEP.test(sample.value) && !/InBed/i.test(sample.value)) {
      bucket.asleep.push(clip);
      if (DEEP.test(sample.value)) bucket.deep.push(clip);
    }
  }

  const minutesOf = (morning: string, kind: Kind, field: "asleep" | "deep" | "awake"): number => {
    const bucket = nights.get(morning)?.get(kind);
    if (!bucket) return 0;
    return mergeMinutes(bucket[field]);
  };

  const sleepMinutes = (morning: string): number | null => {
    const readings: Reading[] = [];
    for (const kind of ["withings", "ring"] as const) {
      const minutes = minutesOf(morning, kind, "asleep");
      if (minutes >= 30) readings.push({ kind, value: minutes });
    }
    return mergeReadings(readings, (value, mid) => Math.abs(value - mid) <= 45, [
      "withings",
      "ring",
    ]);
  };

  const deepShare = (morning: string): number | null => {
    const readings: Reading[] = [];
    for (const kind of ["withings", "ring"] as const) {
      const asleep = minutesOf(morning, kind, "asleep");
      const deep = minutesOf(morning, kind, "deep");
      if (asleep >= 30 && deep >= 0) readings.push({ kind, value: deep / asleep });
    }
    return mergeReadings(readings, (value, mid) => Math.abs(value - mid) <= 0.08, [
      "withings",
      "ring",
    ]);
  };

  const awakeMinutes = (morning: string): number => {
    const parts: Interval[] = [];
    for (const kind of ["withings", "ring"] as const) {
      const bucket = nights.get(morning)?.get(kind);
      if (bucket) parts.push(...bucket.awake);
    }
    return mergeMinutes(parts);
  };

  const mornings = [...nights.keys()].filter((key) => (sleepMinutes(key) ?? 0) >= 30).sort();
  const latest = mornings[mornings.length - 1];

  const lines: HealthLine[] = [];
  if (!latest) {
    lines.push({
      label: "Sonno",
      text: "Non c'è un sonno da leggere per le ultime due settimane.",
    });
  } else {
    const duration = sleepMinutes(latest)!;
    const others = mornings.filter((key) => key !== latest);
    const durationZ = zScore(
      duration,
      others.map((key) => sleepMinutes(key)!),
    );
    const awake = awakeMinutes(latest);
    const awakeBase = others.map(awakeMinutes).filter((n) => n >= 0);
    const awakeZ = zScore(awake, awakeBase);
    const broken =
      awake >= 45 && (awakeZ == null ? awake >= 70 : awakeZ >= 1.5);
    const short = durationZ == null ? duration < 6 * 60 : durationZ <= -1.5;
    const long = durationZ != null && durationZ >= 1.5;
    const deep = deepShare(latest);
    const deepZ =
      deep == null
        ? null
        : zScore(
            deep,
            others
              .map(deepShare)
              .filter((n): n is number => n != null),
          );
    const lightDeep = deepZ != null && deepZ <= -1.5;

    let sleepText: string;
    if (durationZ == null && !broken) {
      sleepText = short
        ? "Il sonno letto è corto. Non ci sono abbastanza notti per confrontarlo col tuo solito."
        : "C'è un sonno letto, continuo. Non ci sono abbastanza notti per dire se è fuori dal tuo solito.";
    } else if (short && broken) {
      sleepText = "Il sonno è stato corto e spezzato rispetto al tuo solito.";
    } else if (short) {
      sleepText = "Il sonno è stato corto rispetto al tuo solito.";
    } else if (broken) {
      sleepText = "Il sonno è stato spezzato, con più risvegli del tuo solito.";
    } else if (long) {
      sleepText = "Hai dormito bene: sonno più lungo del tuo solito, e continuo.";
    } else {
      sleepText = "Hai dormito bene: sonno pieno e continuo, in linea col tuo solito.";
    }
    if (lightDeep) {
      sleepText += " Il sonno profondo è stato poco rispetto al tuo solito.";
    }
    if (latest !== dateKey) {
      sleepText = `Non è la notte appena passata. ${sleepText}`;
    }
    lines.push({ label: "Sonno", text: sleepText });

    const span = windowFor(latest);
    const breathingByKind = new Map<Kind, number[]>();
    let latestBreathingMorning: string | null = null;
    for (const row of breathingRows) {
      const sample = toSample(row);
      if (!sample) continue;
      const kind = sourceKind(sample.source);
      if (kind === "skip") continue;
      const morning = morningOf(sample.endKey, sample.endMin);
      if (!morning) continue;
      if (!latestBreathingMorning || morning > latestBreathingMorning) {
        latestBreathingMorning = morning;
      }
      if (morning !== latest) continue;
      const n = numberOrNull(sample.value);
      if (n == null || n < 0) continue;
      const list = breathingByKind.get(kind) ?? [];
      list.push(n);
      breathingByKind.set(kind, list);
    }
    const breathingNow = mergeReadings(
      [...breathingByKind.entries()].map(([kind, values]) => ({
        kind,
        value: median(values) ?? Number.NaN,
      })),
      (value, mid) => Math.abs(value - mid) <= Math.max(1, Math.abs(mid) * 0.3),
      ["withings", "watch", "ring"],
    );

    const breathingBase: number[] = [];
    const breathingBuckets = new Map<string, Map<Kind, number[]>>();
    for (const row of breathingRows) {
      const sample = toSample(row);
      if (!sample) continue;
      const kind = sourceKind(sample.source);
      if (kind === "skip") continue;
      const morning = morningOf(sample.endKey, sample.endMin);
      if (!morning || morning === latest || morning < addDays(dateKey, -60) || morning > dateKey) {
        continue;
      }
      const n = numberOrNull(sample.value);
      if (n == null || n < 0) continue;
      const byKind = breathingBuckets.get(morning) ?? new Map<Kind, number[]>();
      const list = byKind.get(kind) ?? [];
      list.push(n);
      byKind.set(kind, list);
      breathingBuckets.set(morning, byKind);
    }
    for (const byKind of breathingBuckets.values()) {
      const merged = mergeReadings(
        [...byKind.entries()].map(([kind, values]) => ({
          kind,
          value: median(values) ?? Number.NaN,
        })),
        (value, mid) => Math.abs(value - mid) <= Math.max(1, Math.abs(mid) * 0.3),
        ["withings", "watch", "ring"],
      );
      if (merged != null) breathingBase.push(merged);
    }

    const spo2Values: number[] = [];
    const spo2ByMorning = new Map<string, number[]>();
    for (const row of spo2Rows) {
      const sample = toSample(row);
      if (!sample) continue;
      if (sourceKind(sample.source) === "skip") continue;
      const fraction = spo2Fraction(sample.value);
      if (fraction == null || fraction < 0.7 || fraction > 1) continue;
      const morning = morningOf(sample.startKey, sample.startMin) ?? morningOf(sample.endKey, sample.endMin);
      if (!morning || morning < firstMorning || morning > dateKey) continue;
      const spanNight = windowFor(morning);
      if (!inWindow(sample, spanNight.start, spanNight.end)) continue;
      const list = spo2ByMorning.get(morning) ?? [];
      list.push(fraction);
      spo2ByMorning.set(morning, list);
      if (morning === latest) spo2Values.push(fraction);
    }
    const spo2Median = median(spo2Values);
    const spo2Low = percentile(spo2Values, 0.1);
    const spo2Base = [...spo2ByMorning.entries()]
      .filter(([morning, values]) => morning !== latest && values.length >= 4)
      .map(([, values]) => median(values))
      .filter((n): n is number => n != null);
    const spo2Z = spo2Median == null ? null : zScore(spo2Median, spo2Base);
    const oxygenDipped =
      spo2Values.length >= 4 &&
      spo2Low != null &&
      (spo2Low < 0.9 || (spo2Z != null && spo2Z <= -1.5));

    const breathingRecent =
      latestBreathingMorning != null && latestBreathingMorning >= addDays(dateKey, -10);
    const breathingZ = breathingNow == null ? null : zScore(breathingNow, breathingBase);
    let breathText: string;
    if (breathingNow != null && breathingRecent && latestBreathingMorning === latest) {
      if (breathingZ != null && breathingZ >= 1.5) {
        breathText =
          "I disturbi del respiro sono più alti del tuo solito. Non è una diagnosi.";
      } else if (breathingZ == null) {
        breathText =
          "C'è una lettura dei disturbi del respiro, ma non abbastanza notti per confrontarla col tuo solito.";
      } else {
        breathText = "I disturbi del respiro sono nel tuo solito.";
      }
      if (oxygenDipped) {
        breathText += " L'ossigeno notturno è sceso sotto il tuo solito.";
      }
    } else if (spo2Values.length >= 4) {
      breathText = oxygenDipped
        ? "Non c'è una misura recente dei disturbi del respiro. L'ossigeno notturno è sceso sotto il tuo solito."
        : "Non c'è una misura recente dei disturbi del respiro. L'ossigeno notturno è nel tuo solito.";
    } else {
      breathText = "Non c'è una lettura del respiro per la notte disponibile.";
    }
    lines.push({ label: "Respiro", text: breathText });

    const restingToday: Reading[] = [];
    const restingByDay = new Map<string, Reading[]>();
    for (const row of restingRows) {
      const sample = toSample(row);
      if (!sample) continue;
      const kind = sourceKind(sample.source);
      if (kind !== "watch" && kind !== "ring") continue;
      const n = numberOrNull(sample.value);
      if (n == null || n < 35 || n > 130) continue;
      if (sample.startKey === prev || sample.startKey === dateKey) {
        restingToday.push({ kind, value: n });
      } else if (sample.startKey >= addDays(dateKey, -28) && sample.startKey < prev) {
        const list = restingByDay.get(sample.startKey) ?? [];
        list.push({ kind, value: n });
        restingByDay.set(sample.startKey, list);
      }
    }
    const resting = mergeReadings(
      restingToday,
      (value, mid) => Math.abs(value - mid) <= 5,
      ["watch", "ring"],
    );
    const restingBase = [...restingByDay.values()]
      .map((readings) =>
        mergeReadings(readings, (value, mid) => Math.abs(value - mid) <= 5, ["watch", "ring"]),
      )
      .filter((n): n is number => n != null);
    const restingZ = resting == null ? null : zScore(resting, restingBase);

    const hrvNow = nightMetric(
      hrvRows,
      latest,
      (n) => n > 5 && n < 250,
      (value, mid) => Math.abs(value - mid) <= Math.max(8, Math.abs(mid) * 0.2),
      ["watch", "withings", "ring"],
    );
    const hrvBase = baselineNightMetric(
      hrvRows,
      dateKey,
      latest,
      firstMorning,
      (n) => n > 5 && n < 250,
      (value, mid) => Math.abs(value - mid) <= Math.max(8, Math.abs(mid) * 0.2),
      ["watch", "withings", "ring"],
    );
    const hrvZ = hrvNow == null ? null : zScore(hrvNow, hrvBase);

    const breathRateNow = nightMetric(
      respiratoryRows,
      latest,
      (n) => n >= 8 && n <= 28,
      (value, mid) => Math.abs(value - mid) <= 2,
      ["withings", "ring", "watch"],
    );
    const breathRateBase = baselineNightMetric(
      respiratoryRows,
      dateKey,
      latest,
      firstMorning,
      (n) => n >= 8 && n <= 28,
      (value, mid) => Math.abs(value - mid) <= 2,
      ["withings", "ring", "watch"],
    );
    const breathRateZ = breathRateNow == null ? null : zScore(breathRateNow, breathRateBase);

    const bp = bloodPressure(bpSysRows, bpDiaRows, prev, dateKey);

    const notes: string[] = [];
    const names: string[] = [];
    const thin: string[] = [];
    if (resting != null) {
      names.push("la frequenza a riposo");
      if (restingZ != null && restingZ >= 1.5) notes.push("la frequenza a riposo è più alta del tuo solito");
      else if (restingZ != null && restingZ <= -1.5) notes.push("la frequenza a riposo è più bassa del tuo solito");
      else if (restingZ == null) thin.push("la frequenza a riposo");
    }
    if (hrvNow != null) {
      names.push("la variabilità cardiaca");
      if (hrvZ != null && hrvZ <= -1.5) notes.push("la variabilità cardiaca è più bassa del tuo solito");
      else if (hrvZ == null) thin.push("la variabilità cardiaca");
    }
    if (breathRateNow != null) {
      names.push("il ritmo del respiro");
      if (breathRateZ != null && breathRateZ >= 1.5) notes.push("il ritmo del respiro è più alto del tuo solito");
      else if (breathRateZ != null && breathRateZ <= -1.5) notes.push("il ritmo del respiro è più basso del tuo solito");
      else if (breathRateZ == null) thin.push("il ritmo del respiro");
    }
    if (bp) {
      names.push("la pressione");
      if (bp.high) notes.push("la pressione è più alta del tuo solito");
      else if (bp.low) notes.push("la pressione è più bassa del tuo solito");
      else if (!bp.compared) thin.push("la pressione");
    }

    let vitalText: string;
    if (names.length === 0) {
      vitalText = "Non c'è un parametro vitale da leggere per ieri o per la notte disponibile.";
    } else if (notes.length === 0 && thin.length === names.length) {
      vitalText = `${capitalize(joinClauses(thin))} ${thin.length > 1 ? "ci sono" : "c'è"}, senza abbastanza storia per un confronto.`;
    } else if (notes.length === 0) {
      vitalText = `${capitalize(joinClauses(names))} ${names.length > 1 ? "sono" : "è"} nel tuo solito.`;
    } else if (notes.length === names.length) {
      vitalText = `${capitalize(joinClauses(notes))}.`;
    } else {
      vitalText = `${capitalize(joinClauses(notes))}. Il resto letto è nel tuo solito.`;
    }
    lines.push({ label: "Parametri", text: vitalText });
  }

  return lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text.length > 0);
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function nightMetric(
  rows: string[][],
  morning: string,
  keep: (n: number) => boolean,
  close: (value: number, mid: number) => boolean,
  prefer: string[],
): number | null {
  const span = windowFor(morning);
  const byKind = new Map<string, number[]>();
  for (const row of rows) {
    const sample = toSample(row);
    if (!sample || sourceKind(sample.source) === "skip") continue;
    if (!inWindow(sample, span.start, span.end)) continue;
    const n = numberOrNull(sample.value);
    if (n == null || !keep(n)) continue;
    const kind = sourceKind(sample.source);
    if (kind === "skip") continue;
    const list = byKind.get(kind) ?? [];
    list.push(n);
    byKind.set(kind, list);
  }
  return mergeReadings(
    [...byKind.entries()].map(([kind, values]) => ({ kind, value: median(values) ?? Number.NaN })),
    close,
    prefer,
  );
}

function baselineNightMetric(
  rows: string[][],
  dateKey: string,
  latest: string,
  firstMorning: string,
  keep: (n: number) => boolean,
  close: (value: number, mid: number) => boolean,
  prefer: string[],
): number[] {
  const byMorning = new Map<string, Map<string, number[]>>();
  for (const row of rows) {
    const sample = toSample(row);
    if (!sample || sourceKind(sample.source) === "skip") continue;
    const morning =
      morningOf(sample.startKey, sample.startMin) ?? morningOf(sample.endKey, sample.endMin);
    if (!morning || morning === latest || morning < firstMorning || morning > dateKey) continue;
    const span = windowFor(morning);
    if (!inWindow(sample, span.start, span.end)) continue;
    const n = numberOrNull(sample.value);
    if (n == null || !keep(n)) continue;
    const kind = sourceKind(sample.source);
    if (kind === "skip") continue;
    const byKind = byMorning.get(morning) ?? new Map<string, number[]>();
    const list = byKind.get(kind) ?? [];
    list.push(n);
    byKind.set(kind, list);
    byMorning.set(morning, byKind);
  }
  const out: number[] = [];
  for (const byKind of byMorning.values()) {
    const merged = mergeReadings(
      [...byKind.entries()].map(([kind, values]) => ({
        kind,
        value: median(values) ?? Number.NaN,
      })),
      close,
      prefer,
    );
    if (merged != null) out.push(merged);
  }
  return out;
}

function bloodPressure(
  systolicRows: string[][],
  diastolicRows: string[][],
  prev: string,
  dateKey: string,
): { high: boolean; low: boolean; compared: boolean } | null {
  const read = (rows: string[][], day: string): number | null => {
    const values: number[] = [];
    for (const row of rows) {
      const sample = toSample(row);
      if (!sample || sample.startKey !== day) continue;
      if (sourceKind(sample.source) === "skip") continue;
      const n = numberOrNull(sample.value);
      if (n == null || n < 40 || n > 250) continue;
      values.push(n);
    }
    return median(values);
  };
  const history = (rows: string[][]): number[] => {
    const byDay = new Map<string, number[]>();
    for (const row of rows) {
      const sample = toSample(row);
      if (!sample || sample.startKey >= prev || sample.startKey < addDays(dateKey, -28)) continue;
      if (sourceKind(sample.source) === "skip") continue;
      const n = numberOrNull(sample.value);
      if (n == null || n < 40 || n > 250) continue;
      const list = byDay.get(sample.startKey) ?? [];
      list.push(n);
      byDay.set(sample.startKey, list);
    }
    return [...byDay.values()]
      .map((values) => median(values))
      .filter((n): n is number => n != null);
  };
  const sys = read(systolicRows, prev);
  const dia = read(diastolicRows, prev);
  if (sys == null && dia == null) return null;
  const sysZ = sys == null ? null : zScore(sys, history(systolicRows));
  const diaZ = dia == null ? null : zScore(dia, history(diastolicRows));
  const compared = sysZ != null || diaZ != null;
  const high = (sysZ != null && sysZ >= 1.5) || (diaZ != null && diaZ >= 1.5);
  const low = !high && ((sysZ != null && sysZ <= -1.5) || (diaZ != null && diaZ <= -1.5));
  return { high, low, compared };
}

/**
 * Previous civil day and the latest trusted night.
 * Wording stays descriptive: no figures and no device names.
 */
export async function summarizeHealthDir(
  appleDir: string,
  dateKey: string,
): Promise<HealthBriefing | null> {
  const prev = addDays(dateKey, -1);
  const [sleepRows, breathingRows, spo2Rows, restingRows, hrvRows, respiratoryRows, bpSysRows, bpDiaRows] =
    await Promise.all([
      readCsv(path.join(appleDir, "sleep.csv")),
      readCsv(path.join(appleDir, "breathing_disturbances.csv")),
      readCsv(path.join(appleDir, "spo2.csv")),
      readCsv(path.join(appleDir, "resting_hr.csv")),
      readCsv(path.join(appleDir, "hrv_sdnn.csv")),
      readCsv(path.join(appleDir, "respiratory_rate.csv")),
      readCsv(path.join(appleDir, "bp_systolic.csv")),
      readCsv(path.join(appleDir, "bp_diastolic.csv")),
    ]);

  if (
    sleepRows.length === 0 &&
    breathingRows.length === 0 &&
    spo2Rows.length === 0 &&
    restingRows.length === 0
  ) {
    return null;
  }

  const lines = buildHealthLines({
    dateKey,
    prev,
    sleepRows,
    breathingRows,
    spo2Rows,
    restingRows,
    hrvRows,
    respiratoryRows,
    bpSysRows,
    bpDiaRows,
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
