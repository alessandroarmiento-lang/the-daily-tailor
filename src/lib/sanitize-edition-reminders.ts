/**
 * Repair frozen edition snapshots whose Promemoria titles are stringified
 * Shortcut Dictionaries (safe no-op for clean data).
 */
import type { NewspaperEdition } from "@/lib/edition-types";
import { sanitizeReminderItems } from "@/lib/reminders/normalize-push";

export function sanitizeEditionReminders(
  edition: NewspaperEdition,
): { edition: NewspaperEdition; changed: boolean } {
  const briefing = edition.reminders?.data;
  if (!briefing || !Array.isArray(briefing.items) || briefing.items.length === 0) {
    return { edition, changed: false };
  }

  const { items, changed } = sanitizeReminderItems(briefing.items);
  if (!changed) return { edition, changed: false };

  return {
    changed: true,
    edition: {
      ...edition,
      reminders: {
        ...edition.reminders,
        data: {
          ...briefing,
          items,
        },
      },
    },
  };
}
