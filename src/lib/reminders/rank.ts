import type { ReminderItem } from "./types";
import { capRanked } from "@/lib/section-overflow";
import {
  filterRemindersForEditionDay,
  reminderDueDateKey,
} from "./for-edition-day";

export type RankRemindersOptions = {
  /** Newspaper edition day (YYYY-MM-DD). When set, keep that day + upcoming. */
  dateKey?: string;
  timeZone?: string;
};

/**
 * Chronological order for the A4 slot: edition day first, then future dates,
 * earliest dueAt within each day. Always capped to maxVisible (six).
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
      : items.filter((r) => !r.isCompleted && !!r.dueAt);

  const tz = options?.timeZone ?? "UTC";

  return [...scoped]
    .filter((r) => !r.isCompleted)
    .sort((a, b) => {
      const aKey = a.dueAt ? reminderDueDateKey(a.dueAt, tz) ?? "" : "";
      const bKey = b.dueAt ? reminderDueDateKey(b.dueAt, tz) ?? "" : "";
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
