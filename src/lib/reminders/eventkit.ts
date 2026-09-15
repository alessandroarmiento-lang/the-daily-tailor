/**
 * Apple Reminders via AppleScript (EventKit-backed Reminders.app).
 * Returns a pool (may exceed A4 max); getReminders ranks/caps + hiddenCount.
 */
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import { runOsascriptJson } from "@/lib/apple/run-osascript";
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

export class EventKitRemindersAdapter implements RemindersAdapter {
  readonly id = "eventkit";
  readonly label = "Apple Reminders";

  async getTodaysOpenReminders(): Promise<ReminderItem[]> {
    const poolSize = remindersFetchPool(config.reminders.maxItems);
    const cached = await readEditionCacheEnvelope<ReminderItem[]>("reminders");
    if (cached?.data) {
      return rankReminders(cached.data).slice(0, poolSize);
    }

    const result = await runOsascriptJson<ScriptResult>(
      "fetch-reminders.applescript",
      [String(poolSize)],
      60_000,
    );

    if (!result.ok) {
      throw new Error(result.error ?? "Promemoria: fetch fallito");
    }

    const items: ReminderItem[] = (result.items ?? []).map((r) => ({
      id: r.id || `rem-${r.title}`,
      title: r.title,
      notes: r.notes || null,
      listName: r.listName || "Promemoria",
      dueAt: r.dueAt,
      isCompleted: false,
      priority: r.priority ?? "none",
    }));

    const ranked = rankReminders(items).slice(0, poolSize);
    await writeEditionCache("reminders", ranked);
    return ranked;
  }
}
