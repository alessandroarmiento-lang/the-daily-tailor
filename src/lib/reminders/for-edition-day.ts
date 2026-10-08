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
 * Open reminders eligible for the six-slot Promemoria band.
 * Ranking (not this filter) decides today → upcoming → overdue → undated.
 */
export function isReminderForEditionDay(
  item: ReminderItem,
  _dateKey: string,
  _timeZone: string,
): boolean {
  return !item.isCompleted;
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

/**
 * Sort bucket for the A4 slot:
 * 0 edition day → 1 upcoming → 2 overdue → 3 undated.
 */
export function editionDayBucket(
  item: ReminderItem,
  dateKey: string,
  timeZone: string,
): number {
  if (!item.dueAt) return 3;
  const dueKey = reminderDueDateKey(item.dueAt, timeZone);
  if (!dueKey) return 3;
  if (dueKey === dateKey) return 0;
  if (dueKey > dateKey) return 1;
  return 2;
}
