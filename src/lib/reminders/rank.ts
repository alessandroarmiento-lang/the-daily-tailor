import type { ReminderItem } from "./types";
import { capRanked } from "@/lib/section-overflow";
import {
  editionDayBucket,
  filterRemindersForEditionDay,
  reminderDueDateKey,
} from "./for-edition-day";

export type RankRemindersOptions = {
  /** Newspaper edition day (YYYY-MM-DD). */
  dateKey?: string;
  timeZone?: string;
};

/**
 * Fill up to six slots: edition day, then upcoming (chrono), then overdue
 * (most recent first), then undated.
 */
export function rankReminders(
  items: ReminderItem[],
  options?: RankRemindersOptions,
): ReminderItem[] {
  const scoped =
    options?.dateKey && options.timeZone
      ? filterRemindersForEditionDay(
          items,
          options.dateKey,
          options.timeZone,
        )
      : items.filter((r) => !r.isCompleted);

  const tz = options?.timeZone ?? "UTC";
  const day = options?.dateKey;

  return [...scoped].sort((a, b) => {
    if (day) {
      const ba = editionDayBucket(a, day, tz);
      const bb = editionDayBucket(b, day, tz);
      if (ba !== bb) return ba - bb;
      // Overdue: most recently overdue first.
      if (ba === 2) {
        return (b.dueAt ?? "").localeCompare(a.dueAt ?? "");
      }
    }
    const aKey = a.dueAt ? reminderDueDateKey(a.dueAt, tz) ?? "9999-99-99" : "9999-99-99";
    const bKey = b.dueAt ? reminderDueDateKey(b.dueAt, tz) ?? "9999-99-99" : "9999-99-99";
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
  });
}

export function rankAndCapReminders(
  items: ReminderItem[],
  maxVisible: number,
  options?: RankRemindersOptions,
): { items: ReminderItem[]; hiddenCount: number } {
  return capRanked(rankReminders(items, options), maxVisible);
}

/** Pool size to fetch so hiddenCount can be meaningful. */
export function remindersFetchPool(maxVisible: number): number {
  return Math.max(20, maxVisible * 5);
}
