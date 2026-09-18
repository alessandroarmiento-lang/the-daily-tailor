/**
 * Best-effort deep links for Apple Reminders / Calendar on macOS Safari.
 * Open native apps when possible; fall back to web/search URLs.
 */

const REMINDER_UUID_RE =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

/** Open a reminder in Apple Reminders (macOS / iOS). */
export function reminderDeepLink(id: string): string | undefined {
  const bare = id.trim();
  if (!bare) return undefined;
  // EventKit / ReminderKit UUID → open that reminder.
  if (REMINDER_UUID_RE.test(bare)) {
    return `x-apple-reminderkit://REMCDReminder/${encodeURIComponent(bare)}`;
  }
  // iPhone Shortcut pushes listName|title (no Apple UUID) — open the app.
  return "x-apple-reminderkit://";
}

/** Open an event in Apple Calendar (macOS). */
export function calendarEventDeepLink(id: string): string | undefined {
  const bare = id.trim();
  if (!bare) return undefined;
  // EventKit identifiers often contain a colon (calendar:event).
  return `ical://ekevent/${encodeURIComponent(bare)}`;
}
