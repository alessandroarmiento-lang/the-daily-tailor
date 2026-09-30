/**
 * Apple Reminders integration surface.
 *
 * This cloud VM has no EventKit / Reminders access.
 * `MockRemindersAdapter` ships for v1; on Mac, swap via REMINDERS_SOURCE
 * once EventKit, Shortcuts, or AppleScript adapters are implemented.
 */

export type ReminderPriority = "none" | "low" | "medium" | "high";

export type ReminderItem = {
  id: string;
  title: string;
  notes: string | null;
  listName: string;
  dueAt: string | null;
  isCompleted: boolean;
  priority: ReminderPriority;
};

export type RemindersBriefing = {
  items: ReminderItem[];
  /** Important open reminders not shown (A4 budget). */
  hiddenCount: number;
  fetchedAt: string;
  sourceLabel: string;
  isMock: boolean;
};

export type SectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; data?: T };

/**
 * Replaceable data source for open reminders belonging to an edition day.
 * Implementations: mock, EventKit / push / CalDAV.
 */
export interface RemindersAdapter {
  readonly id: string;
  readonly label: string;
  /** Open reminders for the newspaper day (`dateKey`, YYYY-MM-DD). */
  getTodaysOpenReminders(dateKey?: string): Promise<ReminderItem[]>;
}
