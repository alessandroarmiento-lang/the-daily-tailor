/**
 * Reminders pushed from the iPhone (Shortcut → /api/reminders/ingest).
 * Preferred on the Mac-off host: CloudKit lists are invisible to CalDAV, so a
 * fresh phone snapshot beats an empty VTODO fetch. Falls back to CalDAV when
 * no push has arrived, and to a stale snapshot when CalDAV yields nothing.
 */
import { config } from "@/lib/config";
import {
  isPushedSnapshotFresh,
  loadPushedReminders,
  pushedSnapshotMaxAgeHours,
  PUSHED_DEVICE_LABEL,
  type PushedRemindersSnapshot,
} from "./ingest-store";
import { rankReminders, remindersFetchPool } from "./rank";
import type { ReminderItem, RemindersAdapter } from "./types";

function formatReceived(snapshot: PushedRemindersSnapshot): string {
  const received = new Date(snapshot.receivedAt);
  if (Number.isNaN(received.getTime())) return "";
  return new Intl.DateTimeFormat(config.locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.timezone,
  }).format(received);
}

function freshLabel(snapshot: PushedRemindersSnapshot): string {
  const when = formatReceived(snapshot);
  return when
    ? `${snapshot.deviceLabel} (Promemoria · ${when})`
    : `${snapshot.deviceLabel} (Promemoria)`;
}

function staleLabel(snapshot: PushedRemindersSnapshot): string {
  const when = formatReceived(snapshot);
  return when
    ? `${snapshot.deviceLabel} (snapshot vecchio · ${when})`
    : `${snapshot.deviceLabel} (snapshot vecchio)`;
}

export class PushedRemindersAdapter implements RemindersAdapter {
  readonly id = "push";
  label = `${PUSHED_DEVICE_LABEL} (Promemoria)`;

  constructor(private readonly fallback: RemindersAdapter | null = null) {}

  async getTodaysOpenReminders(): Promise<ReminderItem[]> {
    const poolSize = remindersFetchPool(config.reminders.maxItems);
    const snapshot = await loadPushedReminders();

    if (snapshot && isPushedSnapshotFresh(snapshot)) {
      this.label = freshLabel(snapshot);
      return rankReminders(snapshot.items).slice(0, poolSize);
    }

    if (!this.fallback) {
      if (snapshot) {
        this.label = staleLabel(snapshot);
        return rankReminders(snapshot.items).slice(0, poolSize);
      }
      throw new Error(
        `Nessun push dall'iPhone: esegui il Comando rapido "Promemoria → The Daily Tailor" (snapshot valido ${pushedSnapshotMaxAgeHours()}h).`,
      );
    }

    let fallbackItems: ReminderItem[] = [];
    let fallbackError: Error | null = null;
    try {
      fallbackItems = await this.fallback.getTodaysOpenReminders();
    } catch (err) {
      fallbackError = err instanceof Error ? err : new Error(String(err));
    }

    if (fallbackItems.length > 0) {
      this.label = this.fallback.label;
      return fallbackItems;
    }

    if (snapshot && snapshot.items.length > 0) {
      this.label = staleLabel(snapshot);
      return rankReminders(snapshot.items).slice(0, poolSize);
    }

    if (fallbackError) throw fallbackError;

    this.label = `${this.fallback.label} — nessun push dall'iPhone`;
    return fallbackItems;
  }
}
