import type { ReminderItem } from "./types";
import { capRanked } from "@/lib/section-overflow";

const PRIORITY_SCORE: Record<ReminderItem["priority"], number> = {
  high: 400,
  medium: 250,
  low: 100,
  none: 0,
};

/** Higher = more important for the A4 Promemoria slot. */
export function reminderImportanceScore(item: ReminderItem): number {
  let score = PRIORITY_SCORE[item.priority] ?? 0;
  if (item.dueAt) {
    score += 80;
    const due = new Date(item.dueAt).getTime();
    if (!Number.isNaN(due)) {
      // Earlier due today ranks higher.
      score += Math.max(0, 40 - Math.floor(due / 3_600_000) % 40);
    }
  }
  if (item.notes) score += 10;
  return score;
}

export function rankReminders(items: ReminderItem[]): ReminderItem[] {
  return [...items]
    .filter((r) => !r.isCompleted)
    .sort((a, b) => {
      const d = reminderImportanceScore(b) - reminderImportanceScore(a);
      if (d !== 0) return d;
      const aDue = a.dueAt ?? "";
      const bDue = b.dueAt ?? "";
      return aDue.localeCompare(bDue);
    });
}

export function rankAndCapReminders(
  items: ReminderItem[],
  maxVisible: number,
): { items: ReminderItem[]; hiddenCount: number } {
  return capRanked(rankReminders(items), maxVisible);
}

/** Pool size to fetch so hiddenCount can be meaningful. */
export function remindersFetchPool(maxVisible: number): number {
  return Math.max(20, maxVisible * 5);
}
