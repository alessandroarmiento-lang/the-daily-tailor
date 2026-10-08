import type { ReminderItem } from "./types";

/**
 * Civil YYYY-MM-DD for a reminder dueAt in the edition timezone.
 * Offset-less EventKit / local strings keep their written calendar day;
 * ISO with Z/offset is projected into `timeZone`.
 */
export function reminderDueDateKey(
  dueAt: string,
  timeZone: string,
): string | null {
  const trimmed = dueAt.trim();
  if (!trimmed) return null;

  const hasOffset =
    /[zZ]\s*$/.test(trimmed) || /[+-]\d{2}:?\d{2}\s*$/.test(trimmed);

  if (!hasOffset) {
    const leading = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
    if (leading) return leading[1];
  }

  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) return null;

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/**
 * Reminders scheduled for the newspaper day only (due that civil day).
 * Overdue, undated and future items are excluded.
 */
export function isReminderForEditionDay(
  item: ReminderItem,
  dateKey: string,
  timeZone: string,
): boolean {
  if (item.isCompleted) return false;
  if (!item.dueAt) return false;
  const dueKey = reminderDueDateKey(item.dueAt, timeZone);
  if (!dueKey) return false;
  return dueKey === dateKey;
}

export function filterRemindersForEditionDay(
  items: ReminderItem[],
  dateKey: string,
  timeZone: string,
): ReminderItem[] {
  return items.filter((item) =>
    isReminderForEditionDay(item, dateKey, timeZone),
  );
}

/** Sort bucket after edition-day filter: due that day first, then leftovers. */
export function editionDayBucket(
  item: ReminderItem,
  dateKey: string,
  timeZone: string,
): number {
  if (!item.dueAt) return 2;
  const dueKey = reminderDueDateKey(item.dueAt, timeZone);
  if (!dueKey) return 2;
  if (dueKey === dateKey) return 0;
  if (dueKey < dateKey) return 1;
  return 3;
}
