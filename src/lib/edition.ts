import { config } from "@/lib/config";

/** Morning edition rolls at this local hour (Europe/Rome by default). */
export const EDITION_ROLLOVER_HOUR = 6;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Shift a civil Y-M-D by delta days (calendar arithmetic, no TZ). */
export function shiftCivilDate(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/**
 * Edition date key for the morning sheet.
 * Before 06:00 local, the sheet still belongs to the previous calendar day
 * so aphorism + caches flip together at the morning rollover.
 */
export function getEditionDateKey(
  now: Date = new Date(),
  timeZone: string = config.timezone,
  rolloverHour: number = EDITION_ROLLOVER_HOUR,
): string {
  const p = zonedParts(now, timeZone);
  if (p.hour < rolloverHour) {
    const prev = shiftCivilDate(p.year, p.month, p.day, -1);
    return ymdKey(prev.year, prev.month, prev.day);
  }
  return ymdKey(p.year, p.month, p.day);
}

/** Stable day index from edition YYYY-MM-DD (for aphorism rotation). */
export function editionDayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Instant of the next 06:00 local rollover (approximate via iterative probe).
 * Good enough for timers / cache TTL.
 */
export function getNextEditionRollover(
  now: Date = new Date(),
  timeZone: string = config.timezone,
  rolloverHour: number = EDITION_ROLLOVER_HOUR,
): Date {
  const p = zonedParts(now, timeZone);
  const targetCivil =
    p.hour < rolloverHour
      ? { year: p.year, month: p.month, day: p.day }
      : shiftCivilDate(p.year, p.month, p.day, 1);

  // Binary-ish search: walk minute-by-minute near estimated UTC for that civil morning.
  // Start from "now" and advance until local Y-M-D + hour matches target at rolloverHour:00.
  let t = now.getTime();
  const max = t + 48 * 60 * 60 * 1000;
  while (t < max) {
    const z = zonedParts(new Date(t), timeZone);
    if (
      z.year === targetCivil.year &&
      z.month === targetCivil.month &&
      z.day === targetCivil.day &&
      z.hour === rolloverHour &&
      z.minute === 0
    ) {
      return new Date(t);
    }
    // Jump: if still before target day, advance by hours; else by minutes.
    if (
      z.year < targetCivil.year ||
      (z.year === targetCivil.year && z.month < targetCivil.month) ||
      (z.year === targetCivil.year &&
        z.month === targetCivil.month &&
        z.day < targetCivil.day)
    ) {
      t += 30 * 60 * 1000;
      continue;
    }
    if (z.day === targetCivil.day && z.hour < rolloverHour) {
      t += z.hour === rolloverHour - 1 ? 30 * 1000 : 5 * 60 * 1000;
      continue;
    }
    t += 30 * 1000;
  }
  // Fallback: +24h
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export function secondsUntilNextEdition(
  now: Date = new Date(),
  timeZone: string = config.timezone,
): number {
  const next = getNextEditionRollover(now, timeZone);
  return Math.max(60, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

export function editionCacheTag(dateKey: string = getEditionDateKey()): string {
  return `edition-${dateKey}`;
}

export const DAILY_TAILOR_CACHE_TAG = "daily-tailor";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(dateKey: string): boolean {
  return DATE_KEY_RE.test(dateKey);
}

/** Shared Next.js fetch cache options for morning-sheet remote data. */
export function editionFetchCache(section: string): {
  next: { tags: string[]; revalidate: number };
} {
  const key = getEditionDateKey();
  return {
    next: {
      tags: [DAILY_TAILOR_CACHE_TAG, editionCacheTag(key), `section-${section}`],
      revalidate: secondsUntilNextEdition(),
    },
  };
}
