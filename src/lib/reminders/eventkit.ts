/**
 * Apple Reminders via EventKit Swift CLI (preferred) or AppleScript fallback.
 * AppleScript often hangs on iCloud reminder lists; EventKit is reliable.
 */
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import {
  runEventKitBinJson,
  runOsascriptJson,
} from "@/lib/apple/run-osascript";
import { rankReminders, remindersFetchPool } from "./rank";
import type { ReminderItem, RemindersAdapter } from "./types";

type ScriptResult = {
  ok: boolean;
  error?: string;
  items?: Array<{
    id: string;
    title: string;
    notes: string;
    listName: string;
    dueAt: string | null;
    priority: "none" | "low" | "medium" | "high";
  }>;
};

function mapItems(
  raw: NonNullable<ScriptResult["items"]>,
): ReminderItem[] {
  return raw.map((r) => ({
    id: r.id || `rem-${r.title}`,
    title: r.title,
    notes: r.notes || null,
    listName: r.listName || "Promemoria",
    dueAt: r.dueAt,
    isCompleted: false,
    priority: r.priority ?? "none",
  }));
}

export class EventKitRemindersAdapter implements RemindersAdapter {
  readonly id = "eventkit";
  label = "Apple Reminders";

  async getTodaysOpenReminders(): Promise<ReminderItem[]> {
    const poolSize = remindersFetchPool(config.reminders.maxItems);
    const cached = await readEditionCacheEnvelope<ReminderItem[]>("reminders");
    if (cached?.data) {
      return rankReminders(cached.data).slice(0, poolSize);
    }

    let result: ScriptResult;
    try {
      result = await runEventKitBinJson<ScriptResult>(
        "fetch-reminders-eventkit",
        [String(poolSize)],
        45_000,
      );
      this.label = "Apple Reminders (EventKit)";
    } catch (binErr) {
      // Fall back to AppleScript (often hangs — short timeout).
      try {
        result = await runOsascriptJson<ScriptResult>(
          "fetch-reminders.applescript",
          [String(Math.min(8, poolSize))],
          25_000,
        );
        this.label = "Apple Reminders (AppleScript)";
      } catch {
        const binMsg =
          binErr instanceof Error ? binErr.message : String(binErr);
        throw new Error(
          `Promemoria non disponibili. Compila EventKit tool (scripts/macos/build-eventkit-tools.sh) e autorizza Privacy → Promemoria. Dettaglio: ${binMsg.slice(0, 180)}`,
        );
      }
    }

    if (!result.ok) {
      throw new Error(result.error ?? "Promemoria: fetch fallito");
    }

    const ranked = rankReminders(mapItems(result.items ?? [])).slice(
      0,
      poolSize,
    );
    await writeEditionCache("reminders", ranked);
    return ranked;
  }
}
