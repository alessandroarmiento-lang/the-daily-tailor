/**
 * Best-effort deep links for Apple Reminders / Calendar on macOS Safari.
 * Open native apps when possible; fall back to web/search URLs.
 */

/** Open a reminder in Apple Reminders (macOS). */
export function reminderDeepLink(id: string): string | undefined {
  const bare = id.trim();
  if (!bare) return undefined;
  return `x-apple-reminderkit://REMCDReminder/${encodeURIComponent(bare)}`;
}

/** Open an event in Apple Calendar (macOS). */
export function calendarEventDeepLink(id: string): string | undefined {
  const bare = id.trim();
  if (!bare) return undefined;
  // EventKit identifiers often contain a colon (calendar:event).
  return `ical://ekevent/${encodeURIComponent(bare)}`;
}
