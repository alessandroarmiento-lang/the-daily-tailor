/**
 * Placeholder for a future Mac EventKit / Reminders integration.
 * Not used on this cloud VM — documents the swap contract only.
 */
import type { ReminderItem, RemindersAdapter } from "./types";

export class EventKitRemindersAdapter implements RemindersAdapter {
  readonly id = "eventkit";
  readonly label = "Apple Reminders (EventKit)";

  async getTodaysOpenReminders(): Promise<ReminderItem[]> {
    throw new Error(
      "EventKitRemindersAdapter requires a Mac host with Reminders access. Use MockRemindersAdapter on cloud/CI.",
    );
  }
}
